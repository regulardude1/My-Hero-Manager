import { useState, useEffect } from "react";
import { FolderOpen, Globe, Settings, GripHorizontal, Search, CheckSquare, Square, Play, Eye } from "lucide-react";
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import ModelViewer from "./ModelViewer";
import { 
  DndContext, 
  closestCenter, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  horizontalListSortingStrategy, 
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const INITIAL_COLUMNS = [
  { id: "name", label: "Mod Name", width: "flex-1" },
  { id: "author", label: "Creator", width: "w-32" },
  { id: "version", label: "Ver", width: "w-20" },
  { id: "category", label: "Category", width: "w-32" },
  { id: "character", label: "Character", width: "w-40" }
];

// We will load the mods dynamically from the Rust backend
type Mod = {
  id: string;
  name: string;
  author: string;
  version: string;
  category: string;
  character: string;
  active: boolean;
  folder_path: string;
};

function SortableHeader({ id, label, width }: { id: string, label: string, width: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`${width} flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-hero-muted hover:text-hero-primary cursor-pointer transition-colors relative group py-2`}
      {...attributes} 
      {...listeners}
    >
      <GripHorizontal size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-hero-primary" />
      {label}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("Local");
  const [activeCategory, setActiveCategory] = useState("All Mods");
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [gamePath, setGamePath] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [mods, setMods] = useState<Mod[]>([]);
  const [selectedModId, setSelectedModId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch local mods when the app loads
    invoke("get_local_mods", { gamePath: null })
      .then((res: any) => {
        setMods(res);
      })
      .catch(console.error);
      
    // Try to auto-detect game path on load
    invoke("get_mhur_paks_path")
      .then((path: any) => {
        setGamePath(path);
      })
      .catch((e) => console.log("Auto-detect game path failed:", e));
  }, []);

  const toggleMod = (id: string) => {
    setMods(mods.map(mod => mod.id === id ? { ...mod, active: !mod.active } : mod));
  };

  // Dynamically calculate counts
  const categoryCounts = mods.reduce((acc, mod) => {
    const cat = mod.category || "OTHER";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categories = ["All Mods", "Skin", "Emote", "Voice", "Other"];
  
  const characterCounts = mods.reduce((acc, mod) => {
    const char = mod.character || "All";
    acc[char] = (acc[char] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const ALL_CHARACTERS = [
    "All", "All For One", "All Might", "Armored All Might", "Cementoss", 
    "Dabi", "Deku OFA", "Denki Kaminari", "Eijiro Kirishima", 
    "Fumikage Tokoyami", "Gang Orca", "Gran Torino",
    "Hawks", "Himiko Toga", "Ibara Shiozaki", "Inasa Yoarashi",
    "Itsuka Kendo", "Izuku Midoriya", "Katsuki Bakugo", 
    "Kyoka Jiro", "Lady Nagant", "Midnight", "Minoru Mineta",
    "Mirio Togata", "Momo Yaoyorozu", "Mr. Compress", "Mt. Lady", "Muscular",
    "Neito Monoma", "Nejire Hado", "Ochako Uraraka", "Overhaul", 
    "Present Mic", "Shigaraki AFO", "Shinso", "Shota Aizawa", 
    "Shoto Todoroki", "Sir Nighteye", "Stain", "Star and Stripe", 
    "Tamaki Amajiki", "Tenya Iida", "Tetsutetsu", 
    "Tsuyu Asui", "Twice"
  ];
  
  const characters = ALL_CHARACTERS;

  const sensors = useSensors(useSensor(PointerSensor));

  const handleRunGame = async () => {
    try {
      setIsLaunching(true);
      let path = gamePath;
      
      // If we don't know where the game is, try to auto-detect or ask the user!
      if (!path) {
        try {
          path = await invoke("get_mhur_paks_path");
          setGamePath(path);
        } catch (autoDetectError) {
          const selected = await open({
            directory: true,
            multiple: false,
            title: "Select your My Hero Ultra Rumble 'Paks' folder (HerovsGame/Content/Paks)"
          });
          if (!selected) {
            setIsLaunching(false);
            return; // User cancelled
          }
          path = selected as string;
          setGamePath(path);
        }
      }

      // 1. Deploy the active mods
      const activeModPaths = mods.filter(m => m.active).map(m => m.folder_path);
      await invoke("deploy_mods", { gamePath: path, activeModPaths });

      // 2. Launch the game via Steam
      await invoke("launch_game");
      
    } catch (e) {
      console.error(e);
      alert("Error: " + e);
    } finally {
      setIsLaunching(false);
    }
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  return (
    <div className="flex h-screen w-full bg-hero-bg text-white overflow-hidden selection:bg-hero-primary selection:text-black">
      
      {/* SIDEBAR */}
      <div className="w-64 bg-hero-sidebar flex flex-col shrink-0 border-r border-white/5 relative shadow-2xl z-20">
        
        {/* BRANDING */}
        <div className="p-6 pb-2">
          <h1 className="font-black text-2xl tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-br from-hero-primary to-orange-500 drop-shadow-sm">
            PLUS ULTRA
          </h1>
          <h2 className="font-bold text-[10px] uppercase tracking-[0.25em] text-hero-muted mt-[-2px]">
            Mod Manager
          </h2>
        </div>

        {/* MAIN NAV */}
        <div className="mt-8 px-4 space-y-1">
          <NavItem icon={<FolderOpen size={18} />} label="Local Library" active={activeTab === "Local"} onClick={() => setActiveTab("Local")} />
          <NavItem icon={<Globe size={18} />} label="Mod Discovery" active={activeTab === "Store"} onClick={() => setActiveTab("Store")} />
          <NavItem icon={<Settings size={18} />} label="Settings" active={activeTab === "Settings"} onClick={() => setActiveTab("Settings")} />
        </div>

        {/* FILTERS (Dynamic based on Tab) */}
        {activeTab === "Local" && (
          <div className="mt-8 px-5 flex-1 overflow-y-auto custom-scrollbar">
            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3">Categories</div>
            <FilterItem label="All Mods" count={mods.length} active={activeCategory === "All Mods"} onClick={() => setActiveCategory("All Mods")} />
            
            {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <FilterItem 
                key={cat} 
                label={cat} 
                count={count} 
                active={activeCategory === cat} 
                onClick={() => setActiveCategory(cat)} 
              />
            ))}

            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-8 mb-3">Characters</div>
            {characters.map((char) => (
              <FilterItem 
                key={char} 
                label={char} 
                count={char === "All" ? mods.length : (characterCounts[char] || 0)} 
                active={activeCategory === char} 
                onClick={() => setActiveCategory(char)} 
              />
            ))}
          </div>
        )}
        
        {/* GAME STATUS FOOTER */}
        <div className="p-4 mt-auto bg-black/20 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse"></div>
            <span className="text-xs font-bold text-hero-muted uppercase tracking-wider">MHUR Ready</span>
          </div>
          <div className="text-[10px] text-white/20">v2.0</div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-hero-bg to-[#050508]">
        
        {/* HEADER */}
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/5 bg-hero-sidebar/40 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-5">
            <h2 className="text-3xl font-black italic tracking-tight">{activeTab === "Local" ? "LOCAL LIBRARY" : activeTab === "Store" ? "MOD DISCOVERY" : "SETTINGS"}</h2>
            <div className="h-8 w-[2px] bg-white/10 transform rotate-12"></div>
            {activeTab === "Local" && (
               <span className="text-xs font-bold text-hero-primary bg-hero-primary/10 px-3 py-1.5 rounded-sm border border-hero-primary/20 tracking-wider">
               {mods.length} INSTALLED
             </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            
            <button 
              onClick={handleRunGame}
              disabled={isLaunching}
              className={`flex items-center gap-2 text-black font-black italic tracking-widest px-6 py-2.5 rounded-sm shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all duration-300 transform 
                ${isLaunching ? 'bg-hero-primary/50 cursor-not-allowed scale-100' : 'bg-hero-primary hover:bg-hero-primaryHover hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] hover:scale-105 active:scale-95'}`}
            >
              <Play size={18} fill="currentColor" />
              {isLaunching ? "DEPLOYING..." : "LAUNCH GAME"}
            </button>

            <div className="h-6 w-[1px] bg-white/10 mx-2"></div>

            <div className="relative group">
              <input 
                type="text" 
                placeholder="Search Plus Ultra..." 
                className="bg-black/40 border border-white/10 text-sm font-medium text-white px-4 py-2.5 rounded-sm outline-none w-64 focus:w-80 focus:border-hero-primary transition-all duration-300 placeholder:text-white/20 italic"
              />
              <Search size={16} className="absolute right-3 top-3 text-white/30 group-focus-within:text-hero-primary transition-colors" />
            </div>
          </div>
        </div>

        {/* CONTENT SPLIT (Table on Left, Model Viewer on Right) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* MOD TABLE (Hugging Left) */}
          <div className="w-[55%] flex flex-col p-6 overflow-y-auto custom-scrollbar border-r border-white/5">
              
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                {/* Draggable Header */}
                <div className="flex items-center px-4 pb-2 border-b-2 border-white/10 mb-4 select-none">
                  <div className="w-12 shrink-0"></div>
                  <div className="w-10 shrink-0"></div>
                  <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                    {columns.map(col => (
                      <SortableHeader key={col.id} id={col.id} label={col.label} width={col.width} />
                    ))}
                  </SortableContext>
                </div>
              </DndContext>

              {/* Dynamic Mod Rows */}
              <div className="space-y-1.5 pb-10">
                {mods
                  .filter(mod => activeCategory === "All Mods" || mod.category === activeCategory || mod.character === activeCategory)
                  .map((mod) => (
                  <div 
                    key={mod.id} 
                    onClick={() => setSelectedModId(mod.id)} 
                    className={`flex items-center px-4 py-3 rounded-sm group cursor-pointer border transition-all duration-200
                      ${selectedModId === mod.id ? 'bg-hero-primary/10 border-hero-primary/50' : 'bg-hero-card/40 border-white/5 hover:bg-hero-card/80 hover:border-hero-primary/30'}`}
                  >
                    
                    {/* Enabled Checkbox */}
                    <div 
                      className="w-12 shrink-0 text-hero-muted hover:text-white transition-colors cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMod(mod.id);
                      }}
                    >
                      {mod.active ? <CheckSquare size={18} className="text-hero-primary" /> : <Square size={18} />}
                    </div>

                    {/* Preview Eye Icon */}
                    <div className={`w-10 shrink-0 transition-colors ${selectedModId === mod.id ? 'text-hero-primary' : 'text-white/20 group-hover:text-white/60'}`}>
                      <Eye size={16} />
                    </div>
                    
                    {columns.map(col => {
                      if (col.id === "name") return <div key={col.id} className={`${col.width} shrink-0 font-bold text-white truncate pr-4 text-[13px]`}>{mod.name}</div>;
                      if (col.id === "author") return <div key={col.id} className={`${col.width} shrink-0 text-xs font-medium text-hero-muted truncate pr-4`}>{mod.author}</div>;
                      if (col.id === "version") return <div key={col.id} className={`${col.width} shrink-0 text-[10px] font-bold text-white/40 pr-4`}>{mod.version}</div>;
                      if (col.id === "category") return (
                        <div key={col.id} className={`${col.width} shrink-0 pr-4`}>
                          <span className="px-2 py-0.5 bg-white/5 text-hero-muted text-[9px] font-bold uppercase tracking-wider rounded-sm border border-white/5 group-hover:border-hero-primary/20 group-hover:text-hero-primary transition-colors">{mod.category}</span>
                        </div>
                      );
                      if (col.id === "character") return <div key={col.id} className={`${col.width} shrink-0 text-xs font-medium text-hero-muted truncate pr-4`}>{mod.character}</div>;
                      return null;
                    })}
                  </div>
                ))}
              </div>
              
          </div>

          {/* 3D MODEL VIEWER (Right Side) */}
          <div className="flex-1 bg-black/40 relative min-w-0 min-h-0 overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-t from-hero-bg to-transparent z-0 opacity-80 pointer-events-none"></div>
             
             {/* Glowing Grid Background Effect */}
             <div className="absolute inset-0 z-0 opacity-50 pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>

             <div className="absolute inset-0 z-10">
               <ModelViewer selectedMod={mods.find(m => m.id === selectedModId)} />
             </div>
          </div>

        </div>
      </div>

    </div>
  );
}

// Subcomponents
function NavItem({ icon, label, active, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-sm cursor-pointer transition-all duration-200 font-bold text-sm
      ${active ? 'bg-hero-primary/10 text-hero-primary border border-hero-primary/20' : 'text-hero-muted hover:bg-white/5 hover:text-white border border-transparent'}`}
    >
      <div className={active ? 'text-hero-primary' : 'text-white/40'}>{icon}</div>
      {label}
    </div>
  );
}

function FilterItem({ label, count, active, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer transition-all text-sm font-medium
      ${active ? 'bg-white/10 text-white' : 'text-hero-muted hover:bg-white/5 hover:text-white'}`}
    >
      <div className="truncate">{label}</div>
      {count !== undefined && (
        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${active ? 'bg-hero-primary text-black' : 'bg-black/30 text-white/40'}`}>
          {count}
        </div>
      )}
    </div>
  );
}

export default App;
