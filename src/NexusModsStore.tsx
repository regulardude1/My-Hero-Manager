import { useState, useEffect, useCallback, memo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink, Search, RefreshCw, ChevronLeft, ChevronDown, LogIn, LogOut, Key, Filter, Check } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
interface NexusMod {
  mod_id: number;
  name: string;
  summary: string;
  version: string;
  author: string;
  picture_url: string;
  category_id: number;
  contains_adult_content: boolean;
  status: string;
  created_at: string;
  updated_at: string;
}

interface NexusFile {
  id: number[];
  name: string;
  version: string;
  category_id: number;
  category_name: string;
  size_kb: number;
  file_name: string;
}

// ── Login Modal ───────────────────────────────────────────────────────
function LoginModal({ onLogin, onCancel }: { onLogin: (token: string) => void; onCancel: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!key.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("https://api.nexusmods.com/v1/users/validate.json", {
        headers: { apikey: key.trim() }
      });
      if (res.ok) {
        onLogin(key.trim());
      } else {
        setError("Invalid API Key");
      }
    } catch (e) {
      setError("Failed to validate API Key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#18181b] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DA8F44]/10 to-transparent pointer-events-none" />
        <button onClick={onCancel} className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors">
          <ChevronLeft className="rotate-180" size={20} />
        </button>
        
        <div className="flex flex-col items-center text-center gap-4 relative">
          <div className="w-16 h-16 rounded-full bg-[#DA8F44]/20 flex items-center justify-center text-[#DA8F44] mb-2">
            <Key size={32} />
          </div>
          <h2 className="text-xl font-black text-white">Nexus Mods API Key</h2>
          <div className="text-left text-xs text-white/60 bg-black/40 p-4 rounded-xl w-full border border-white/5 space-y-2 mb-2 shadow-inner">
            <p>1. Click the <strong>Get API Key</strong> button below to open your Nexus settings.</p>
            <p>2. Scroll all the way down to the bottom of the page.</p>
            <p>3. Find <strong>Personal API Key</strong> and click <strong>Generate</strong>.</p>
            <p>4. Copy and paste it here.</p>
          </div>

          <input 
            type="password" 
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Paste your Personal API Key here..."
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-[#DA8F44] outline-none transition-colors"
          />

          {error && <p className="text-red-400 text-xs font-bold">{error}</p>}

          <div className="flex w-full gap-3 mt-4">
            <button 
              onClick={() => openUrl("https://www.nexusmods.com/settings/api-keys")}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-xs bg-white/5 hover:bg-white/10 text-white/70 transition-all border border-white/10"
            >
              Get API Key
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading || !key.trim()}
              className="flex-[2] flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-[#DA8F44] hover:bg-[#b87838] text-white transition-all shadow-[0_0_20px_rgba(218,143,68,0.3)] hover:shadow-[0_0_30px_rgba(218,143,68,0.5)] disabled:opacity-50"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <LogIn size={16} />}
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mod Card ──────────────────────────────────────────────────────────
const ModCard = memo(function ModCard({ mod, token, onDownloadedUrl, downloadedUrls, localMods }: { mod: NexusMod; token: string; onDownloadedUrl: (url: string) => void; downloadedUrls: Set<string>; localMods?: any[] }) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [status, setStatus] = useState<{text: string; ok: boolean} | null>(null);
  const [imgError, setImgError] = useState(false);
  const [files, setFiles] = useState<NexusFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const fetchFiles = async () => {
    if (files.length > 0) return;
    setLoadingFiles(true);
    try {
      const res = await fetch(`https://api.nexusmods.com/v1/games/myheroultrarumble/mods/${mod.mod_id}/files.json`, {
        headers: { apikey: token }
      });
      const data = await res.json();
      if (data && data.files) {
        const activeFiles = data.files.filter((f: NexusFile) => 
          f.category_id === 1 || 
          f.category_id === 2 || 
          f.category_id === 3 || 
          f.category_id === 5
        );
        setFiles(activeFiles);
      }
    } catch (e) {
      console.error("Failed to fetch Nexus files", e);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleExpand = () => {
    if (!expanded) fetchFiles();
    setExpanded(!expanded);
  };

  const thumbnail = mod.picture_url || null;

  const checkIsDownloaded = (filename: string) => {
    if (downloadedUrls.has(filename)) return true;
    if (localMods) {
      return localMods.some(m => m.pak_name === filename || m.pak_name === filename.replace(/\.zip$/, '.pak') || m.pak_name === filename.replace(/\.rar$/, '.pak') || m.pak_name === filename.replace(/\.7z$/, '.pak'));
    }
    return false;
  };

  const downloadingRef = useRef(downloading);
  useEffect(() => { downloadingRef.current = downloading; }, [downloading]);
  const onDownloadedUrlRef = useRef(onDownloadedUrl);
  useEffect(() => { onDownloadedUrlRef.current = onDownloadedUrl; }, [onDownloadedUrl]);

  // Listen for download completion events from the Rust webview popup
  useEffect(() => {
    let unlistenComplete: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
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
    });
    return () => { 
      if (unlistenComplete) unlistenComplete(); 
      if (unlistenStatus) unlistenStatus();
    };
  }, []);

  const handleDownload = async (file: NexusFile) => {
    setDownloading(file.file_name);
    setStatus(null);
    try {
      // Try the API download directly first (works for Premium users)
      const linkRes = await fetch(`https://api.nexusmods.com/v1/games/myheroultrarumble/mods/${mod.mod_id}/files/${file.id[0]}/download_link.json`, {
        headers: { apikey: token }
      });
      const links = await linkRes.json();

      if (Array.isArray(links) && links.length > 0 && links[0].URI) {
        // Premium user — direct download via Rust backend
        const result = await invoke<string>("download_url_mod", {
          url: links[0].URI, fileName: file.file_name, modTitle: mod.name, modAuthor: mod.author || "Unknown"
        });
        setStatus({ text: result, ok: true });
        onDownloadedUrl(file.file_name);
        setDownloading(null);
        return;
      }

      // Free user — open a hidden webview to the Nexus files page to fetch the download
      // The Rust backend intercepts the download and installs the mod automatically
      setStatus({ text: "Fetching download directly...", ok: true });
      await invoke("open_nexus_download", {
        modId: mod.mod_id,
        fileId: file.id[0],
        fileName: file.file_name,
        modTitle: mod.name,
        modAuthor: mod.author || "Unknown"
      });
      // Status will update when the nexus-download-complete event fires
    } catch (e: any) {
      setStatus({ text: String(e), ok: false });
      setDownloading(null);
    }
  };

  return (
    <div className="bg-hero-card/60 border border-white/5 rounded-xl overflow-hidden hover:border-[#DA8F44]/40 transition-all duration-300 flex flex-col">
      {/* Thumbnail */}
      <div className="relative w-full aspect-video bg-black/40">
        {thumbnail && !imgError ? (
          <img src={thumbnail} alt={mod.name} loading="lazy" className="w-full h-full object-cover" onError={() => setImgError(true)}/>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-4xl">📦</div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-2">
        <h3 className="font-bold text-white text-sm leading-tight line-clamp-2">{mod.name}</h3>
        <p className="text-xs text-white/40">by <span className="text-white/60">{mod.author}</span></p>

        <button
          onClick={handleExpand}
          className="mt-auto w-full flex items-center justify-center gap-2 bg-[#DA8F44] hover:bg-[#b87838] text-white text-xs font-black py-2 rounded-lg transition-all"
        >
          {expanded ? "Hide Downloads" : "View Downloads"}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {loadingFiles && <p className="text-xs text-white/40 text-center py-2">Loading files...</p>}
            {!loadingFiles && files.length === 0 && (
              <p className="text-xs text-white/40 text-center py-2">No files available</p>
            )}
            {files.map((file, i) => {
              const isLoading = downloading === file.file_name;
              const isDownloaded = checkIsDownloaded(file.file_name);
              return (
                <button
                  key={i}
                  disabled={isLoading}
                  onClick={() => handleDownload(file)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${isDownloaded 
                        ? "bg-blue-800 hover:bg-blue-700 text-blue-100 border border-blue-600/50" 
                        : "bg-green-600/20 hover:bg-green-600/30 text-green-300 border border-green-500/20"}`}
                >
                  <Download size={12}/>
                  <span className="truncate flex-1 text-left">{isLoading ? "Installing..." : file.file_name}</span>
                  {isDownloaded && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Installed</span>}
                </button>
              );
            })}
            <button 
              onClick={() => openUrl(`https://www.nexusmods.com/myheroultrarumble/mods/${mod.mod_id}`)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all mt-2"
            >
              <ExternalLink size={12} /> View on Nexus Mods
            </button>
            {status && (
              <div className={`text-xs p-2 rounded-lg mt-2 ${status.ok ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
                {status.ok ? "✅ " : "❌ "}{status.text}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
});

// ── Main NexusMods Store Panel ──────────────────────────────────────────
export default function NexusModsStore({ allow18Plus = true, localMods = [], onModInstalled }: { allow18Plus?: boolean; localMods?: any[], onModInstalled?: () => void }) {
  const [mods, setMods] = useState<NexusMod[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Click Refresh to load mods");
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("nexus_api_key");
  });
  const [showLogin, setShowLogin] = useState(false);

  const [cardSize, setCardSize] = useState(() => {
    try {
      const stored = localStorage.getItem("global_card_size");
      return stored ? Number(stored) : 240;
    } catch {
      return 240;
    }
  });

  const [downloadedUrls, setDownloadedUrls] = useState<Set<string>>(new Set());

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

  // ── Cache helpers ──
  const CACHE_KEY = "nexus_mods_cache";
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  const loadCache = useCallback((): { mods: NexusMod[]; timestamp: number } | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const saveCache = useCallback((modsData: NexusMod[]) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ mods: modsData, timestamp: Date.now() }));
    } catch { /* localStorage full, silently fail */ }
  }, []);

  // ── Brute-force fetch all mod IDs in batches ──
  const fetchAllMods = useCallback(async (apikey: string, forceRefresh = false) => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached && (Date.now() - cached.timestamp) < CACHE_TTL && cached.mods.length > 0) {
        setMods(cached.mods);
        const age = Date.now() - cached.timestamp;
        const hoursAgo = Math.floor(age / (60 * 60 * 1000));
        const minsAgo = Math.floor(age / (60 * 1000));
        const ageStr = hoursAgo > 0 ? `${hoursAgo}h ago` : `${minsAgo}m ago`;
        setStatus(`Loaded ${cached.mods.length} mods from cache (updated ${ageStr})`);
        return;
      }
    }

    setLoading(true);
    setStatus("Scanning Nexus Mods database...");

    try {
      const MAX_ID = 500; // scan IDs 1-500 to cover all possible mods
      const BATCH_SIZE = 20; // concurrent requests per batch
      const allMods: NexusMod[] = [];
      let consecutiveNotFound = 0;

      for (let batchStart = 1; batchStart <= MAX_ID; batchStart += BATCH_SIZE) {
        // If we've hit 40+ consecutive 404s, the rest are probably empty
        if (consecutiveNotFound >= 40) break;

        const batchIds = Array.from(
          { length: Math.min(BATCH_SIZE, MAX_ID - batchStart + 1) },
          (_, i) => batchStart + i
        );

        const batchPromises = batchIds.map(id =>
          fetch(`https://api.nexusmods.com/v1/games/myheroultrarumble/mods/${id}.json`, {
            headers: { apikey }
          })
            .then(async res => {
              if (res.ok) {
                consecutiveNotFound = 0;
                return await res.json() as NexusMod;
              }
              consecutiveNotFound++;
              return null;
            })
            .catch(() => {
              consecutiveNotFound++;
              return null;
            })
        );

        const results = await Promise.all(batchPromises);
        const validMods = results.filter((m): m is NexusMod => m !== null && !!m.name);
        allMods.push(...validMods);

        setStatus(`Scanning Nexus Mods... found ${allMods.length} mods (ID ${batchStart}-${batchStart + BATCH_SIZE - 1})`);
      }

      if (allMods.length > 0) {
        // Deduplicate by mod_id
        const uniqueMap = new Map<number, NexusMod>();
        allMods.forEach(m => uniqueMap.set(m.mod_id, m));
        const uniqueMods = Array.from(uniqueMap.values());

        setMods(uniqueMods);
        saveCache(uniqueMods);
        setStatus(`Loaded ${uniqueMods.length} mods from Nexus Mods`);
      } else {
        setStatus("No mods found");
      }
    } catch (e: any) {
      setStatus("Error fetching mods: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [loadCache, saveCache]);

  useEffect(() => {
    if (token) {
      fetchAllMods(token);
    }
  }, [token, fetchAllMods]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (showTagDropdown && !(e.target as Element).closest('.gb-filter-dropdown')) {
        setShowTagDropdown(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showTagDropdown]);

  const handleRefresh = () => {
    if (token) fetchAllMods(token, true);
  };

  const handleLogin = (key: string) => {
    setToken(key);
    localStorage.setItem("nexus_api_key", key);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("nexus_api_key");
    setMods([]);
  };

  const [backendChars, setBackendChars] = useState<string[]>([]);
  useEffect(() => {
    invoke('get_characters').then(chars => setBackendChars(chars as string[])).catch(console.error);
  }, []);

  const KNOWN_CHARACTERS = Array.from(new Set([
    ...backendChars,
    ...backendChars.flatMap(c => c.split(" ")),
    "Deku", "Midoriya", "Bakugo", "Shoto", "Todoroki", "All Might", "Ochaco", "Uraraka",
    "Froppy", "Tsuyu", "Toga", "Dabi", "Shigaraki", "Twice", "Mt. Lady", "Aizawa", 
    "Kirishima", "Momo", "Yaoyorozu", "Kaminari", "Iida", "Kendo", "Shiozaki", 
    "Compress", "Endeavor", "Mirko", "Overhaul", "AFO", "All For One", "Hawks", 
    "Jiro", "Mina", "Ashido", "Tokoyami", "Mirio", "Lemillion", "Nejire", "Tamaki", "Amajiki"
  ])).filter(c => c && c.length > 2 && !["and", "the", "for", "with", "over", "all", "one"].includes(c.toLowerCase()));

  const allTags = Array.from(new Set(mods.flatMap(m => {
    const text = (m.name + " " + m.summary).toLowerCase();
    return KNOWN_CHARACTERS.filter(char => text.includes(char.toLowerCase()));
  }))).sort();

  const toggleTag = (tag: string) => {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const filteredMods = mods.filter(m => {
    if (allow18Plus === false && m.contains_adult_content) return false;
    
    const text = (m.name + " " + m.summary).toLowerCase();
    if (activeTags.length > 0 && !activeTags.some(tag => text.includes(tag.toLowerCase()))) {
      return false;
    }

    const nameMatch = m.name?.toLowerCase().includes(search.toLowerCase()) || false;
    const authorMatch = m.author?.toLowerCase().includes(search.toLowerCase()) || false;
    return nameMatch || authorMatch;
  }).sort((a, b) => {
    // Nexus API returns created_timestamp and updated_timestamp as Unix epoch timestamps (seconds).
    // Let's cast them to any to access the actual API fields, or fallback to mod_id.
    const getTimestamp = (mod: any) => {
      if (mod.updated_timestamp) return mod.updated_timestamp;
      if (mod.created_timestamp) return mod.created_timestamp;
      if (mod.updated_at) return new Date(mod.updated_at).getTime() / 1000;
      if (mod.created_at) return new Date(mod.created_at).getTime() / 1000;
      return mod.mod_id; // Fallback: higher ID = newer
    };
    return getTimestamp(b) - getTimestamp(a);
  });

  return (
    <div className="flex flex-col h-full bg-[#0d0d12] overflow-hidden">
      {showLogin && <LoginModal onLogin={handleLogin} onCancel={() => setShowLogin(false)} />}
      
      {/* Top Navigation / Status Bar */}
      <div className="shrink-0 flex items-center justify-between p-4 bg-[#18181b] border-b border-white/5 relative z-20 shadow-md">
        
        {/* Breadcrumb / Nav */}
        <div className="flex items-center gap-4 relative">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#DA8F44] text-white flex items-center justify-center font-black text-lg border border-white/10 shrink-0">
              N
            </div>
            <div className="flex flex-col">
              <h2 className="text-[10px] font-black italic tracking-widest text-white/50 flex items-center gap-2 uppercase">
                NEXUS MODS
              </h2>
            </div>
          </div>
        </div>

        {/* Search, Sort, Scale */}
        <div className="flex items-center gap-2 flex-1 max-w-lg ml-4">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
            <input 
              type="text" 
              placeholder="Search mods..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-white/20 focus:border-[#DA8F44] outline-none transition-colors"
            />
          </div>

          {/* Filter Dropdown */}
          <div className="relative shrink-0 gb-filter-dropdown z-50">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                activeTags.length > 0 
                  ? 'bg-[#DA8F44]/10 border-[#DA8F44]/30 text-[#DA8F44]' 
                  : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Filter size={14} />
              <span className="hidden sm:inline">Filters</span>
              {activeTags.length > 0 && (
                <span className="flex items-center justify-center w-4 h-4 text-[9px] bg-[#DA8F44] text-black rounded-full ml-1">
                  {activeTags.length}
                </span>
              )}
              <ChevronDown size={14} className="ml-1 opacity-50" />
            </button>

            {showTagDropdown && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl py-2 overflow-hidden backdrop-blur-xl">
                <div className="px-4 py-2 text-xs font-black uppercase text-white/40 border-b border-white/5 mb-1 flex items-center justify-between">
                  <span>Characters</span>
                  {activeTags.length > 0 && (
                    <button 
                      onClick={() => setActiveTags([])}
                      className="text-[#DA8F44] hover:text-white transition-colors"
                    >Clear</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {allTags.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-white/30 italic">No characters found in loaded mods</div>
                  ) : (
                    allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-left hover:bg-white/5 transition-colors group"
                      >
                        <span className={`font-bold transition-colors ${activeTags.includes(tag) ? 'text-[#DA8F44]' : 'text-white/70 group-hover:text-white'}`}>
                          {tag}
                        </span>
                        {activeTags.includes(tag) && <Check size={14} className="text-[#DA8F44]" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
          
          <div className="flex items-center gap-1.5 px-2 mx-1 shrink-0 hidden sm:flex">
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
              style={{ accentColor: "#DA8F44" }}
            />
            <span className="text-sm text-white/60 font-bold uppercase select-none" title="Scale Icons">A</span>
          </div>
        </div>
        
        {/* Status / Refresh / Login */}
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            {loading && <div className="w-1.5 h-1.5 rounded-full bg-[#DA8F44] animate-pulse shadow-[0_0_8px_rgba(218,143,68,0.8)]"></div>}
            <span className={`text-xs transition-all duration-300 font-bold tracking-wide ${loading ? 'text-[#DA8F44]' : 'text-white/30'}`}>
              {status}
            </span>
          </div>
          <button 
            onClick={handleRefresh}
            disabled={loading || !token}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#DA8F44] hover:bg-[#b87838] disabled:opacity-50 text-white rounded-lg transition-all"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          {token ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => invoke("open_nexus_login")}
                title="Connect Nexus Account (For Free Downloads)"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg transition-all"
              >
                <LogIn size={14}/>
                <span className="hidden md:inline">Nexus Login</span>
              </button>
              <button onClick={handleLogout} title="Logout API Key" className="p-1.5 text-white/30 hover:text-red-400 transition-colors">
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

      {/* Not logged in state */}
      {!token && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-8">
          <div className="w-24 h-24 rounded-full bg-[#DA8F44]/20 flex items-center justify-center text-[#DA8F44]">
            <Key size={48} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-white mb-2">Nexus Mods Integration</h3>
            <p className="text-white/40 text-sm max-w-sm">Log in with your Personal API Key to browse and download from Nexus Mods.</p>
          </div>
          <button
            onClick={() => setShowLogin(true)}
            className="flex items-center gap-2 px-6 py-3 bg-[#DA8F44] hover:bg-[#b87838] text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(218,143,68,0.3)] hover:shadow-[0_0_30px_rgba(218,143,68,0.5)]"
          >
            <LogIn size={18}/>
            Enter API Key
          </button>
        </div>
      )}

      {/* Mod Grid */}
      {token && (
        <div 
          className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar relative"
        >
          <div 
            className="grid gap-4 md:gap-6 pb-20"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}
          >
            {filteredMods.map(mod => (
              <ModCard 
                key={mod.mod_id} 
                mod={mod}
                token={token}
                onDownloadedUrl={handleDownloadedUrl}
                downloadedUrls={downloadedUrls}
                localMods={localMods}
              />
            ))}
            {loading && Array.from({length: 4}).map((_, i) => (
              <div key={`skel-${i}`} className="bg-hero-card/40 border border-white/5 rounded-xl h-64 animate-pulse"></div>
            ))}
            {!loading && filteredMods.length === 0 && (
              <div className="col-span-full py-20 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white/20 mb-4">
                  <Search size={24} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">No mods found</h3>
                <p className="text-white/40">Try adjusting your search</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
