import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Search, RefreshCw, ChevronLeft, ChevronDown, LogIn, LogOut, Key, Filter, Check } from "lucide-react";
import { StoreModCard } from "./components/StoreModCard";

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
      <div className="bg-hero-sidebar border border-hero-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#DA8F44]/10 to-transparent pointer-events-none" />
        <button onClick={onCancel} className="absolute top-4 right-4 text-hero-text/30 hover:text-hero-text transition-colors">
          <ChevronLeft className="rotate-180" size={20} />
        </button>
        
        <div className="flex flex-col items-center text-center gap-4 relative">
          <div className="w-16 h-16 rounded-full bg-[#DA8F44]/20 flex items-center justify-center text-[#DA8F44] mb-2">
            <Key size={32} />
          </div>
          <h2 className="text-xl font-black text-hero-text">Nexus Mods API Key</h2>
          <div className="text-left text-xs text-hero-text/60 bg-black/40 p-4 rounded-xl w-full border border-hero-border space-y-2 mb-2 shadow-inner">
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
            className="w-full bg-black/40 border border-hero-border rounded-xl px-4 py-3 text-hero-text text-sm focus:border-[#DA8F44] outline-none transition-colors"
          />

          {error && <p className="text-red-400 text-xs font-bold">{error}</p>}

          <div className="flex w-full gap-3 mt-4">
            <button 
              onClick={() => openUrl("https://www.nexusmods.com/settings/api-keys")}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-xs bg-hero-surface hover:bg-hero-surfaceHover text-hero-textSecondary transition-all border border-hero-border"
            >
              Get API Key
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading || !key.trim()}
              className="flex-[2] flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-[#DA8F44] hover:bg-[#b87838] text-hero-text transition-all shadow-[0_0_20px_rgba(218,143,68,0.3)] hover:shadow-[0_0_30px_rgba(218,143,68,0.5)] disabled:opacity-50"
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
  const [nexusLoginStep, setNexusLoginStep] = useState(1); // 1 = sign in first, 2 = API key unlocked
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [flashErr, setFlashErr] = useState(false);

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
    // Also sign out of the Nexus account session (if one is active)
    invoke("nexus_signout").catch(() => {});
    setNexusLoginStep(1);
  };

  // When the login window detects a successful sign-in, jump straight to the API key step
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen("nexus-signed-in", () => {
      setNexusLoginStep(2);
      if (!localStorage.getItem("nexus_api_key")) {
        setFlashErr(false);
        setFlashMsg("Logged In Successfully!");
        setTimeout(() => {
          setFlashMsg(null);
          setShowLogin(true);
        }, 1600);
      }
    }).then(fn => { unlisten = fn; }).catch(() => {});
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Sign-out feedback (from the hidden sign-out webview)
  useEffect(() => {
    let unOk: (() => void) | null = null;
    let unFail: (() => void) | null = null;
    listen("nexus-signed-out", () => {
      setFlashErr(false);
      setFlashMsg("Signed Out of Nexus");
      setTimeout(() => setFlashMsg(null), 2000);
    }).then(fn => { unOk = fn; }).catch(() => {});
    listen("nexus-signout-failed", () => {
      setFlashErr(true);
      setFlashMsg("Nexus Sign-Out Failed");
      setTimeout(() => setFlashMsg(null), 2000);
    }).then(fn => { unFail = fn; }).catch(() => {});
    return () => { if (unOk) unOk(); if (unFail) unFail(); };
  }, []);

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
    <div className="flex flex-col h-full bg-hero-bg overflow-hidden relative">
      {showLogin && <LoginModal onLogin={handleLogin} onCancel={() => setShowLogin(false)} />}

      {/* Success flash (after Nexus sign-in) */}
      {flashMsg && (
        <div className="absolute inset-x-0 top-16 z-[110] flex justify-center pointer-events-none">
          <div className={`flex items-center gap-2 bg-hero-sidebar border font-bold text-sm px-5 py-3 rounded-xl shadow-2xl ${flashErr ? "border-red-500/40 text-red-300" : "border-green-500/40 text-green-300"}`}>
            <Check size={16} className={flashErr ? "text-red-400" : "text-green-400"} />
            {flashMsg}
          </div>
        </div>
      )}
      
      {/* Top Navigation / Status Bar */}
      <div className="shrink-0 flex items-center justify-between p-4 bg-hero-sidebar border-b border-hero-border relative z-20 shadow-md">
        
        {/* Breadcrumb / Nav */}
        <div className="flex items-center gap-4 relative">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#DA8F44] text-hero-text flex items-center justify-center font-black text-lg border border-hero-border">
                N
              </div>
              {token && (
                <span
                  title="API key active"
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-hero-sidebar shadow-[0_0_6px_rgba(74,222,128,0.8)]"
                />
              )}
            </div>
            <div className="flex flex-col">
              <h2 className="text-[10px] font-black italic tracking-widest text-hero-muted flex items-center gap-2 uppercase">
                NEXUS MODS
              </h2>
            </div>
          </div>
        </div>

        {/* Search, Sort, Scale */}
        <div className="flex items-center gap-2 flex-1 max-w-lg ml-4">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-hero-text/30"/>
            <input 
              type="text" 
              placeholder="Search mods..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-black/40 border border-hero-border rounded-lg text-hero-text placeholder:text-hero-text/20 focus:border-[#DA8F44] outline-none transition-colors"
            />
          </div>

          {/* Filter Dropdown */}
          <div className="relative shrink-0 gb-filter-dropdown z-50">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                activeTags.length > 0 
                  ? 'bg-[#DA8F44]/10 border-[#DA8F44]/30 text-[#DA8F44]' 
                  : 'bg-black/40 border-hero-border text-hero-textSecondary hover:bg-hero-surface hover:text-hero-text'
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
              <div className="absolute top-full right-0 mt-2 w-56 bg-hero-sidebar border border-hero-border rounded-xl shadow-2xl py-2 overflow-hidden backdrop-blur-xl">
                <div className="px-4 py-2 text-xs font-black uppercase text-hero-muted border-b border-hero-border mb-1 flex items-center justify-between">
                  <span>Characters</span>
                  {activeTags.length > 0 && (
                    <button 
                      onClick={() => setActiveTags([])}
                      className="text-[#DA8F44] hover:text-hero-text transition-colors"
                    >Clear</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {allTags.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-hero-text/30 italic">No characters found in loaded mods</div>
                  ) : (
                    allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-left hover:bg-hero-surface transition-colors group"
                      >
                        <span className={`font-bold transition-colors ${activeTags.includes(tag) ? 'text-[#DA8F44]' : 'text-hero-textSecondary group-hover:text-hero-text'}`}>
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
            <span className="text-[9px] text-hero-muted font-bold uppercase select-none" title="Scale Icons">A</span>
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
            <span className="text-sm text-hero-text/60 font-bold uppercase select-none" title="Scale Icons">A</span>
          </div>
        </div>
        
        {/* Status / Refresh / Login */}
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            {loading && <div className="w-1.5 h-1.5 rounded-full bg-[#DA8F44] animate-pulse shadow-[0_0_8px_rgba(218,143,68,0.8)]"></div>}
            <span className={`text-xs transition-all duration-300 font-bold tracking-wide ${loading ? 'text-[#DA8F44]' : 'text-hero-text/30'}`}>
              {status}
            </span>
          </div>
          <button 
            onClick={handleRefresh}
            disabled={loading || !token}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#DA8F44] hover:bg-[#b87838] disabled:opacity-50 text-hero-text rounded-lg transition-all"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          {token ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => invoke("open_nexus_login")}
                title="Connect Nexus Account (For Free Downloads)"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-hero-surface hover:bg-hero-surfaceHover text-hero-text border border-hero-border rounded-lg transition-all"
              >
                <LogIn size={14}/>
                <span className="hidden md:inline">Nexus Login</span>
              </button>
              <button onClick={handleLogout} title="Log Out" className="p-1.5 text-hero-text/30 hover:text-red-400 transition-colors">
                <LogOut size={14}/>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-hero-surface hover:bg-hero-surfaceHover text-hero-text border border-hero-border rounded-lg transition-all"
            >
              <LogIn size={12}/>
              Login
            </button>
          )}
        </div>
      </div>

      {/* Not logged in — guided two-step setup */}
      {!token && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-8">
          <div className="w-24 h-24 rounded-full bg-[#DA8F44]/20 flex items-center justify-center text-[#DA8F44]">
            <Key size={48} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-hero-text mb-2">Nexus Mods Integration</h3>
            <p className="text-hero-muted text-sm max-w-md">Two quick steps to browse and download mods:</p>
          </div>
          <div className="w-full max-w-md flex flex-col gap-3">
            {/* Step 1 — Sign in */}
            <div className="flex items-center gap-3 bg-hero-surface border border-hero-border rounded-xl p-4 text-left">
              <span className="w-7 h-7 rounded-full bg-[#DA8F44] text-black font-black text-xs flex items-center justify-center shrink-0">1</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-hero-text">Sign in to your Nexus account</p>
                <p className="text-[11px] text-hero-muted">Needed for free (slow) downloads</p>
              </div>
              <button
                onClick={() => {
                  invoke("open_nexus_login");
                  setNexusLoginStep(2);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-[#DA8F44] hover:bg-[#b87838] text-hero-text rounded-lg transition-all shrink-0"
              >
                <LogIn size={13}/>
                Sign In
              </button>
            </div>
            {/* Step 2 — API key (unlocked after step 1) */}
            <div className={`flex items-center gap-3 bg-hero-surface border border-hero-border rounded-xl p-4 text-left transition-all ${nexusLoginStep < 2 ? "opacity-40 pointer-events-none" : ""}`}>
              <span className="w-7 h-7 rounded-full bg-[#DA8F44] text-black font-black text-xs flex items-center justify-center shrink-0">2</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-hero-text">Enter your Personal API Key</p>
                <p className="text-[11px] text-hero-muted">Found at nexusmods.com/settings/api-keys</p>
              </div>
              <button
                onClick={() => setShowLogin(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-[#DA8F44] hover:bg-[#b87838] text-hero-text rounded-lg transition-all shrink-0"
              >
                <Key size={13}/>
                Enter Key
              </button>
            </div>
          </div>
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
              <StoreModCard
                key={mod.mod_id}
                source="nexus"
                mod={{
                  title: mod.name,
                  author: mod.author,
                  thumbnail: mod.picture_url || null,
                  tags: [],
                  typeTags: [],
                  links: [],
                  nexusModId: mod.mod_id,
                  fetchMore: async () => {
                    const res = await fetch(`https://api.nexusmods.com/v1/games/myheroultrarumble/mods/${mod.mod_id}/files.json`, {
                      headers: { apikey: token }
                    });
                    const data = await res.json();
                    if (data && data.files) {
                      const activeFiles = data.files.filter((f: NexusFile) =>
                        f.category_id === 1 || f.category_id === 2 || f.category_id === 3 || f.category_id === 5
                      );
                      return activeFiles.map((f: NexusFile) => ({
                        url: f.file_name,
                        label: f.file_name,
                        direct: true,
                        origin: "file",
                        nexusFileId: f.id[0],
                      }));
                    }
                    return [];
                  },
                  external: { label: "View on Nexus Mods", onClick: () => openUrl(`https://www.nexusmods.com/myheroultrarumble/mods/${mod.mod_id}`) },
                }}
                token={token}
                onDownloadedUrl={handleDownloadedUrl}
                downloadedUrls={downloadedUrls}
                localMods={localMods}
              />
            ))}
            {loading && Array.from({length: 4}).map((_, i) => (
              <div key={`skel-${i}`} className="bg-hero-card/40 border border-hero-border rounded-xl h-64 animate-pulse"></div>
            ))}
            {!loading && filteredMods.length === 0 && (
              <div className="col-span-full py-20 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-hero-surface flex items-center justify-center text-hero-text/20 mb-4">
                  <Search size={24} />
                </div>
                <h3 className="text-xl font-bold text-hero-text mb-2">No mods found</h3>
                <p className="text-hero-muted">Try adjusting your search</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
