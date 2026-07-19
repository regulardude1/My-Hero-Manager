import { useState, useEffect, useCallback, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, LogIn, Download, ExternalLink, Search, RefreshCw, LogOut, ChevronDown, Check, Filter } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────────────────
interface RawThread {
  id: string;
  name: string;
  owner_id?: string;
  parent_id?: string;
  applied_tags?: string[];
  last_message_id?: string;
  message?: any;
}

interface DiscordMod {
  id: string;
  title: string;
  thumbnail: string | null;
  links: string[];
  author: string;
  content: string;
  tags: string[];
  channel_id: string;
}

interface ChannelData {
  threads: RawThread[];
  sfw_channel_ids: string[];
  nsfw_channel_ids: string[];
  channel_tags: Record<string, Record<string, string>>;
  guild_id: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────
const TYPE_TAGS = new Set(["commission","skin","interface","vfx","animation","audio","environment","misc"]);
const DOMAIN_LABELS: Record<string,string> = {
  "drive.google.com": "Google Drive",
  "mega.nz": "MEGA",
  "mega.co.nz": "MEGA",
  "mediafire.com": "MediaFire",
  "dropbox.com": "Dropbox",
  "pixeldrain.com": "Pixeldrain",
  "gofile.io": "GoFile",
  "onedrive.live.com": "OneDrive",
  "1drv.ms": "OneDrive",
  "patreon.com": "Patreon",
  "ko-fi.com": "Ko-Fi",
  "gumroad.com": "Gumroad",
  "gamebanana.com": "GameBanana",
};

function isDirect(url: string) {
  return url.includes("cdn.discordapp.com") || url.includes("media.discordapp.net") ||
    /\.(pak|zip|rar|7z)(\?|$)/i.test(url);
}

function linkLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace("www.","");
    for (const [k,v] of Object.entries(DOMAIN_LABELS)) if (host.includes(k)) return v;
    if (isDirect(url)) {
      const fn = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "file");
      return fn.length > 40 ? fn.slice(0,37)+"..." : fn;
    }
    return host;
  } catch { return "Link"; }
}

function processMessages(thread: RawThread, msgs: any[], channelTags: Record<string,Record<string,string>>): DiscordMod {
  const chronoMsgs = [...msgs].reverse();
  const opId = thread.owner_id ?? chronoMsgs[0]?.author?.id;
  let thumbnail: string | null = null;
  const links: string[] = [];
  const seen = new Set<string>();

  const addLink = (l: string) => { if (!seen.has(l)) { seen.add(l); links.push(l); } };

  const opMsg = chronoMsgs.find(m => m.author?.id === opId) || chronoMsgs[0];

  if (thread.message) {
    for (const a of thread.message.attachments ?? []) {
      if (/image\//i.test(a.content_type ?? "") || /\.(png|jpg|jpeg|webp|gif)$/i.test(a.filename ?? "")) {
        thumbnail = a.url; break;
      }
      if (/video\//i.test(a.content_type ?? "") || /\.(mp4|webm|mov)$/i.test(a.filename ?? "")) {
        const p = a.proxy_url ?? a.url;
        thumbnail = p + (p.includes("?") ? "&format=jpeg" : "?format=jpeg"); break;
      }
    }
    if (!thumbnail) {
      for (const e of thread.message.embeds ?? []) {
        if (e.image?.url) { thumbnail = e.image.url; break; }
        if (e.thumbnail?.url) { thumbnail = e.thumbnail.url; break; }
      }
    }
  }

  for (const m of chronoMsgs) {
    if (!thumbnail) {
      for (const a of m.attachments ?? []) {
        if (/image\//i.test(a.content_type ?? "") || /\.(png|jpg|jpeg|webp|gif)$/i.test(a.filename ?? "")) {
          thumbnail = a.url; break;
        }
        if (/video\//i.test(a.content_type ?? "") || /\.(mp4|webm|mov)$/i.test(a.filename ?? "")) {
          const p = a.proxy_url ?? a.url;
          thumbnail = p + (p.includes("?") ? "&format=jpeg" : "?format=jpeg"); break;
        }
      }
    }
    if (!thumbnail) {
      for (const e of m.embeds ?? []) {
        if (e.image?.url) { thumbnail = e.image.url; break; }
        if (e.thumbnail?.url) { thumbnail = e.thumbnail.url; break; }
      }
    }
    const httpUrls = (m.content ?? "").match(/https?:\/\/[^\s>"']+/gi) ?? [];
    for (const e of m.embeds ?? []) {
      if (e.url && !httpUrls.includes(e.url)) httpUrls.push(e.url);
      const descUrls = (e.description ?? "").match(/https?:\/\/[^\s>"']+/gi) ?? [];
      for (const u of descUrls) {
        if (!httpUrls.includes(u)) httpUrls.push(u);
      }
    }
    const rawUrls = (m.content ?? "").match(/(?:mega\.nz|mega\.co\.nz|drive\.google\.com|mediafire\.com|dropbox\.com|pixeldrain\.com|gofile\.io|onedrive\.live\.com|1drv\.ms|patreon\.com|ko-fi\.com|gumroad\.com|gamebanana\.com)[^\s>"']+/gi) ?? [];
    
    const combinedUrls = [...httpUrls];
    for (const r of rawUrls) {
      if (!combinedUrls.some(u => u.includes(r))) {
        combinedUrls.push("https://" + r);
      }
    }

    for (let u of combinedUrls) {
      u = u.replace(/[)*\]'",.]+$/, "");
      const lo = u.toLowerCase();
      const isArch = /\.(pak|zip|rar|7z)(\?|$)/.test(lo.split("?")[0]);
      const isHost = Object.keys(DOMAIN_LABELS).some(h => lo.includes(h));
      if (isArch || isHost) addLink(u);
    }
    for (const a of m.attachments ?? []) {
      const urlMatches = /\.(pak|zip|rar|7z)(\?|$)/i.test(a.url.split("?")[0]);
      const nameMatches = /\.(pak|zip|rar|7z)$/i.test(a.filename ?? "");
      if (urlMatches || nameMatches) {
        addLink(a.url);
      }
    }
  }

  const tagMap = channelTags[thread.parent_id ?? ""] ?? {};
  const tags = (thread.applied_tags ?? []).map((t: string) => tagMap[t]).filter(Boolean);

  return {
    id: thread.id,
    title: thread.name ?? "Unknown Mod",
    thumbnail,
    links,
    author: opMsg?.author?.username ?? "Unknown",
    content: opMsg?.content ?? "",
    tags,
    channel_id: thread.parent_id ?? "",
  };
}

// ── Login Modal ──────────────────────────────────────────────────────────────────────────
function LoginModal({ onLogin, onCancel }: { onLogin: (token: string) => void; onCancel: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [manualToken, setManualToken] = useState("");

  useEffect(() => {
    const unlisten = listen<string>("discord-token-found", async (event) => {
      const t = event.payload.trim();
      if (!t) return;
      try {
        await invoke("validate_discord_token", { token: t });
        await invoke("save_discord_token", { token: t });
        onLogin(t);
      } catch (e: any) {
        setError("Failed to validate extracted token: " + String(e));
        setLoading(false);
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [onLogin]);

  const handleOpenLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("open_discord_login");
    } catch (e: any) {
      setError(String(e));
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    const t = manualToken.trim();
    if (!t) { setError("Please enter your Discord token."); return; }
    setLoading(true); setError("");
    try {
      await invoke("validate_discord_token", { token: t });
      await invoke("save_discord_token", { token: t });
      onLogin(t);
    } catch (e: any) {
      setError(String(e));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-gradient-to-br from-[#1a1a2e] to-[#0d0d1a] border border-white/10 rounded-2xl shadow-2xl p-8">
        <button onClick={onCancel} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"><X size={20}/></button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-[#5865F2] flex items-center justify-center text-white text-2xl font-black">D</div>
          <div>
            <h2 className="text-xl font-black text-white">Discord Login</h2>
            <p className="text-xs text-white/40">Securely sign in via Discord</p>
          </div>
        </div>

        <div className="mb-4 text-sm text-white/70">
          <strong>Option 1:</strong> Automatically securely extract your token via a login window.
        </div>

        <button
          onClick={handleOpenLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-all duration-200"
        >
          <LogIn size={16}/>
          {loading ? "Waiting for sign in..." : "Open Browser Login"}
        </button>

        <div className="flex items-center my-6 gap-3">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-xs text-white/40 font-bold uppercase tracking-widest">OR</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2 block">Option 2: Manual Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
              placeholder="Paste your token here..."
              className="flex-1 bg-black/40 border border-white/10 text-white text-sm px-4 py-2.5 rounded-lg outline-none focus:border-[#5865F2] transition-colors placeholder:text-white/20"
            />
            <button
              onClick={handleManualSubmit}
              disabled={loading || !manualToken.trim()}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold rounded-lg transition-all text-sm whitespace-nowrap"
            >
              Verify
            </button>
          </div>
          <p className="mt-2 text-[10px] text-white/30 leading-relaxed">
            Find it in Browser DevTools (F12) → Network → Filter "api" → Request Headers → "Authorization".
          </p>
        </div>

        {error && <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">{error}</div>}

        <p className="mt-4 text-center text-xs text-white/30">
          Your token is encrypted before being saved to disk.
        </p>
      </div>
    </div>
  );
}

// ── Mod Card ─────────────────────────────────────────────────────────────────────────────
const ModCard = memo(function ModCard({ mod, token, onDownloadedUrl, downloadedUrls, localMods }: { mod: DiscordMod; token: string; onDownloadedUrl: (url: string) => void; downloadedUrls: Set<string>; localMods: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [status, setStatus] = useState<{text: string; ok: boolean} | null>(null);
  const [imgError, setImgError] = useState(false);
  const [gbFiles, setGbFiles] = useState<{url: string, label: string}[]>([]);
  const [loadingGb, setLoadingGb] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [mod.thumbnail]);

  useEffect(() => {
    if (!expanded) return;
    const gbLinks = mod.links.filter(l => l.includes("gamebanana.com/mods/"));
    if (gbLinks.length === 0 || gbFiles.length > 0) return;

    let isMounted = true;
    const fetchGb = async () => {
      setLoadingGb(true);
      const fetched: {url: string, label: string}[] = [];
      try {
        for (const link of gbLinks) {
          const m = link.match(/gamebanana\.com\/mods\/(\d+)/i);
          if (!m) continue;
          const id = m[1];
          const res = await fetch(`https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${id}&fields=name,Files().aFiles()`);
          const data = await res.json();
          if (data && data[1]) {
            const files = Object.values(data[1]) as any[];
            for (const f of files) {
              fetched.push({ url: f._sDownloadUrl, label: f._sFile });
            }
          }
        }
        if (isMounted) setGbFiles(fetched);
      } catch (e) {
        console.error("GameBanana fetch error", e);
      } finally {
        if (isMounted) setLoadingGb(false);
      }
    };
    fetchGb();
    return () => { isMounted = false; };
  }, [expanded, mod.links, gbFiles.length]);

  const typeTags = mod.tags.filter(t => TYPE_TAGS.has(t.toLowerCase()));
  const charTags = mod.tags.filter(t => !TYPE_TAGS.has(t.toLowerCase()));
  
  const checkIsDownloaded = (url: string) => {
    if (downloadedUrls.has(url)) return true;
    if (localMods && localMods.some(m => m.url === url)) return true;
    try {
      const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
      if (filename && localMods.some(m => m.pak_name && (m.pak_name === filename || m.pak_name.replace(/_$/, '') === filename))) return true;
    } catch {}
    return false;
  };
  
  const isModDownloaded = mod.links.some(url => checkIsDownloaded(url));

  const handleDownload = async (url: string, explicitFileName?: string) => {
    setDownloading(url);
    setStatus(null);
    try {
      let result;
      if (explicitFileName) {
        result = await invoke<string>("download_url_mod", {
          url, fileName: explicitFileName, modTitle: mod.title, modAuthor: mod.author
        });
      } else {
        result = await invoke<string>("download_discord_mod", {
          token, url, modTitle: mod.title, modAuthor: mod.author
        });
      }
      setStatus({ text: result, ok: true });
      onDownloadedUrl(url);
    } catch (e: any) {
      setStatus({ text: String(e), ok: false });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div 
      className="bg-hero-card/60 border border-white/5 rounded-xl overflow-hidden hover:border-[#5865F2]/40 transition-all duration-300 flex flex-col"
    >
      <div className="relative w-full aspect-video bg-black/40">
        {mod.thumbnail && !imgError ? (
          <img src={mod.thumbnail} alt={mod.title} loading="lazy" className="w-full h-full object-cover" onError={() => setImgError(true)}/>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-4xl">🎮</div>
        )}
        {typeTags.length > 0 && (
          <div className="absolute top-2 left-2 flex gap-1">
            {typeTags.map(t => (
              <span key={t} className="px-2 py-0.5 bg-[#5865F2]/80 text-white text-[10px] font-bold rounded-full backdrop-blur-sm">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <h3 className="font-bold text-white text-sm leading-tight line-clamp-2">{mod.title}</h3>
        <p className="text-xs text-white/40">by <span className="text-white/60">{mod.author}</span></p>

        {charTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {charTags.map(t => (
              <span key={t} className="px-2 py-0.5 bg-white/5 text-[#a0c4ff] text-[10px] rounded-full border border-white/10">👤 {t}</span>
            ))}
          </div>
        )}

        {isModDownloaded ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-auto w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-lg transition-all"
          >
            ✅ Downloaded
          </button>
        ) : (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-auto w-full flex items-center justify-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold py-2 rounded-lg transition-all"
          >
            <Download size={12}/>
            {mod.links.length > 0 ? `${mod.links.length} Download${mod.links.length > 1 ? "s" : ""}` : "View Thread"}
          </button>
        )}

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {mod.links.length === 0 && (
              <p className="text-xs text-white/40 text-center py-2">No direct download links found</p>
            )}
            {mod.links.map((url, i) => {
              if (url.includes("gamebanana.com/mods/")) return null;
              const direct = isDirect(url);
              const label = linkLabel(url);
              const isLoading = downloading === url;
              const isDownloaded = checkIsDownloaded(url);
              return (
                <button
                  key={i}
                  disabled={isLoading}
                  onClick={() => direct ? handleDownload(url) : window.open(url, "_blank")}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${direct 
                        ? (isDownloaded 
                            ? "bg-blue-800 hover:bg-blue-700 text-blue-100 border border-blue-600/50" 
                            : "bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/20")
                        : "bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"}`}
                >
                  {direct ? <Download size={12}/> : <ExternalLink size={12}/>}
                  <span className="truncate flex-1 text-left">{isLoading ? "Installing..." : (direct ? `⬇ ${label}` : label)}</span>
                  {isDownloaded && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Installed</span>}
                </button>
              );
            })}
            
            {loadingGb && <p className="text-xs text-white/40 text-center py-2">Loading GameBanana files...</p>}
            
            {gbFiles.map((f, i) => {
              const url = f.url;
              const label = f.label;
              const isLoading = downloading === url;
              const isDownloaded = checkIsDownloaded(url);
              return (
                <button
                  key={"gb"+i}
                  disabled={isLoading}
                  onClick={() => handleDownload(url, label)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${isDownloaded 
                        ? "bg-blue-800 hover:bg-blue-700 text-blue-100 border border-blue-600/50" 
                        : "bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/20"}`}
                >
                  <Download size={12}/>
                  <span className="truncate flex-1 text-left">{isLoading ? "Installing..." : `🍌 ⬇ ${label}`}</span>
                  {isDownloaded && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Installed</span>}
                </button>
              );
            })}
            {status && (
              <div className={`text-xs p-2 rounded-lg ${status.ok ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
                {status.ok ? "✅ " : "❌ "}{status.text}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});


// ── Cache Helpers ────────────────────────────────────────────────────────────────────────
function isDiscordUrlExpired(url?: string): boolean {
  if (!url) return false;
  const match = url.match(/ex=([0-9a-fA-F]+)/);
  if (!match) return false;
  const expiryTimestampMs = parseInt(match[1], 16) * 1000;
  return Date.now() + 2 * 60 * 60 * 1000 > expiryTimestampMs;
}

function loadModsFromCache(guildId: string, nsfw: boolean): { mods: DiscordMod[]; tags: string[] } | null {
  try {
    const key = `discord_store_${guildId}_${nsfw ? 'nsfw' : 'sfw'}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.mods?.length) return { mods: parsed.mods, tags: parsed.tags || [] };
    }
  } catch {}
  return null;
}

function saveModsToCache(guildId: string, mods: DiscordMod[], tags: string[], nsfw: boolean) {
  try {
    const key = `discord_store_${guildId}_${nsfw ? 'nsfw' : 'sfw'}`;
    localStorage.setItem(key, JSON.stringify({ mods, tags, timestamp: Date.now() }));
  } catch {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('mod_')) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
      const key2 = `discord_store_${guildId}_${nsfw ? 'nsfw' : 'sfw'}`;
      localStorage.setItem(key2, JSON.stringify({ mods, tags, timestamp: Date.now() }));
    } catch {}
  }
}

const SUPPORTED_GUILDS: Record<string, { name: string, icon: string }> = {
  "1256679541112311809": { name: "Discord / Endeavor HQ", icon: "https://cdn.discordapp.com/icons/1256679541112311809/a_07a0fed86beeb9fa64195129e3125182.webp?size=3072&animated=true" },
  "1508333307354415245": { name: "Discord / Momo's Castle", icon: "https://cdn.discordapp.com/icons/1508333307354415245/c99d5867ff794f847fc563a84d9e4def.webp?size=3072" }
};

// ── Main Discord Store Panel ────────────────────────────────────────────────
export default function DiscordStore({ localMods = [], allow18Plus = true, onModInstalled }: { localMods?: any[], allow18Plus?: boolean, onModInstalled?: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [mods, setMods] = useState<DiscordMod[]>([]);
  const [allMods, setAllMods] = useState<DiscordMod[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Click Refresh to load mods");
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [downloadedUrls, setDownloadedUrls] = useState<Set<string>>(new Set());
  const [isNsfw, setIsNsfw] = useState(false);
  const [cardSize, setCardSize] = useState(() => {
    try {
      const stored = localStorage.getItem("global_card_size");
      return stored ? Number(stored) : 240;
    } catch {
      return 240;
    }
  });

  useEffect(() => {
    if (allow18Plus === false && isNsfw) {
      setIsNsfw(false);
    }
  }, [allow18Plus, isNsfw]);

  const [fullyLoaded, setFullyLoaded] = useState(false);
  const [sortOrder, setSortOrder] = useState(() => {
    try {
      const stored = localStorage.getItem("discord_sort_order");
      return stored || "latest";
    } catch {
      return "latest";
    }
  });
  const [loadProgress, setLoadProgress] = useState(0);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [activeSource, setActiveSource] = useState("1256679541112311809");
  const [availableGuilds, setAvailableGuilds] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoLoadRef = useRef<{ runId: number; cancelled: boolean }>({ runId: 0, cancelled: false });
  const searchRef = useRef(search);
  const fetchedLinksRef = useRef<Set<string>>(new Set());

  useEffect(() => { searchRef.current = search; }, [search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showSourceDropdown && !(e.target as Element).closest('.source-dropdown')) {
        setShowSourceDropdown(false);
      }
      if (showTagDropdown && !(e.target as Element).closest('.discord-filter-dropdown')) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSourceDropdown, showTagDropdown]);

  const handleDownloadedUrl = useCallback((url: string) => {
    setDownloadedUrls(prev => {
      const next = new Set(prev).add(url);
      return next;
    });
    onModInstalled?.();
  }, [onModInstalled]);

  useEffect(() => {
    const handleModDeleted = () => setDownloadedUrls(new Set());
    window.addEventListener("mod-deleted", handleModDeleted);
    return () => window.removeEventListener("mod-deleted", handleModDeleted);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await invoke<string>("load_discord_token");
        if (t) {
          setToken(t);
          const userData = await invoke<any>("validate_discord_token", { token: t });
          setUsername(userData.username);
          if (userData.guilds) {
            const valid = userData.guilds.filter((g: any) => SUPPORTED_GUILDS[g.id]);
            setAvailableGuilds(valid);
            if (valid.length > 0 && !valid.find((g: any) => g.id === "1256679541112311809")) {
              setActiveSource(valid[0].id);
            }
          }
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let result = allMods;
    const directLinkMatch = search.trim().match(/discord(?:app)?\.com\/channels\/\d+\/(\d+)/i);
    
    if (directLinkMatch) {
      const threadId = directLinkMatch[1];
      result = result.filter(m => m.id === threadId);
      
      if (result.length === 0 && token && !fetchedLinksRef.current.has(threadId)) {
        fetchedLinksRef.current.add(threadId);
        (async () => {
          try {
            setStatus("Fetching linked mod...");
            const rawThread = await invoke<any>("fetch_discord_thread", { token, threadId });
            const msgs = await invoke<any[]>("fetch_thread_messages", {
              token, threadId, lastMessageId: rawThread.last_message_id || null, ignoreCache: false
            });
            if (msgs && msgs.length > 0) {
              const freshMod = processMessages(rawThread, msgs, {});
              setAllMods(prev => {
                const next = [...prev];
                const idx = next.findIndex(m => m.id === freshMod.id);
                if (idx >= 0) next[idx] = freshMod;
                else next.unshift(freshMod);
                return next;
              });
              setStatus("Linked mod loaded.");
            } else {
              setStatus("Linked mod has no messages.");
            }
          } catch (e: any) {
            setStatus(`Link Error: ${e}`);
          }
        })();
      }
    } else if (search.trim()) {
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(m => {
        const searchableText = [m.title, m.author, m.content, ...m.tags].join(" ").toLowerCase();
        return terms.every(term => searchableText.includes(term));
      });
    }

    if (activeTags.length > 0) {
      result = result.filter(m => activeTags.every(t => m.tags.includes(t)));
    }

    result = [...result];
    switch (sortOrder) {
      case "latest":
        result.sort((a, b) => {
          if (a.id.length !== b.id.length) return b.id.length - a.id.length;
          return b.id.localeCompare(a.id);
        });
        break;
      case "oldest":
        result.sort((a, b) => {
          if (a.id.length !== b.id.length) return a.id.length - b.id.length;
          return a.id.localeCompare(b.id);
        });
        break;
      case "a-z":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "z-a":
        result.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case "author":
        result.sort((a, b) => a.author.localeCompare(b.author));
        break;
    }

    setMods(result);
  }, [search, activeTags, allMods, token, sortOrder]);

  const autoLoadAll = useCallback(async (tok: string, nsfwState: boolean, forceRefresh = false) => {
    autoLoadRef.current.cancelled = true;
    const currentRunId = autoLoadRef.current.runId + 1;
    autoLoadRef.current = { runId: currentRunId, cancelled: false };

    const isCancelled = () => autoLoadRef.current.cancelled || autoLoadRef.current.runId !== currentRunId;
    setLoading(true);
    setFullyLoaded(false);
    setLoadProgress(0);

    if (forceRefresh) {
      setAllMods([]);
    }

    let totalProcessed = 0;
    const tagSet = new Set<string>();

    try {
      setStatus("Connecting to Discord...");
      const cd = await invoke<ChannelData>("fetch_discord_mods", { token: tok, guildId: activeSource, offset: 0, nsfw: nsfwState });
      if (isCancelled()) return;

      const channelTags = cd.channel_tags;
      Object.values(channelTags).forEach(tm => Object.values(tm).forEach(t => tagSet.add(t)));
      setAllTags([...tagSet].sort());

      const refetchQueue: RawThread[] = [];
      let isRefetching = false;
      
      const processRefetchQueue = async () => {
        if (isRefetching) return;
        isRefetching = true;
        while (refetchQueue.length > 0) {
          if (isCancelled()) break;
          const thread = refetchQueue[0];
          try {
            const msgs = await invoke<any[]>("fetch_thread_messages", {
              token: tok, threadId: thread.id, lastMessageId: thread.last_message_id, ignoreCache: true
            });
            if (msgs && msgs.length > 0 && !isCancelled()) {
              const freshMod = processMessages(thread, msgs, channelTags);
              const threadCacheKey = `mod_v2_${thread.id}_${thread.last_message_id}`;
              try { localStorage.setItem(threadCacheKey, JSON.stringify(freshMod)); } catch {}
              setAllMods(prev => {
                const next = [...prev];
                const idx = next.findIndex(m => m.id === freshMod.id);
                if (idx >= 0) next[idx] = freshMod;
                return next;
              });
            }
            refetchQueue.shift();
            await new Promise(r => setTimeout(r, 200));
          } catch (e: any) {
            const msg = String(e).toLowerCase();
            if (msg.includes("rate") || msg.includes("429")) {
              await new Promise(r => setTimeout(r, 5000));
            } else {
              refetchQueue.shift();
            }
          }
        }
        isRefetching = false;
      };

      const processThread = async (thread: RawThread): Promise<DiscordMod | null> => {
        if (isCancelled()) return null;
        const threadCacheKey = `mod_v2_${thread.id}_${thread.last_message_id}`;

        try {
          const cachedData = localStorage.getItem(threadCacheKey);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            const isThumbnailExpired = isDiscordUrlExpired(parsed.thumbnail);
            const areLinksExpired = parsed.links?.some((l: string) => isDiscordUrlExpired(l));
            
            if (!isThumbnailExpired && !areLinksExpired) {
              return parsed;
            } else {
              refetchQueue.push(thread);
              processRefetchQueue();
              return parsed;
            }
          }

          const msgs = await invoke<any[]>("fetch_thread_messages", {
            token: tok, threadId: thread.id, lastMessageId: thread.last_message_id, ignoreCache: false
          });
          if (msgs && msgs.length > 0) {
            const mod = processMessages(thread, msgs, channelTags);
            try { localStorage.setItem(threadCacheKey, JSON.stringify(mod)); } catch {}
            const delay = searchRef.current.trim() ? 1 : 5;
            await new Promise(resolve => setTimeout(resolve, delay));
            return mod;
          }
        } catch {}
        return null;
      };

      const firstThreads = cd.threads as RawThread[];
      const firstPageMods: DiscordMod[] = [];
      for (const thread of firstThreads) {
        if (isCancelled()) return;
        const mod = await processThread(thread);
        if (mod) {
          firstPageMods.push(mod);
          totalProcessed++;
        }
        await new Promise(r => setTimeout(r, 0));
      }
      
      if (firstPageMods.length > 0) {
        setAllMods(prev => {
          const next = [...prev];
          for (const mod of firstPageMods) {
            const idx = next.findIndex(m => m.id === mod.id);
            if (idx >= 0) next[idx] = mod;
            else next.push(mod);
          }
          saveModsToCache(activeSource, next, [...tagSet].sort(), nsfwState);
          return next;
        });
      }
      setLoadProgress(totalProcessed);
      setStatus(`Loading mods... (${totalProcessed} found)`);

      let hasMore = firstThreads.length === 25;
      let offset = 25;

      while (hasMore && !isCancelled()) {
        try {
          const raw = await invoke<ChannelData>("fetch_discord_mods", { token: tok, guildId: activeSource, offset, nsfw: nsfwState });
          if (isCancelled()) return;

          const threads = raw.threads as RawThread[];
          Object.values(raw.channel_tags).forEach(tm => Object.values(tm).forEach(t => tagSet.add(t)));
          setAllTags([...tagSet].sort());

          if (threads.length === 0) {
            hasMore = false;
          } else {
            const pageMods: DiscordMod[] = [];
            for (const thread of threads) {
              if (isCancelled()) return;
              const mod = await processThread(thread);
              if (mod) {
                pageMods.push(mod);
                totalProcessed++;
              }
              await new Promise(r => setTimeout(r, 0));
            }
            
            if (pageMods.length > 0) {
              setAllMods(prev => {
                const next = [...prev];
                for (const mod of pageMods) {
                  const idx = next.findIndex(m => m.id === mod.id);
                  if (idx >= 0) next[idx] = mod;
                  else next.push(mod);
                }
                saveModsToCache(activeSource, next, [...tagSet].sort(), nsfwState);
                return next;
              });
            }
            
            setLoadProgress(totalProcessed);
            setStatus(`Loading mods... (${totalProcessed} found)`);
            hasMore = threads.length === 25;
            offset += 25;
          }
        } catch (e: any) {
          const msg = String(e).toLowerCase();
          if (msg.includes("rate") || msg.includes("429")) {
            setStatus(`Rate limited, waiting... (${totalProcessed} loaded)`);
            await new Promise(r => setTimeout(r, 5000));
          } else {
            setStatus(`Connection hiccup, retrying... (${totalProcessed} loaded)`);
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      if (!isCancelled()) {
        setFullyLoaded(true);
        setStatus(`Loaded ${totalProcessed} mods`);
      }
    } catch (e: any) {
      setStatus(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [activeSource]);

  useEffect(() => {
    if (!token) return;
    const cached = loadModsFromCache(activeSource, isNsfw);
    if (cached) {
      setAllMods(cached.mods);
      setAllTags(cached.tags);
      setStatus(`Showing ${cached.mods.length} cached mods · Updating...`);
    } else {
      setAllMods([]);
      setAllTags([]);
    }
    autoLoadAll(token, isNsfw);
    return () => { autoLoadRef.current.cancelled = true; };
  }, [token, activeSource]);

  const handleLogin = async (tok: string) => {
    setToken(tok);
    setShowLogin(false);
    try {
      const userData = await invoke<any>("validate_discord_token", { token: tok });
      setUsername(userData.username);
      if (userData.guilds) {
        const valid = userData.guilds.filter((g: any) => SUPPORTED_GUILDS[g.id]);
        setAvailableGuilds(valid);
        if (valid.length > 0 && !valid.find((g: any) => g.id === activeSource)) {
          setActiveSource(valid[0].id);
        }
      }
    } catch {}
  };

  const handleRefresh = () => {
    if (!token) { setShowLogin(true); return; }
    autoLoadAll(token, isNsfw, true);
  };

  const handleToggleNsfw = () => {
    if (!token) return;
    const nextNsfw = !isNsfw;
    setIsNsfw(nextNsfw);
    setAllMods([]);
    const cached = loadModsFromCache(activeSource, nextNsfw);
    if (cached) {
      setAllMods(cached.mods);
      setAllTags(cached.tags);
    }
    autoLoadAll(token, nextNsfw);
  };

  const handleLogout = async () => {
    autoLoadRef.current.cancelled = true;
    await invoke("clear_discord_token");
    setToken(null);
    setUsername(null);
    setAllMods([]);
    setMods([]);
  };

  const toggleTag = (tag: string) => {
    setActiveTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showLogin && <LoginModal onLogin={handleLogin} onCancel={() => setShowLogin(false)} />}

      <div className="relative z-50 shrink-0 flex items-center gap-3 px-6 py-3 bg-hero-sidebar/40 border-b border-white/5 backdrop-blur-md">
        <div className="relative source-dropdown">
          <button 
            onClick={() => setShowSourceDropdown(!showSourceDropdown)}
            className="flex items-center gap-3 hover:bg-white/5 p-1.5 pr-3 rounded-lg transition-colors"
          >
            {SUPPORTED_GUILDS[activeSource] ? (
              <img src={SUPPORTED_GUILDS[activeSource].icon} className="w-8 h-8 rounded-full shadow-lg object-cover bg-black shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#5865F2] flex items-center justify-center text-white font-black text-sm shrink-0 shadow-lg">D</div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white/70 uppercase tracking-widest">
                {SUPPORTED_GUILDS[activeSource]?.name || "Discord Store"}
              </span>
              <ChevronDown size={14} className="text-white/40" />
            </div>
          </button>
          
          {showSourceDropdown && (
            <div className="absolute top-full left-0 mt-2 w-64 bg-[#1a1b1e] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col backdrop-blur-xl">
              {availableGuilds.map(g => (
                <button 
                  key={g.id}
                  onClick={() => { setActiveSource(g.id); setShowSourceDropdown(false); }}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left ${activeSource === g.id ? 'bg-white/5' : ''}`}
                >
                  <img src={SUPPORTED_GUILDS[g.id]?.icon} className="w-6 h-6 rounded-full object-cover shrink-0 bg-black" />
                  <span className="text-sm font-bold text-white/80">{g.name || SUPPORTED_GUILDS[g.id]?.name}</span>
                </button>
              ))}
              {availableGuilds.length === 0 && (
                <div className="px-4 py-4 text-xs text-center text-white/40 leading-relaxed">
                  You are not in any supported mod servers.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-lg ml-4">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
            <input
              type="text"
              placeholder="Search mods..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:border-[#5865F2] outline-none transition-colors"
            />
          </div>
          <select
            value={sortOrder}
            onChange={(e) => {
              const val = e.target.value;
              setSortOrder(val);
              try { localStorage.setItem("discord_sort_order", val); } catch {}
            }}
            className="bg-black/40 border border-white/10 rounded-lg text-white text-xs px-2 py-2 outline-none focus:border-[#5865F2] transition-colors shrink-0 cursor-pointer"
          >
            <option className="bg-[#18181b] text-white" value="latest">Latest</option>
            <option className="bg-[#18181b] text-white" value="oldest">Oldest</option>
            <option className="bg-[#18181b] text-white" value="a-z">Name (A-Z)</option>
            <option className="bg-[#18181b] text-white" value="z-a">Name (Z-A)</option>
            <option className="bg-[#18181b] text-white" value="author">Author</option>
          </select>

          <div className="relative shrink-0 discord-filter-dropdown z-50">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                activeTags.length > 0 
                  ? 'bg-[#5865F2]/10 border-[#5865F2]/30 text-[#5865F2]' 
                  : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Filter size={14} />
              <span className="hidden sm:inline">Filters</span>
              {activeTags.length > 0 && (
                <span className="flex items-center justify-center w-4 h-4 text-[9px] bg-[#5865F2] text-white rounded-full ml-1">
                  {activeTags.length}
                </span>
              )}
              <ChevronDown size={14} className="ml-1 opacity-50" />
            </button>

            {showTagDropdown && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl py-2 overflow-hidden backdrop-blur-xl">
                <div className="px-4 py-2 text-xs font-black uppercase text-white/40 border-b border-white/5 mb-1 flex items-center justify-between">
                  <span>Tags</span>
                  {activeTags.length > 0 && (
                    <button 
                      onClick={() => setActiveTags([])}
                      className="text-[#5865F2] hover:text-white transition-colors"
                    >Clear</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {allTags.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-white/30 italic">No tags found</div>
                  ) : (
                    allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-left hover:bg-white/5 transition-colors group"
                      >
                        <span className={`font-bold transition-colors ${activeTags.includes(tag) ? 'text-[#5865F2]' : 'text-white/70 group-hover:text-white'}`}>
                          {tag}
                        </span>
                        {activeTags.includes(tag) && (
                          <Check size={14} className="text-[#5865F2]" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
          {token && (
            <>
              <div className="flex items-center gap-1.5 px-2 mx-1 shrink-0">
                <span className="text-[9px] text-white/40 font-bold uppercase select-none" title="Scale Icons">A</span>
                <input 
                  type="range" 
                  min="120" 
                  max="480" 
                  value={cardSize} 
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCardSize(val);
                    try { localStorage.setItem("global_card_size", val.toString()); } catch {}
                  }}
                  className="w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-colors"
                  style={{ accentColor: "#5865F2" }}
                />
                <span className="text-sm text-white/60 font-bold uppercase select-none" title="Scale Icons">A</span>
              </div>
              {activeSource === "1256679541112311809" && allow18Plus !== false && (
                <button
                  onClick={handleToggleNsfw}
                  className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg font-bold text-[10px] transition-all border
                    ${isNsfw 
                      ? "bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]" 
                      : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"}`}
                  title={isNsfw ? "18+ Archive Active" : "Switch to 18+ Archive"}
                >
                  18+
                </button>
              )}
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            {loading && <div className="w-1.5 h-1.5 rounded-full bg-hero-primary animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.8)]"></div>}
            <span 
              className={`text-xs transition-all duration-300 font-bold tracking-wide ${loading ? 'text-hero-primary' : 'text-white/30'}`}
            >
              {status}
            </span>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white rounded-lg transition-all"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""}/>
            Refresh
          </button>

          {token ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60 font-medium hidden md:block">{username}</span>
              <button onClick={handleLogout} title="Logout" className="p-1.5 text-white/30 hover:text-red-400 transition-colors">
                <LogOut size={14}/>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg transition-all"
            >
              <LogIn size={12}/>
              Login
            </button>
          )}
        </div>
      </div>

      {/* Loading progress bar */}
      {loading && (
        <div className="shrink-0 h-0.5 bg-black/20 overflow-hidden">
          <div 
            className="h-full bg-[#5865F2] transition-all duration-500 ease-out" 
            style={{ width: fullyLoaded ? '100%' : `${Math.min(95, loadProgress * 0.4)}%` }}
          />
        </div>
      )}



      {/* Not logged in state */}
      {!token && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-8">
          <div className="w-24 h-24 rounded-full bg-[#5865F2]/20 flex items-center justify-center text-5xl">🛒</div>
          <div>
            <h3 className="text-2xl font-black text-white mb-2">Mod Discovery</h3>
            <p className="text-white/40 text-sm max-w-sm">Log in with your Discord account to browse mods from the Endeavor Headquarters server.</p>
          </div>
          <button
            onClick={() => setShowLogin(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(88,101,242,0.3)] hover:shadow-[0_0_30px_rgba(88,101,242,0.5)]"
          >
            <LogIn size={18}/>
            Login to Discord
          </button>
        </div>
      )}

      {/* Mod grid */}
      {token && (
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto custom-scrollbar p-6"
        >
          {/* Empty state: fully loaded, nothing matches */}
          {mods.length === 0 && !loading && fullyLoaded && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <div className="text-5xl opacity-30">📦</div>
              <p className="text-white/30 text-sm">
                {search.trim() || activeTags.length > 0
                  ? "No mods match your search. Try different keywords."
                  : "No mods found. Click Refresh to reload."}
              </p>
            </div>
          )}

          {/* Empty state: nothing loaded yet, not loading */}
          {mods.length === 0 && !loading && !fullyLoaded && allMods.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <div className="text-5xl opacity-30">📦</div>
              <p className="text-white/30 text-sm">No mods found. Click <strong>Refresh</strong> to load the store.</p>
            </div>
          )}

          {/* Initial loading state */}
          {mods.length === 0 && loading && allMods.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <RefreshCw size={24} className="animate-spin text-white/30"/>
              <p className="text-white/30 text-sm">{status}</p>
            </div>
          )}

          {/* Searching while still loading — show progress */}
          {search.trim() && mods.length === 0 && loading && allMods.length > 0 && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
              <RefreshCw size={24} className="animate-spin text-[#5865F2]"/>
              <p className="text-white/50 text-sm">Searching through all mods... ({allMods.length} checked so far)</p>
            </div>
          )}

          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}>
            {mods.map(mod => (
              <ModCard
                localMods={localMods}
                key={mod.id}
                mod={mod}
                token={token}
                onDownloadedUrl={handleDownloadedUrl}
                downloadedUrls={downloadedUrls}
              />
            ))}
          </div>

          {/* Bottom loading indicator while auto-loading more pages */}
          {loading && allMods.length > 0 && (
            <div className="flex items-center justify-center gap-3 py-8 text-white/40">
              <RefreshCw size={14} className="animate-spin"/>
              <span className="text-xs">{status}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
