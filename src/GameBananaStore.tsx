import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Filter, Check, ChevronDown } from "lucide-react";
import { StoreModCard } from "./components/StoreModCard";

// ── Types ─────────────────────────────────────────────────────────────
interface GameBananaMod {
  _idRow: number;
  _sName: string;
  _sProfileUrl: string;
  _tsDateAdded: number;
  _aSubmitter: {
    _sName: string;
  };
  _aPreviewMedia?: {
    _aImages?: Array<{ _sBaseUrl: string; _sFile: string }>;
  };
  _aTags?: string[];
  _aSubCategory?: { _sName: string };
  _bHasContentRatings?: boolean;
}

interface GameBananaFile {
  _idRow: number;
  _sFile: string;
  _nFilesize: number;
  _sDownloadUrl: string;
}

// ── Main GameBanana Store Panel ──────────────────────────────────────────
export default function GameBananaStore({ allow18Plus = true, localMods = [], onModInstalled }: { allow18Plus?: boolean; localMods?: any[], onModInstalled?: () => void }) {
  const [mods, setMods] = useState<GameBananaMod[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Click Refresh to load mods");
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [cardSize, setCardSize] = useState(() => {
    try {
      const stored = localStorage.getItem("global_card_size");
      return stored ? Number(stored) : 240;
    } catch {
      return 240;
    }
  });

  // Handle outside click for dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showTagDropdown && !(e.target as Element).closest('.gb-filter-dropdown')) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTagDropdown]);

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

  const fetchMods = useCallback(async (pageNumber: number) => {
    setLoading(true);
    setStatus("Fetching from GameBanana...");
    try {
      let url = `https://gamebanana.com/apiv11/Game/19496/Subfeed?_nPage=${pageNumber}&_sSort=new&_csvModelInclusions=Mod`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data._aRecords) {
        if (pageNumber === 1) {
          setMods(data._aRecords);
        } else {
          setMods(prev => [...prev, ...data._aRecords]);
        }
        setHasMore(!data._aMetadata._bIsComplete);
        setStatus(`Loaded ${data._aRecords.length} mods from GameBanana`);
      } else {
        setStatus("No mods found or invalid format");
        setHasMore(false);
      }
    } catch (e: any) {
      setStatus("Error fetching mods: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMods(1);
  }, []);

  const handleRefresh = () => {
    setPage(1);
    fetchMods(1);
  };

  const handleNextPage = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMods(nextPage);
  }, [page, fetchMods]);
  
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 150) {
      if (!loading && hasMore) {
        handleNextPage();
      }
    }
  };

  const allTags = Array.from(new Set(mods.map(m => m._aSubCategory?._sName).filter(Boolean))).sort() as string[];

  const filteredMods = mods.filter(m => {
    if (allow18Plus === false && m._bHasContentRatings) return false;
    if (activeTags.length > 0 && (!m._aSubCategory?._sName || !activeTags.includes(m._aSubCategory._sName))) return false;
    return m._sName.toLowerCase().includes(search.toLowerCase()) || 
           m._aSubmitter._sName.toLowerCase().includes(search.toLowerCase());
  });

  const toggleTag = (tag: string) => {
    setActiveTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Auto-fetch more pages if filters make the list too short to scroll
  useEffect(() => {
    if (!loading && hasMore && filteredMods.length < 12) {
      const timer = setTimeout(() => {
        handleNextPage();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [filteredMods.length, loading, hasMore, handleNextPage]);

  return (
    <div className="flex flex-col h-full bg-hero-bg">
      {/* Top Navigation / Status Bar (Matched with DiscordStore) */}
      <div className="shrink-0 flex items-center justify-between p-4 bg-hero-sidebar border-b border-hero-border relative z-20 shadow-md">
        
        {/* Breadcrumb / Nav */}
        <div className="flex items-center gap-4 relative">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#e3b044] text-hero-text flex items-center justify-center font-black text-lg border border-hero-border shrink-0">
              🍌
            </div>
            <div className="flex flex-col">
              <h2 className="text-[10px] font-black italic tracking-widest text-hero-muted flex items-center gap-2 uppercase">
                GAMEBANANA
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
              className="w-full pl-9 pr-4 py-2 text-xs bg-black/40 border border-hero-border rounded-lg text-hero-text placeholder:text-hero-text/20 focus:border-[#e3b044] outline-none transition-colors"
            />
          </div>

          {/* Filter Dropdown */}
          <div className="relative shrink-0 gb-filter-dropdown z-50">
            <button
              onClick={() => setShowTagDropdown(!showTagDropdown)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border transition-all ${
                activeTags.length > 0 
                  ? 'bg-[#e3b044]/10 border-[#e3b044]/30 text-[#e3b044]' 
                  : 'bg-black/40 border-hero-border text-hero-textSecondary hover:bg-hero-surface hover:text-hero-text'
              }`}
            >
              <Filter size={14} />
              <span className="hidden sm:inline">Filters</span>
              {activeTags.length > 0 && (
                <span className="flex items-center justify-center w-4 h-4 text-[9px] bg-[#e3b044] text-black rounded-full ml-1">
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
                      className="text-[#e3b044] hover:text-hero-text transition-colors"
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
                        <span className={`font-bold transition-colors ${activeTags.includes(tag) ? 'text-[#e3b044]' : 'text-hero-textSecondary group-hover:text-hero-text'}`}>
                          {tag}
                        </span>
                        {activeTags.includes(tag) && (
                          <Check size={14} className="text-[#e3b044]" />
                        )}
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
              style={{ accentColor: "#e3b044" }}
            />
            <span className="text-sm text-hero-text/60 font-bold uppercase select-none" title="Scale Icons">A</span>
          </div>
        </div>
        
        {/* Status / Refresh */}
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
            {loading && <div className="w-1.5 h-1.5 rounded-full bg-[#e3b044] animate-pulse shadow-[0_0_8px_rgba(227,176,68,0.8)]"></div>}
            <span className={`text-xs transition-all duration-300 font-bold tracking-wide ${loading ? 'text-[#e3b044]' : 'text-hero-text/30'}`}>
              {status}
            </span>
          </div>
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#e3b044] hover:bg-[#c99a36] disabled:opacity-50 text-hero-text rounded-lg transition-all"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Mod Grid */}
      <div 
        className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar relative"
        onScroll={handleScroll}
      >
        <div 
          className="grid gap-4 md:gap-6 pb-20"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}
        >
          {filteredMods.map(mod => (
            <StoreModCard
              key={mod._idRow}
              source="gamebanana"
              mod={{
                title: mod._sName,
                author: mod._aSubmitter._sName,
                thumbnail: mod._aPreviewMedia?._aImages?.[0] ? `${mod._aPreviewMedia._aImages[0]._sBaseUrl}/${mod._aPreviewMedia._aImages[0]._sFile}` : null,
                tags: (mod._aTags ?? []).slice(0, 3),
                typeTags: [],
                links: [],
                fetchMore: async () => {
                  const res = await fetch(`https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${mod._idRow}&fields=name,Files().aFiles()`);
                  const data = await res.json();
                  if (data && data[1]) {
                    return (Object.values(data[1]) as GameBananaFile[]).map(f => ({
                      url: f._sDownloadUrl,
                      label: f._sFile,
                      direct: true,
                      origin: "file",
                    }));
                  }
                  return [];
                },
                external: { label: "View on GameBanana", onClick: () => window.open(mod._sProfileUrl, "_blank") },
              }}
              token=""
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
        
        {/* Infinite Scroll Status */}
        {filteredMods.length > 0 && (
          <div className="py-8 flex justify-center">
            {loading ? (
              <div className="flex items-center gap-2 text-[#e3b044] text-sm font-bold">
                <RefreshCw size={14} className="animate-spin" /> Loading more...
              </div>
            ) : !hasMore ? (
              <div className="text-hero-text/30 text-sm font-bold">No more mods available</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
