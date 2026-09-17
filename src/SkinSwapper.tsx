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
  const [swapperMode, setSwapperMode] = useState<"swap" | "add" | "remove">("swap");
  const [sourceSlot, setSourceSlot] = useState<string | null>(null);
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

  // Keep selectedMod in sync if the upstream mods list changes (e.g., after a refresh)
  useEffect(() => {
    if (selectedMod) {
      const updatedMod = mods.find(m => m.id === selectedMod.id);
      if (updatedMod && JSON.stringify(updatedMod.modified_files) !== JSON.stringify(selectedMod.modified_files)) {
        setSelectedMod(updatedMod);
      }
    }
  }, [mods, selectedMod]);

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
    setSourceSlot(null);
    
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

  const handleModifySlot = async (targetSlot: string) => {
    if (!selectedMod) return;
    
    if ((swapperMode === "swap" || swapperMode === "add") && !sourceSlot) {
      setSwapResult({ success: false, message: "Please select a source costume first." });
      return;
    }
    
    const actualTarget = swapperMode === "remove" ? "" : targetSlot;
    const actualSource = swapperMode === "remove" ? targetSlot : sourceSlot!;

    setIsSwapping(true);
    setSwapResult(null);
    try {
      const result = await invoke<string>("modify_skin_slot", {
        modId: selectedMod.id,
        modPath: selectedMod.folder_path,
        mode: swapperMode,
        sourceSlot: actualSource,
        targetSlot: actualTarget
      });
      setSwapResult({ success: true, message: result });
      
      // We don't need optimistic UI updates anymore since onModUpdated will trigger 
      // a full backend rescan (via fetchMods in App.tsx), which is more robust.
      setSourceSlot(null);

      if (onModUpdated) {
        // We pass the current selectedMod just as a signal to trigger the refresh
        onModUpdated(selectedMod);
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
        return mod.modified_files.some(file => file.includes("/Model/Default/Mesh/") || file.toLowerCase().includes("/model/default/mesh/"));
    }
    
    // For slots like Eq_A1_00, the file path might be /Model/Eq_A1_00/ or /Model/Eq/A1_00/
    const searchWithUnderscore = `/Model/${slotId}/Mesh/`.toLowerCase();
    const searchWithSlash = `/Model/${slotId.replace('_', '/')}/Mesh/`.toLowerCase();
    
    return mod.modified_files.some(file => 
      file.toLowerCase().includes(searchWithUnderscore) || file.toLowerCase().includes(searchWithSlash)
    );
  };

  return (
    <div className="flex-1 flex h-full bg-hero-bg text-hero-text overflow-hidden relative">
      {/* Sidebar - Character List */}
      <div className="w-1/4 min-w-[250px] bg-hero-sidebar border-r border-hero-border flex flex-col h-full overflow-y-auto z-10">
        <div className="p-6 pb-2 sticky top-0 bg-hero-sidebar z-10">
          <h2 className="text-2xl font-black italic tracking-tighter text-hero-accent flex items-center gap-2">
            <User size={24} /> CHARACTERS
          </h2>
          
          <div className="flex items-center gap-2 mt-4 mb-2">
            <button 
              onClick={() => setSortMode(sortMode === "count-desc" ? "count-asc" : "count-desc")}
              className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase tracking-widest transition-colors ${sortMode.startsWith("count") ? "bg-hero-accent text-black" : "bg-hero-surface text-hero-muted hover:bg-hero-surfaceHover hover:text-hero-text"}`}
            >
              Mods {sortMode === "count-desc" ? "↓" : sortMode === "count-asc" ? "↑" : ""}
            </button>
            <button 
              onClick={() => setSortMode(sortMode === "alpha-asc" ? "alpha-desc" : "alpha-asc")}
              className={`flex-1 py-1.5 text-[10px] font-black rounded uppercase tracking-widest transition-colors ${sortMode.startsWith("alpha") ? "bg-hero-accent text-black" : "bg-hero-surface text-hero-muted hover:bg-hero-surfaceHover hover:text-hero-text"}`}
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
                setSourceSlot(null);
              }}
              className={`w-full text-left px-4 py-3 rounded-md flex items-center justify-between group transition-all ${
                selectedChar === char 
                  ? "bg-hero-accent/20 border-l-4 border-hero-accent text-hero-text font-bold" 
                  : "hover:bg-hero-surface text-hero-textSecondary"
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
            <Shuffle size={64} className="mb-6 text-hero-accent animate-pulse" />
            <h3 className="text-2xl font-black tracking-widest italic mb-2">SKIN SWAPPER</h3>
            <p className="max-w-md text-center text-sm leading-relaxed">
              Select a character from the sidebar to view their installed skins and swap which costume slot they replace.
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full mx-auto w-full max-w-7xl">
            <h2 className="text-3xl font-black italic tracking-tighter mb-4 border-b border-hero-border pb-4">
              {selectedChar.toUpperCase()} SKINS
            </h2>

            {/* Mods List - Horizontal Scroller */}
            <div className="mb-8">
              <h3 className="text-sm font-bold text-hero-accent tracking-widest uppercase mb-3">1. Select Mod to Swap</h3>
              <div ref={scrollContainerRef} className="flex gap-4 overflow-x-auto pb-4">
                {charactersWithSkins[selectedChar]?.map(mod => (
                  <button
                    key={mod.id}
                    onClick={() => handleSelectMod(mod)}
                    className={`min-w-[250px] flex-shrink-0 text-left p-4 rounded-lg border transition-all ${
                      selectedMod?.id === mod.id
                        ? "bg-hero-accent/10 border-hero-accent shadow-[0_0_15px_rgba(250,204,21,0.15)]"
                        : "bg-black/20 border-hero-border hover:border-hero-borderHover"
                    }`}
                  >
                    <div className="font-bold text-lg truncate">{mod.name}</div>
                    <div className="text-xs text-hero-muted mt-1 truncate">by {mod.author}</div>
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
                  <h3 className="text-sm font-bold text-hero-accent tracking-widest uppercase">
                    2. Choose Mode & Target Slot for '{selectedMod.name}'
                  </h3>
                  {swapResult && (
                    <div className="flex flex-col items-end gap-1">
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold ${
                        swapResult.success ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                      }`}>
                        {swapResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {swapResult.success ? "Success" : "Failed"}
                      </div>
                      {!swapResult.success && (
                        <div className="text-[10px] text-red-400/80 max-w-sm text-right bg-black/40 p-2 rounded border border-red-900/30">
                          {swapResult.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mb-6 p-1 bg-black/40 rounded-lg border border-hero-border w-max">
                  <button onClick={() => { setSwapperMode("swap"); setSourceSlot(null); }} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all ${swapperMode === "swap" ? "bg-hero-accent text-black shadow-[0_0_15px_rgba(250,204,21,0.3)]" : "text-hero-muted hover:text-hero-text hover:bg-white/5"}`}>
                    ⇄ SWAP
                  </button>
                  <button onClick={() => { setSwapperMode("add"); setSourceSlot(null); }} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all ${swapperMode === "add" ? "bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.3)]" : "text-hero-muted hover:text-hero-text hover:bg-white/5"}`}>
                    + ADD
                  </button>
                  <button onClick={() => { setSwapperMode("remove"); setSourceSlot(null); }} className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all ${swapperMode === "remove" ? "bg-red-500 text-black shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "text-hero-muted hover:text-hero-text hover:bg-white/5"}`}>
                    - REMOVE
                  </button>
                </div>

                {isLoadingCostumes ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-black/20 rounded-xl border border-hero-border p-12">
                    <RefreshCw size={48} className="text-hero-accent animate-spin mb-4" />
                    <h4 className="text-xl font-bold mb-2">Extracting Game Files</h4>
                    <p className="text-hero-muted text-sm max-w-md text-center">
                      Please wait a few moments while we extract the game thumbnails. This might take some time on the first run.
                    </p>
                  </div>
                ) : costumeError ? (
                  <div className="flex-1 flex flex-col items-center justify-center bg-red-900/10 rounded-xl border border-red-500/20 p-12 text-center">
                    <AlertTriangle size={48} className="text-red-500 mb-4" />
                    <h4 className="text-xl font-bold text-red-400 mb-2">Extraction Failed</h4>
                    <p className="text-hero-textSecondary text-sm max-w-md">{costumeError}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {costumes.map(costume => {
                      const isCurrent = isCurrentSlot(selectedMod, costume.id);
                      const isSource = sourceSlot === costume.id;
                      const numCurrentSlots = costumes.filter(c => isCurrentSlot(selectedMod, c.id)).length;
                      
                      let buttonContent = null;
                      
                      if (isCurrent) {
                        if (swapperMode === "remove") {
                          const canRemove = numCurrentSlots > 1;
                          buttonContent = (
                            <button 
                              onClick={() => handleModifySlot(costume.id)}
                              disabled={!canRemove || isSwapping}
                              className={`w-full py-2 text-xs font-bold rounded flex justify-center items-center gap-2 transition-colors ${canRemove ? "bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-black border border-red-500/50" : "bg-hero-surface text-hero-muted cursor-not-allowed"}`}
                            >
                              {isSwapping ? <RefreshCw size={14} className="animate-spin" /> : null}
                              {canRemove ? "REMOVE MOD" : "CANNOT REMOVE LAST"}
                            </button>
                          );
                        } else {
                          buttonContent = (
                            <button 
                              onClick={() => setSourceSlot(costume.id)}
                              disabled={isSwapping}
                              className={`w-full py-2 text-xs font-bold rounded flex justify-center items-center gap-2 transition-all border ${isSource ? "bg-hero-accent text-black border-hero-accent shadow-[0_0_15px_rgba(250,204,21,0.5)]" : "bg-hero-surface text-hero-text hover:bg-white/10 border-hero-border"}`}
                            >
                              {isSource ? "SELECTED SOURCE" : "SELECT AS SOURCE"}
                            </button>
                          );
                        }
                      } else {
                        if (swapperMode === "remove") {
                          buttonContent = (
                            <button disabled className="w-full py-2 bg-hero-surface text-hero-muted/50 text-xs font-bold rounded cursor-not-allowed">
                              NOT MODDED
                            </button>
                          );
                        } else {
                          const actionText = swapperMode === "swap" ? "SWAP TO THIS" : "ADD TO THIS";
                          const buttonColor = swapperMode === "swap" ? "bg-hero-accent hover:bg-yellow-300 text-black shadow-[0_0_10px_rgba(250,204,21,0.2)]" : "bg-green-500 hover:bg-green-400 text-black shadow-[0_0_10px_rgba(34,197,94,0.2)]";
                          
                          buttonContent = (
                            <button 
                              onClick={() => handleModifySlot(costume.id)}
                              disabled={!sourceSlot || isSwapping}
                              className={`w-full py-2 text-xs font-bold rounded flex justify-center items-center gap-2 transition-colors ${sourceSlot ? buttonColor : "bg-hero-surface text-hero-muted cursor-not-allowed"}`}
                            >
                              {isSwapping ? <RefreshCw size={14} className="animate-spin" /> : null}
                              {sourceSlot ? actionText : "SELECT SOURCE FIRST"}
                            </button>
                          );
                        }
                      }

                      return (
                        <div key={costume.id} className={`flex flex-col bg-hero-bg border rounded-xl overflow-hidden shadow-lg transition-all ${isSource ? 'border-hero-accent scale-[1.02] ring-2 ring-hero-accent/30' : 'border-hero-border hover:scale-[1.02]'}`}>
                          <div className="aspect-[3/4] bg-black/40 relative flex items-center justify-center overflow-hidden">
                            <img 
                              src={convertFileSrc(costume.imagePath)} 
                              alt={costume.name}
                              className={`w-full h-full object-cover object-top transition-all ${isSource ? 'opacity-100 scale-105' : 'opacity-80'}`}
                              onError={(e) => { (e.target as HTMLImageElement).src = 'fallback-image-url-if-needed'; }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-hero-bg/95 via-hero-bg/40 to-transparent" />
                            
                            {isCurrent && (
                               <div className="absolute top-2 right-2 bg-hero-accent text-black text-[9px] font-black uppercase px-2 py-0.5 rounded-sm shadow-md">MODDED</div>
                            )}

                            <div className="absolute bottom-3 left-3 right-3 text-xs font-bold truncate drop-shadow-md">
                              {costume.name}
                              <div className="text-[10px] text-hero-textSecondary mt-0.5">{costume.id}</div>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-hero-card">
                            {buttonContent}
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
           <RefreshCw size={64} className="text-hero-accent animate-spin mb-6" />
           <h2 className="text-3xl font-black italic tracking-widest mb-2 text-hero-text">REPACKING MOD</h2>
           <p className="text-hero-textSecondary">Please do not close the application.</p>
        </div>
      )}

      {/* Global Success Overlay overlaying everything to show swap success */}
      {showSuccessOverlay && (
        <div className="absolute inset-0 bg-green-900/70 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-300">
           <div className="bg-green-500/20 p-8 rounded-full mb-8 shadow-[0_0_50px_rgba(34,197,94,0.4)]">
             <CheckCircle2 size={96} className="text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.8)]" />
           </div>
           <h2 className="text-5xl font-black italic tracking-widest mb-3 text-hero-text drop-shadow-xl shadow-black">SWAP SUCCESSFUL</h2>
           <p className="text-green-200/90 font-bold tracking-[0.2em] uppercase bg-black/40 px-6 py-2 rounded-full border border-green-500/30">Mod has been repacked for the new slot</p>
        </div>
      )}
    </div>
  );
}
