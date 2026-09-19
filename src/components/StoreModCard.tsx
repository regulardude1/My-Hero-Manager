import { useState, useEffect, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, ExternalLink, Info, Gamepad2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────────────────
export type StoreSource = "discord" | "nexus" | "gamebanana";

export interface StoreFile {
  url: string;
  label: string;
  date?: string;
  direct: boolean;
  origin: "link" | "file";
  nexusFileId?: number;
}

export interface StoreCardMod {
  title: string;
  author: string;
  thumbnail: string | null;
  tags: string[];      // body tag row (Discord character tags, GameBanana tags, Nexus none)
  typeTags: string[];  // thumbnail badges (Discord only)
  links: StoreFile[];  // initial items (Discord links; others empty)
  fetchMore?: () => Promise<StoreFile[]>; // lazy file list fetch
  nexusModId?: number;
  external?: { label: string; onClick: () => void };
}

interface StoreModCardProps {
  source: StoreSource;
  mod: StoreCardMod;
  token: string;
  onDownloadedUrl: (url: string) => void;
  downloadedUrls: Set<string>;
  localMods: any[];
}

// ── Per-store accent ─────────────────────────────────────────────────────────────────────
const ACCENTS: Record<StoreSource, { hoverBorder: string; fallback: string; mainBtn: string }> = {
  discord: {
    hoverBorder: "hover:border-[#5865F2]/40",
    fallback: "",
    mainBtn: "bg-[#5865F2] hover:bg-[#4752C4] text-hero-text text-xs font-bold",
  },
  nexus: {
    hoverBorder: "hover:border-[#DA8F44]/40",
    fallback: "📦",
    mainBtn: "bg-[#DA8F44] hover:bg-[#b87838] text-hero-text text-xs font-black",
  },
  gamebanana: {
    hoverBorder: "hover:border-yellow-500/40",
    fallback: "🍌",
    mainBtn: "bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black",
  },
};

// ── Shared Mod Card (Discord / Nexus / GameBanana stores) ───────────────────────────────
export const StoreModCard = memo(function StoreModCard({ source, mod, token, onDownloadedUrl, downloadedUrls, localMods }: StoreModCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [status, setStatus] = useState<{text: string; ok: boolean} | null>(null);
  const [imgError, setImgError] = useState(false);
  const [files, setFiles] = useState<StoreFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const accent = ACCENTS[source];

  useEffect(() => {
    setImgError(false);
  }, [mod.thumbnail]);

  const fetchFiles = async () => {
    if (!mod.fetchMore || files.length > 0) return;
    setLoadingFiles(true);
    try {
      setFiles(await mod.fetchMore());
    } catch (e) {
      console.error("Failed to fetch store files", e);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleExpand = () => {
    if (!expanded) fetchFiles();
    setExpanded(!expanded);
  };

  // ── Downloaded detection (per source) ──────────────────────────────────────────────
  const getBaseUrl = (u: string) => {
    try {
      const parsed = new URL(u);
      return parsed.origin + parsed.pathname;
    } catch { return u; }
  };

  const isDownloaded = (item: StoreFile) => {
    if (source === "discord") {
      const baseUrl = getBaseUrl(item.url);
      if (Array.from(downloadedUrls).some(u => getBaseUrl(u) === baseUrl)) return true;
      if (localMods) {
        if (localMods.some(m => m.url && getBaseUrl(m.url) === baseUrl)) return true;
        try {
          const filename = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || '');
          if (filename) {
            const matches = localMods.some(m => {
              if (!m.pak_name) return false;
              const matchName = m.pak_name === filename || m.pak_name.replace(/_$/, '') === filename;
              if (!matchName) return false;
              if (m.url && (m.url.includes("discordapp.com") || m.url.includes("discordapp.net"))) {
                return getBaseUrl(m.url) === baseUrl;
              }
              return true;
            });
            if (matches) return true;
          }
        } catch {}
      }
      return false;
    }

    if (source === "nexus") {
      const filename = item.label;
      if (downloadedUrls.has(filename)) return true;
      if (localMods) {
        return localMods.some(m => m.pak_name === filename
          || m.pak_name === filename.replace(/\.zip$/, '.pak')
          || m.pak_name === filename.replace(/\.rar$/, '.pak')
          || m.pak_name === filename.replace(/\.7z$/, '.pak'));
      }
      return false;
    }

    // gamebanana
    if (downloadedUrls.has(item.url)) return true;
    if (localMods && localMods.some(m => m.url === item.url)) return true;
    try {
      const filename = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || '');
      if (filename && localMods?.some(m => m.pak_name && (m.pak_name === filename || m.pak_name.replace(/_$/, '') === filename))) return true;
    } catch {}
    return false;
  };

  const anyLinkDownloaded = mod.links.some(item => isDownloaded(item));

  // ── Nexus download events (from the Rust webview popup) ─────────────────────────────
  const downloadingRef = useRef(downloading);
  useEffect(() => { downloadingRef.current = downloading; }, [downloading]);
  const onDownloadedUrlRef = useRef(onDownloadedUrl);
  useEffect(() => { onDownloadedUrlRef.current = onDownloadedUrl; }, [onDownloadedUrl]);

  useEffect(() => {
    if (source !== "nexus") return;
    let unlistenComplete: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    listen<{success: boolean; message: string; fileName: string}>("nexus-download-complete", async (event) => {
      if (downloadingRef.current !== event.payload.fileName) return;

      if (event.payload.message === "LOGIN_REQUIRED") {
        setStatus({ text: "Login required for free users. Please log in and try downloading again.", ok: false });
        setDownloading(null);
        await invoke("open_nexus_login");
        return;
      }

      setStatus({ text: event.payload.message, ok: event.payload.success });
      if (event.payload.success) {
        onDownloadedUrlRef.current(event.payload.fileName);
      }
      setDownloading(null);
    }).then(fn => { unlistenComplete = fn; });

    listen<{message: string; fileName: string}>("nexus-download-status", (event) => {
      if (downloadingRef.current === event.payload.fileName) {
        setStatus({ text: event.payload.message, ok: true });
      }
    }).then(fn => { unlistenStatus = fn; });

    return () => {
      if (unlistenComplete) unlistenComplete();
      if (unlistenStatus) unlistenStatus();
    };
  }, [source]);

  // ── Download (per source) ────────────────────────────────────────────────────────────
  const handleDownload = async (item: StoreFile) => {
    setDownloading(item.url);
    setStatus(null);
    let waitEvent = false;
    try {
      if (source === "discord") {
        let result;
        if (item.origin === "file") {
          result = await invoke<string>("download_url_mod", {
            url: item.url, fileName: item.label, modTitle: mod.title, modAuthor: mod.author
          });
        } else {
          result = await invoke<string>("download_discord_mod", {
            token, url: item.url, modTitle: mod.title, modAuthor: mod.author
          });
        }
        setStatus({ text: result, ok: true });
        onDownloadedUrl(item.url);
      } else if (source === "nexus") {
        // Try the API download directly first (works for Premium users)
        const linkRes = await fetch(`https://api.nexusmods.com/v1/games/myheroultrarumble/mods/${mod.nexusModId}/files/${item.nexusFileId}/download_link.json`, {
          headers: { apikey: token }
        });
        const links = await linkRes.json();

        if (Array.isArray(links) && links.length > 0 && links[0].URI) {
          const result = await invoke<string>("download_url_mod", {
            url: links[0].URI, fileName: item.label, modTitle: mod.title, modAuthor: mod.author || "Unknown"
          });
          setStatus({ text: result, ok: true });
          onDownloadedUrl(item.label);
          setDownloading(null);
          return;
        }

        // Free user — open a hidden webview to the Nexus files page; the Rust backend
        // intercepts the download and installs the mod automatically.
        // Status will update when the nexus-download-complete event fires.
        setStatus({ text: "Fetching download directly...", ok: true });
        await invoke("open_nexus_download", {
          modId: mod.nexusModId,
          fileId: item.nexusFileId,
          fileName: item.label,
          modTitle: mod.title,
          modAuthor: mod.author || "Unknown"
        });
        // Keep `downloading` set — the event handler clears it. Resetting it here
        // would make the completion event arrive and be ignored (downloadingRef is null).
        waitEvent = true;
        return;
      } else {
        const result = await invoke<string>("download_url_mod", {
          url: item.url, fileName: item.label, modTitle: mod.title, modAuthor: mod.author
        });
        setStatus({ text: result, ok: true });
        onDownloadedUrl(item.url);
      }
    } catch (e: any) {
      setStatus({ text: String(e), ok: false });
    } finally {
      if (!waitEvent) setDownloading(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────────────
  return (
    <div
      className={`bg-hero-card border border-hero-border rounded-xl overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-1 ${accent.hoverBorder} transition-all duration-300 flex flex-col`}
    >
      <div className="relative w-full aspect-video bg-black/40">
        {mod.thumbnail && !imgError ? (
          <img src={mod.thumbnail} alt={mod.title} loading="lazy" className="w-full h-full object-cover" onError={() => setImgError(true)}/>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-hero-text/20 text-4xl">
            {source === "discord" ? <Gamepad2 className="w-12 h-12 opacity-50"/> : accent.fallback}
          </div>
        )}
        {source === "discord" && mod.typeTags.length > 0 && (
          <div className="absolute top-2 left-2 flex gap-1">
            {mod.typeTags.map(t => (
              <span key={t} className="px-2 py-0.5 bg-[#5865F2]/80 text-hero-text text-[10px] font-bold rounded-full backdrop-blur-sm">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <h3 className="font-bold text-hero-text text-sm leading-tight line-clamp-2">{mod.title}</h3>
        <p className="text-xs text-hero-muted">by <span className="text-hero-text/60">{mod.author}</span></p>

        {mod.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {mod.tags.map(t => (
              <span key={t} className={`px-2 py-0.5 bg-hero-surface text-[10px] rounded-full border border-hero-border ${source === "gamebanana" ? "text-yellow-300" : "text-[#a0c4ff]"}`}>
                {source === "discord" ? `👤 ${t}` : t}
              </span>
            ))}
          </div>
        )}

        {source === "discord" && anyLinkDownloaded ? (
          <button
            onClick={handleExpand}
            className="mt-auto w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-hero-text text-xs font-bold py-2 rounded-lg transition-all"
          >
            ✅ Downloaded
          </button>
        ) : (
          <button
            onClick={handleExpand}
            className={`mt-auto w-full flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${accent.mainBtn}`}
          >
            <Download size={12}/>
            {source === "discord"
              ? (mod.links.length > 0 ? `${mod.links.length} Download${mod.links.length > 1 ? "s" : ""}` : "View Thread")
              : (expanded ? "Hide Downloads" : "View Downloads")}
          </button>
        )}

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {source === "discord" && mod.links.length === 0 && (
              <p className="text-xs text-hero-muted text-center py-2">No direct download links found</p>
            )}

            {mod.links.map((item, i) => {
              if (source === "discord" && item.url.includes("gamebanana.com/mods/")) return null;
              const isLoading = downloading === item.url;
              const downloaded = isDownloaded(item);
              const dateStr = item.date ? new Date(item.date).toLocaleString() : "";
              return (
                <button
                  key={i}
                  disabled={isLoading}
                  title={dateStr ? `Posted: ${dateStr}` : undefined}
                  onClick={() => item.direct ? handleDownload(item) : window.open(item.url, "_blank")}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${item.direct
                        ? (downloaded
                            ? "bg-blue-800 hover:bg-blue-700 text-blue-100 border border-blue-600/50"
                            : "bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/20")
                        : "bg-hero-surface hover:bg-hero-surfaceHover text-hero-textSecondary border border-hero-border"}`}
                >
                  {item.direct ? <Download size={12}/> : <ExternalLink size={12}/>}
                  <span className="truncate flex-1 text-left pr-2">
                    {isLoading ? "Installing..." : item.label}
                  </span>
                  {item.date && (
                    <div title={dateStr ? `Posted: ${dateStr}` : `No Date Found`} className="flex items-center text-blue-300 hover:text-hero-text transition-colors">
                      <Info size={14} />
                    </div>
                  )}
                  {downloaded && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 ml-2">Installed</span>}
                </button>
              );
            })}

            {loadingFiles && <p className="text-xs text-hero-muted text-center py-2">{source === "discord" ? "Loading GameBanana files..." : "Loading files..."}</p>}
            {source !== "discord" && !loadingFiles && files.length === 0 && (
              <p className="text-xs text-hero-muted text-center py-2">No files available</p>
            )}

            {files.map((item, i) => {
              const isLoading = downloading === item.url;
              const downloaded = isDownloaded(item);
              return (
                <button
                  key={`${source}-${i}`}
                  disabled={isLoading}
                  onClick={() => handleDownload(item)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${downloaded
                        ? "bg-blue-800 hover:bg-blue-700 text-blue-100 border border-blue-600/50"
                        : "bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/20"}`}
                >
                  <Download size={12}/>
                  <span className="truncate flex-1 text-left">{isLoading ? "Installing..." : `${source === "discord" ? "🍌 " : ""}⬇ ${item.label}`}</span>
                  {downloaded && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Installed</span>}
                </button>
              );
            })}

            {mod.external && (
              <button
                onClick={mod.external.onClick}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-hero-surface hover:bg-hero-surfaceHover text-hero-textSecondary border border-hero-border transition-all mt-2"
              >
                <ExternalLink size={12} /> {mod.external.label}
              </button>
            )}

            {status && (
              <div className={`text-xs p-2 rounded-lg ${source !== "discord" ? "mt-2" : ""} ${status.ok ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
                {status.ok ? "✅ " : "❌ "}{status.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
