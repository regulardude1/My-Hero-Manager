import { useState, useMemo, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { RefreshCw, CheckCircle2, AlertCircle, Shuffle, User, AlertTriangle } from "lucide-react";

type Mod = {
  id: string;
  name: string;
  author: string;
  version: string;
  category: string;
  character: string;
  active: boolean;
  folder_path: string;
  modified_files: string[];
  created_at: number;
  pak_name?: string;
  pak_size?: number;
};

type Costume = {
  id: string;
  name: string;
  imagePath: string;
};

export default function SkinSwapper({ mods, gamePath, onModUpdated }: { mods: Mod[], gamePath: string | null, onModUpdated?: (mod: Mod) => void }) {
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [selectedMod, setSelectedMod] = useState<Mod | null>(null);
  const [sortMode, setSortMode] = useState<"alpha-asc" | "alpha-desc" | "count-desc" | "count-asc">("count-desc");

  
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [isLoadingCostumes, setIsLoadingCostumes] = useState(false);
  const [costumeError, setCostumeError] = useState<string | null>(null);
  
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapResult, setSwapResult] = useState<{success: boolean, message: string} | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Group skin mods by character
  const charactersWithSkins = useMemo(() => {
    const skinMods = mods.filter(m => {
        if (m.category !== "Skin" || !m.character || m.character === "All" || !m.modified_files) {
            return false;
        }
        
        // Ensure this is actually a costume skin, not an item/weapon mod
        // Costumes in MHUR are stored in specific subfolders under /Model/
        return m.modified_files.some(file => 
            file.includes("/Model/Default") || 
            file.includes("/Model/Costume") ||
            file.includes("/Model/Eq") ||
            file.includes("/Model/Sp") ||
            file.includes("/Model/Fm") ||
            file.includes("/Model/Or") ||
            file.includes("/Model/Jr")
        );
    });
    
    const grouped = skinMods.reduce((acc, mod) => {
      if (!acc[mod.character]) acc[mod.character] = [];
      acc[mod.character].push(mod);
      return acc;
    }, {} as Record<string, Mod[]>);
    return grouped;
  }, [mods]);

  const sortedCharacters = useMemo(() => {
    const entries = Object.entries(charactersWithSkins);
    return entries.sort((a, b) => {
      const charA = a[0];
      const charB = b[0];
      const countA = a[1].length;
      const countB = b[1].length;

      if (sortMode === "count-desc") {
        if (countA !== countB) return countB - countA;
        return charA.localeCompare(charB);
      } else if (sortMode === "count-asc") {
        if (countA !== countB) return countA - countB;
        return charA.localeCompare(charB);
      } else if (sortMode === "alpha-asc") {
        return charA.localeCompare(charB);
      } else if (sortMode === "alpha-desc") {
        return charB.localeCompare(charA);
      }
      return 0;
    });
  }, [charactersWithSkins, sortMode]);

  const affectedChars = useMemo(() => {
    if (!selectedMod || !selectedMod.modified_files) return new Set<string>();
    const chars = new Set<string>();
    selectedMod.modified_files.forEach(file => {
      const match = file.match(/\/Character\/Ch(\d{3})\//);
      if (match && match[1] !== "000") {
        chars.add(match[1]);
      }
    });
    return chars;
  }, [selectedMod]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [selectedChar, charactersWithSkins]);

  const handleSelectMod = async (mod: Mod) => {
    setSelectedMod(mod);
    setSwapResult(null);
    setCostumes([]);
    setCostumeError(null);
    
    if (!gamePath) {
      setCostumeError("Game path is not configured. Please set the My Hero Ultra Rumble path in Settings to extract game thumbnails.");
      return;
    }

    // Extract ChXXX from modified_files
    let characterId = "";
    if (mod.modified_files) {
        for (const file of mod.modified_files) {
            const match = file.match(/Character\/(Ch\d{3})/i);
            if (match && match[1]) {
                characterId = match[1];
                break;
            }
        }
    }

    if (!characterId) {
        setCostumeError("Could not determine the internal character ID (ChXXX) for this mod from its file structure.");
        return;
    }

    setIsLoadingCostumes(true);
    try {
      const fetchedCostumes = await invoke<Costume[]>("get_costumes", {
        gamePath: gamePath,
        characterId: characterId
      });
      setCostumes(fetchedCostumes);
    } catch (e: any) {
      setCostumeError(e.toString());
    } finally {
      setIsLoadingCostumes(false);
    }
  };

  const handleSwap = async (targetSlot: string) => {
    if (!selectedMod) return;
    setIsSwapping(true);
    setSwapResult(null);
    try {
      const result = await invoke<string>("swap_skin_slot", {
        modId: selectedMod.id,
        modPath: selectedMod.folder_path,
        targetSlot: targetSlot
      });
      setSwapResult({ success: true, message: result });
      
      // Optimistically update the UI to show the new slot immediately
      const targetStr = targetSlot === "Default" ? "Default" : targetSlot;
      const updatedFiles = selectedMod.modified_files.map(file => {
          return file.replace(/\/Model\/[^\/]+\//, `/Model/${targetStr}/`);
      });
      
      const newMod = {
          ...selectedMod,
          modified_files: updatedFiles
      };
      setSelectedMod(newMod);

      if (onModUpdated) {
        onModUpdated(newMod);
      }
      setShowSuccessOverlay(true);
      setTimeout(() => setShowSuccessOverlay(false), 2500);
    } catch (e: any) {
      setSwapResult({ success: false, message: e.toString() });
    } finally {
      setIsSwapping(false);
    }
  };

  // Helper to determine if the mod is already mapped to this slot
  const isCurrentSlot = (mod: Mod, slotId: string) => {
    if (!mod.modified_files) return false;
    
    if (slotId === "Default") {
        return mod.modified_files.some(file => file.includes("/Model/Default/"));
    }
    
    // For slots like Eq_A1_00, the file path might be /Model/Eq_A1_00/ or /Model/Eq/A1_00/
    const searchWithUnderscore = `/Model/${slotId}/`;
    const searchWithSlash = `/Model/${slotId.replace('_', '/')}/`;
    
    return mod.modified_files.some(file => 
      file.includes(searchWithUnderscore) || file.includes(searchWithSlash)
    );
  };

  return (
    <div className="flex-1 flex h-full bg-hero-bg text-white overflow-hidden relative">
      {/* Sidebar - Character List */}
      <div className="w-1/4 min-w-[250px] bg-[#1a1a24] border-r border-white/5 flex flex-col h-full overflow-y-auto z-10">
        <div className="p-6 pb-2 sticky top-0 bg-[#1a1a24] z-10">
          <h2 className="text-2xl font-black italic tracking-tighter text-hero-primary flex items-center gap-2">
            <User size={24} /> CHARACTERS
          </h2>
          
          <div className="flex items-center gap-2 mt-4 mb-2">
            <button 
              onClick={() => setSortMode(sortMode === "count-desc" ? "count-asc" : "count-desc")}
              className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase tracking-widest transition-colors ${sortMode.startsWith("count") ? "bg-hero-primary text-black" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"}`}
            >
              Mods {sortMode === "count-desc" ? "↓" : sortMode === "count-asc" ? "↑" : ""}
            </button>
            <button 
              onClick={() => setSortMode(sortMode === "alpha-asc" ? "alpha-desc" : "alpha-asc")}
              className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase tracking-widest transition-colors ${sortMode.startsWith("alpha") ? "bg-hero-primary text-black" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"}`}
            >
              {sortMode === "alpha-desc" ? "Z-A" : "A-Z"}
            </button>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-1">
          {sortedCharacters.map(([char, charMods]) => (
            <button
              key={char}
              onClick={() => {
                setSelectedChar(char);
                setSelectedMod(null);
                setCostumes([]);
                setSwapResult(null);
              }}
              className={`w-full text-left px-4 py-3 rounded-md flex items-center justify-between group transition-all ${
                selectedChar === char 
                  ? "bg-hero-primary/20 border-l-4 border-hero-primary text-white font-bold" 
                  : "hover:bg-white/5 text-white/70"
              }`}
            >
              <span>{char}</span>
              <span className="text-xs bg-black/40 px-2 py-1 rounded-full">{charMods.length}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto p-8 relative z-0">
        {!selectedChar ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-50">
            <Shuffle size={64} className="mb-6 text-hero-primary animate-pulse" />
            <h3 className="text-2xl font-black tracking-widest italic mb-2">SKIN SWAPPER</h3>
            <p className="max-w-md text-center text-sm leading-relaxed">
              Select a character from the sidebar to view their installed skins and swap which costume slot they replace.
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full mx-auto w-full max-w-7xl">
            <h2 className="text-3xl font-black italic tracking-tighter mb-4 border-b border-white/10 pb-4">
              {selectedChar.toUpperCase()} SKINS
            </h2>

            {/* Mods List - Horizontal Scroller */}
            <div className="mb-8">
              <h3 className="text-sm font-bold text-hero-primary tracking-widest uppercase mb-3">1. Select Mod to Swap</h3>
              <div ref={scrollContainerRef} className="flex gap-4 overflow-x-auto pb-4">
                {charactersWithSkins[selectedChar]?.map(mod => (
                  <button
                    key={mod.id}
                    onClick={() => handleSelectMod(mod)}
                    className={`min-w-[250px] flex-shrink-0 text-left p-4 rounded-lg border transition-all ${
                      selectedMod?.id === mod.id
                        ? "bg-hero-primary/10 border-hero-primary shadow-[0_0_15px_rgba(250,204,21,0.15)]"
                        : "bg-black/20 border-white/5 hover:border-white/20"
                    }`}
                  >
                    <div className="font-bold text-lg truncate">{mod.name}</div>
                    <div className="text-xs text-white/50 mt-1 truncate">by {mod.author}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Slots Grid */}
            {selectedMod && (
              <div className="flex-1 flex flex-col">
                {affectedChars.size > 1 && (
                  <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-4 rounded-lg mb-6 flex items-start gap-3 animate-in fade-in zoom-in-95 duration-300">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-bold text-red-300 mb-1">Warning: Multi-Character Mod Detected</p>
                      <p>This mod modifies <strong>{affectedChars.size}</strong> different characters. Swapping its slot here will apply to all of them, which may break the mod for the other characters. Proceed with caution.</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-hero-primary tracking-widest uppercase">
                    2. Choose Target Slot for '{selectedMod.name}'
                  </h3>
                  {swapResult && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold ${
                      swapResult.success ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}>
                      {swapResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                      {swapResult.success ? "Swap Successful" : "Swap Failed"}
                    </div>
                  )}
                </div>

                {isLoadingCostumes ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-black/20 rounded-xl border border-white/5 p-12">
                    <RefreshCw size={48} className="text-hero-primary animate-spin mb-4" />
                    <h4 className="text-xl font-bold mb-2">Extracting Game Files</h4>
                    <p className="text-white/50 text-sm max-w-md text-center">
                      Please wait a few moments while we extract the game thumbnails. This might take some time on the first run.
                    </p>
                  </div>
                ) : costumeError ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-red-900/10 rounded-xl border border-red-500/20 p-12 text-center">
                    <AlertTriangle size={48} className="text-red-500 mb-4" />
                    <h4 className="text-xl font-bold text-red-400 mb-2">Extraction Failed</h4>
                    <p className="text-white/70 text-sm max-w-md">{costumeError}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {costumes.map(costume => {
                      const isCurrent = isCurrentSlot(selectedMod, costume.id);
                      return (
                        <div key={costume.id} className="flex flex-col bg-[#15151b] border border-white/5 rounded-xl overflow-hidden shadow-lg transition-transform hover:scale-[1.02]">
                          <div className="aspect-[3/4] bg-black/40 relative flex items-center justify-center overflow-hidden">
                            <img 
                              src={convertFileSrc(costume.imagePath)} 
                              alt={costume.name}
                              className="w-full h-full object-cover object-top"
                              onError={(e) => { (e.target as HTMLImageElement).src = 'fallback-image-url-if-needed'; }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                            <div className="absolute bottom-3 left-3 right-3 text-xs font-bold truncate drop-shadow-md">
                              {costume.name}
                              <div className="text-[10px] text-white/50">{costume.id}</div>
                            </div>
                          </div>
                          
                          <div className="p-3">
                            {isCurrent ? (
                              <button disabled className="w-full py-2 bg-white/5 text-white/40 text-xs font-bold rounded cursor-not-allowed">
                                BASE MOD GOES OVER THIS
                              </button>
                            ) : (
                              <button 
                                onClick={() => handleSwap(costume.id)}
                                disabled={isSwapping}
                                className="w-full py-2 bg-hero-primary text-black text-xs font-bold rounded hover:bg-yellow-300 transition-colors shadow-[0_0_10px_rgba(250,204,21,0.2)] hover:shadow-[0_0_15px_rgba(250,204,21,0.5)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                              >
                                {isSwapping ? <RefreshCw size={14} className="animate-spin" /> : null}
                                {isSwapping ? "SWAPPING..." : "SWAP TO THIS"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Global Swapping Overlay overlaying everything to block input during long swaps */}
      {isSwapping && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
           <RefreshCw size={64} className="text-hero-primary animate-spin mb-6" />
           <h2 className="text-3xl font-black italic tracking-widest mb-2 text-white">REPACKING MOD</h2>
           <p className="text-white/70">Please do not close the application.</p>
        </div>
      )}

      {/* Global Success Overlay overlaying everything to show swap success */}
      {showSuccessOverlay && (
        <div className="absolute inset-0 bg-green-900/70 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
           <div className="bg-green-500/20 p-8 rounded-full mb-8 shadow-[0_0_50px_rgba(34,197,94,0.4)]">
             <CheckCircle2 size={96} className="text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.8)]" />
           </div>
           <h2 className="text-5xl font-black italic tracking-widest mb-3 text-white drop-shadow-xl shadow-black">SWAP SUCCESSFUL</h2>
           <p className="text-green-200/90 font-bold tracking-[0.2em] uppercase bg-black/40 px-6 py-2 rounded-full border border-green-500/30">Mod has been repacked for the new slot</p>
        </div>
      )}
    </div>
  );
}
