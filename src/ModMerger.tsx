import { useState, useMemo, useEffect } from "react";
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { RefreshCw, CheckCircle2, AlertCircle, Shuffle, AlertTriangle, SplitSquareVertical, Merge } from "lucide-react";

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
};

type Costume = {
  id: string;
  name: string;
  imagePath: string;
};

export default function ModMerger({ mods, gamePath, onModsChanged }: { mods: Mod[], gamePath: string | null, onModsChanged: () => void }) {
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState("");
  
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [isLoadingCostumes, setIsLoadingCostumes] = useState(false);
  const [costumeError, setCostumeError] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{success: boolean, message: string} | null>(null);

  const selectedModObjects = useMemo(() => {
    return mods.filter(m => selectedMods.has(m.id));
  }, [mods, selectedMods]);

  const toggleSelection = (modId: string) => {
    const newSet = new Set(selectedMods);
    if (newSet.has(modId)) newSet.delete(modId);
    else newSet.add(modId);
    setSelectedMods(newSet);
    setProcessResult(null);
  };

  // Determine character ID from selected mods
  const characterId = useMemo(() => {
    for (const mod of selectedModObjects) {
      if (mod.modified_files) {
        for (const file of mod.modified_files) {
          const match = file.match(/Character\/(Ch\d{3})/i);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
    }
    return null;
  }, [selectedModObjects]);

  // Fetch costumes when character ID changes
  useEffect(() => {
    if (!characterId) {
      setCostumes([]);
      setCostumeError(null);
      return;
    }
    
    if (!gamePath) {
      setCostumeError("Game path not configured. Cannot load preview.");
      return;
    }

    let isMounted = true;
    setIsLoadingCostumes(true);
    setCostumeError(null);
    
    invoke<Costume[]>("get_costumes", { gamePath, characterId })
      .then(fetched => {
        if (isMounted) setCostumes(fetched);
      })
      .catch(e => {
        if (isMounted) setCostumeError(e.toString());
      })
      .finally(() => {
        if (isMounted) setIsLoadingCostumes(false);
      });
      
    return () => { isMounted = false; };
  }, [characterId, gamePath]);

  const isCostumeOverwritten = (costumeId: string) => {
    const searchString = costumeId === "Default" ? "/Model/Default/" : `/Model/${costumeId}/`;
    return selectedModObjects.some(mod => 
      mod.modified_files && mod.modified_files.some(file => file.includes(searchString))
    );
  };

  const handleMerge = async () => {
    if (selectedModObjects.length < 2) return;
    if (!mergeName.trim()) {
      setProcessResult({ success: false, message: "Please enter a name for the merged mod." });
      return;
    }
    
    setIsProcessing(true);
    setProcessResult(null);
    try {
      const result = await invoke<string>("merge_mods", {
        modIds: selectedModObjects.map(m => m.id),
        newName: mergeName.trim()
      });
      setProcessResult({ success: true, message: result });
      setSelectedMods(new Set());
      setMergeName("");
      onModsChanged();
    } catch (e: any) {
      setProcessResult({ success: false, message: e.toString() });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSplit = async () => {
    if (selectedModObjects.length !== 1) return;
    
    setIsProcessing(true);
    setProcessResult(null);
    try {
      const result = await invoke<string>("split_mod", {
        modId: selectedModObjects[0].id
      });
      setProcessResult({ success: true, message: result });
      setSelectedMods(new Set());
      onModsChanged();
    } catch (e: any) {
      setProcessResult({ success: false, message: e.toString() });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex h-full bg-hero-bg text-white overflow-hidden relative">
      {/* Sidebar - Mod Selection List */}
      <div className="w-1/3 min-w-[300px] max-w-[400px] bg-[#1a1a24] border-r border-white/5 flex flex-col h-full overflow-hidden z-10 shadow-2xl">
        <div className="p-6 pb-4 bg-[#1a1a24] z-10 border-b border-white/5 shadow-md">
          <h2 className="text-2xl font-black italic tracking-tighter text-hero-primary flex items-center gap-2">
            <Merge size={24} /> SELECT MODS
          </h2>
          <p className="text-xs text-white/50 mt-2 uppercase tracking-widest font-bold leading-relaxed">
            Check the mods you wish to merge or split.
          </p>
          <div className="mt-4 flex justify-between items-center text-xs font-bold bg-black/40 px-3 py-2 rounded">
            <span>SELECTED: {selectedMods.size}</span>
            {selectedMods.size > 0 && (
              <button onClick={() => setSelectedMods(new Set())} className="text-red-400 hover:text-red-300 underline">
                CLEAR ALL
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {mods.map((mod) => (
            <label
              key={mod.id}
              className={`w-full flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all border ${
                selectedMods.has(mod.id)
                  ? "bg-hero-primary/10 border-hero-primary shadow-[0_0_15px_rgba(250,204,21,0.15)]"
                  : "bg-black/20 border-white/5 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              <div className="relative flex items-center justify-center w-5 h-5">
                <input 
                  type="checkbox" 
                  checked={selectedMods.has(mod.id)}
                  onChange={() => toggleSelection(mod.id)}
                  className="appearance-none w-5 h-5 rounded border border-white/30 checked:bg-hero-primary checked:border-hero-primary transition-all cursor-pointer"
                />
                {selectedMods.has(mod.id) && <CheckCircle2 size={14} className="absolute text-black pointer-events-none" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-bold text-sm truncate ${selectedMods.has(mod.id) ? "text-hero-primary" : "text-white"}`}>
                  {mod.name}
                </div>
                <div className="text-[10px] text-white/40 truncate uppercase tracking-wider mt-0.5">
                  {mod.character !== "Unknown" ? mod.character : mod.category}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto p-8 relative z-0">
        {selectedMods.size === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-50">
            <Shuffle size={64} className="mb-6 text-hero-primary animate-pulse" />
            <h3 className="text-3xl font-black tracking-widest italic mb-4">MOD MERGER & SPLITTER</h3>
            <p className="max-w-md text-center text-base leading-relaxed text-white/70">
              Select multiple mods from the left to merge them into a single unified mod pack.<br/><br/>
              Select a single merged pack to split it back into individual mods.
            </p>
          </div>
        ) : selectedMods.size === 1 ? (
          <div className="flex-1 flex flex-col mx-auto w-full max-w-3xl items-center justify-center">
            <div className="bg-[#15151b] border border-white/10 rounded-xl p-8 w-full shadow-2xl text-center">
              <SplitSquareVertical size={48} className="text-hero-primary mx-auto mb-6" />
              <h2 className="text-3xl font-black italic tracking-tighter mb-2">SPLIT MOD PACK</h2>
              <p className="text-white/60 text-sm max-w-md mx-auto mb-8 leading-relaxed">
                If the selected mod contains multiple <strong>.pak</strong> variations inside it, splitting will unpack them into individual toggleable mods in your library.
              </p>
              
              <div className="bg-black/30 border border-white/5 p-4 rounded-lg mb-8 text-left flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-hero-primary font-bold tracking-widest uppercase mb-1">Target Mod</div>
                  <div className="text-lg font-bold truncate">{selectedModObjects[0]?.name}</div>
                </div>
              </div>

              {processResult && (
                <div className={`mb-6 p-4 rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
                  processResult.success ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {processResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  {processResult.message}
                </div>
              )}

              <button 
                onClick={handleSplit}
                disabled={isProcessing}
                className="w-full py-4 bg-hero-primary text-black text-lg font-black italic tracking-widest rounded-sm hover:bg-yellow-300 transition-all shadow-[0_0_20px_rgba(250,204,21,0.2)] hover:shadow-[0_0_30px_rgba(250,204,21,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-3 transform hover:scale-[1.02] active:scale-95"
              >
                {isProcessing ? <RefreshCw size={20} className="animate-spin" /> : <SplitSquareVertical size={20} />}
                {isProcessing ? "SPLITTING..." : "EXPLODE MOD PACK"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full mx-auto w-full max-w-7xl">
            <div className="flex items-end justify-between mb-6 pb-4 border-b border-white/10">
              <div>
                <h2 className="text-3xl font-black italic tracking-tighter text-white">MERGE PREVIEW</h2>
                <p className="text-white/50 text-sm mt-1 uppercase tracking-widest font-bold">Grouping {selectedMods.size} mods together</p>
              </div>
            </div>

            {/* Merge Controls Area */}
            <div className="bg-[#15151b] border border-white/5 p-6 rounded-xl shadow-xl mb-8">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-hero-primary tracking-widest uppercase mb-2">New Mod Pack Name</label>
                  <input
                    type="text"
                    value={mergeName}
                    onChange={(e) => setMergeName(e.target.value)}
                    placeholder="e.g. Ultimate Toga Pack..."
                    className="w-full bg-black/40 border border-white/10 rounded px-4 py-3 text-white focus:outline-none focus:border-hero-primary focus:ring-1 focus:ring-hero-primary/50 transition-all font-bold"
                  />
                </div>
                <div className="flex-1 flex flex-col justify-end">
                  <button 
                    onClick={handleMerge}
                    disabled={isProcessing || !mergeName.trim()}
                    className="w-full h-[50px] bg-hero-primary text-black text-sm font-black italic tracking-widest rounded-sm hover:bg-yellow-300 transition-all shadow-[0_0_15px_rgba(250,204,21,0.2)] hover:shadow-[0_0_25px_rgba(250,204,21,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 transform hover:scale-[1.02] active:scale-95"
                  >
                    {isProcessing ? <RefreshCw size={18} className="animate-spin" /> : <Merge size={18} />}
                    {isProcessing ? "MERGING..." : "MERGE INTO ONE PACK"}
                  </button>
                </div>
              </div>
              
              {processResult && (
                <div className={`mt-4 p-3 rounded text-xs font-bold flex items-center gap-2 ${
                  processResult.success ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {processResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {processResult.message}
                </div>
              )}
            </div>

            {/* Visual Coverage Preview */}
            <div>
              <h3 className="text-sm font-bold text-hero-primary tracking-widest uppercase mb-4 flex items-center gap-2">
                <CheckCircle2 size={16} /> 
                Costume Coverage Preview
              </h3>
              
              {!characterId ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-white/50 italic text-sm">
                  Could not determine a specific character from the selected mods to show a visual preview.
                </div>
              ) : isLoadingCostumes ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-black/20 rounded-xl border border-white/5 p-12 min-h-[300px]">
                  <RefreshCw size={40} className="text-hero-primary animate-spin mb-4" />
                  <p className="text-white/50 text-sm font-bold uppercase tracking-widest">Loading Game Thumbnails...</p>
                </div>
              ) : costumeError ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-red-900/10 rounded-xl border border-red-500/20 p-8 text-center">
                  <AlertTriangle size={32} className="text-red-500 mb-3" />
                  <p className="text-white/70 text-xs max-w-md">{costumeError}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {costumes.map(costume => {
                    const overwritten = isCostumeOverwritten(costume.id);
                    return (
                      <div key={costume.id} className={`flex flex-col bg-[#15151b] border-2 rounded-lg overflow-hidden transition-all ${
                        overwritten ? "border-hero-primary shadow-[0_0_15px_rgba(250,204,21,0.2)] scale-[1.02] z-10" : "border-white/5 opacity-50"
                      }`}>
                        <div className="aspect-[3/4] bg-black/40 relative flex items-center justify-center overflow-hidden">
                          <img 
                            src={convertFileSrc(costume.imagePath)} 
                            alt={costume.name}
                            className="w-full h-full object-cover object-top"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2 text-[10px] font-bold leading-tight">
                            {costume.name}
                          </div>
                          
                          {overwritten && (
                            <div className="absolute top-2 right-2 bg-hero-primary text-black rounded-full p-1 shadow-lg">
                              <CheckCircle2 size={14} />
                            </div>
                          )}
                        </div>
                        {overwritten && (
                          <div className="bg-hero-primary py-1 px-2 text-center text-black text-[9px] font-black tracking-widest uppercase">
                            WILL OVERWRITE
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
