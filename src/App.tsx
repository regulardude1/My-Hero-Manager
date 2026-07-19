import { useState, useEffect, useMemo, useRef } from "react";
import { FolderOpen, Globe, Settings, GripHorizontal, Search, CheckSquare, Square, Play, Eye, Upload, X, Plus, Edit2, Folder, Trash2, ArrowDown, ArrowUp, Shuffle, MoreVertical, Save, Info, Merge, LogOut } from "lucide-react";
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import ModelViewer from "./ModelViewer";
import DiscordStore from "./DiscordStore";
import GameBananaStore from "./GameBananaStore";
import ModDiscovery from "./ModDiscovery";
import SkinSwapper from "./SkinSwapper";
import NexusModsStore from "./NexusModsStore";
import ModMerger from "./ModMerger";
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
import { Component, ReactNode } from 'react';

class GlobalErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: string, stack: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '', stack: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message, stack: error.stack || '' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-[#15151b] text-white p-8 overflow-auto">
          <div className="text-6xl mb-4">💥</div>
          <h1 className="text-2xl font-black text-red-500 mb-2">CRITICAL UI CRASH</h1>
          <p className="text-sm text-gray-400 mb-6 max-w-2xl text-center">
            The React application encountered an unhandled exception during rendering.
          </p>
          <div className="bg-black/50 border border-red-500/30 rounded-lg p-6 max-w-4xl w-full text-left font-mono text-xs text-red-300 overflow-x-auto whitespace-pre-wrap shadow-2xl">
            <div className="font-bold text-red-400 mb-4 text-sm border-b border-red-500/20 pb-2">{this.state.error}</div>
            {this.state.stack}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 px-6 py-3 bg-yellow-400 text-black font-black italic tracking-widest rounded-sm hover:bg-yellow-300 transition-colors shadow-[0_0_15px_rgba(250,204,21,0.3)]"
          >
            RELOAD APPLICATION
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  modified_files: string[];
  created_at: number;
  url?: string;
  pak_name?: string;
  pak_size?: number;
};

type ContextMenuState = { x: number; y: number; modId: string } | null;
type Collection = { id: string; name: string; activeMods: string[] };

const getModDescription = (mod: Mod) => {
  if (!mod.modified_files || mod.modified_files.length === 0) return "No detailed file information available.";
  
  const costumes = new Set<string>();
  let hasUi = false;
  let hasAudio = false;
  let isEmote = mod.category === "Emote";
  
  mod.modified_files.forEach(file => {
    if (file.includes("/Model/Default/")) costumes.add("Default Costume");
    else if (file.includes("/Model/Costume_01/")) costumes.add("Costume 01");
    else if (file.includes("/Model/Costume_02/")) costumes.add("Costume 02");
    else if (file.includes("/Model/Costume_03/")) costumes.add("Costume 03");
    else if (file.includes("/Model/Sp/")) {
       const match = file.match(/\/Model\/Sp\/([^\/]+)\//);
       if (match) costumes.add(`Special Costume (${match[1]})`);
    }
    
    if (file.includes("/UI/") || file.includes("/GUI/")) hasUi = true;
    if (file.includes("/Sound/") || file.includes("/Audio/")) hasAudio = true;
  });
  
  let lines = [];
  if (costumes.size > 0) {
    lines.push(`• Overwrites: ${Array.from(costumes).join(", ")}`);
  }
  if (isEmote) {
     lines.push("• Modifies Emote Animations/Audio");
  }
  if (hasUi) lines.push("• Includes UI/HUD modifications");
  if (hasAudio) lines.push("• Includes Custom Sound/Audio");
  
  if (lines.length === 0) {
    return "• Modifies core game files: " + mod.modified_files[0].split('/').pop();
  }
  
  return lines.join("\n");
};

function SortableHeader({ id, label, width, sortConfig, onSort }: { id: string, label: string, width: string, sortConfig: { key: string, direction: 'asc' | 'desc' } | null, onSort: (key: string) => void }) {
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
      className={`${width} min-w-0 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-hero-muted transition-colors relative group py-2`}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-white/5 rounded-sm">
        <GripHorizontal size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-hero-primary" />
      </div>
      <div 
        className="flex items-center gap-1.5 flex-1 cursor-pointer hover:text-hero-primary select-none py-1"
        onClick={() => onSort(id)}
      >
        {label}
        {sortConfig?.key === id && (
          <span className="text-hero-primary">
            {sortConfig.direction === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
          </span>
        )}
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("Local");
  const [activeCategory, setActiveCategory] = useState("All Mods");
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [gamePath, setGamePath] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mods, setMods] = useState<Mod[]>([]);
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(new Set());
  const [lastClickedModId, setLastClickedModId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [collectionMenu, setCollectionMenu] = useState<{ x: number; y: number; colId: string } | null>(null);
  const [renamingModId, setRenamingModId] = useState<string | null>(null);
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [renamingText, setRenamingText] = useState("");
  const [viewingModDetailsId, setViewingModDetailsId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>(() => {
    try { return JSON.parse(localStorage.getItem("plus_ultra_collections") || "[]"); }
    catch { return []; }
  });
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'created_at', direction: 'desc' });

  const [minimizeToTray, setMinimizeToTray] = useState(() => localStorage.getItem("minimizeToTray") === "true");
  const [allow18Plus, setAllow18Plus] = useState(() => localStorage.getItem("allow18Plus") === "true");

  useEffect(() => {
    // Tell Rust the initial state
    invoke('set_minimize_to_tray', { enabled: minimizeToTray }).catch(console.error);
  }, [minimizeToTray]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else {
        setSortConfig({ key: 'created_at', direction: 'desc' });
        return;
      }
    }
    setSortConfig({ key, direction });
  };

  useEffect(() => {
    setSearchQuery("");
  }, [activeTab]);

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
      setCollectionMenu(null);
    };
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const saveCollections = (cols: Collection[]) => {
    setCollections(cols);
    localStorage.setItem("plus_ultra_collections", JSON.stringify(cols));
  };

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    const newCol: Collection = {
      id: Date.now().toString(),
      name: newCollectionName.trim(),
      activeMods: mods.filter(m => m.active).map(m => m.id)
    };
    saveCollections([...collections, newCol]);
    setNewCollectionName("");
    setIsCreatingCollection(false);
    setActiveCategory(newCol.id);
  };

  const handleApplyCollection = (colId: string) => {
    const col = collections.find(c => c.id === colId);
    if (!col) return;
    const activeSet = new Set(col.activeMods);
    const newMods = mods.map(m => ({ ...m, active: activeSet.has(m.id) }));
    setMods(newMods);
    setActiveCategory(colId);
    computeConflicts(newMods);
  };

  const handleUpdateCollection = (colId: string) => {
    const cols = collections.map(c => {
      if (c.id === colId) {
        return { ...c, activeMods: mods.filter(m => m.active).map(m => m.id) };
      }
      return c;
    });
    saveCollections(cols);
    alert("Collection updated with current active mods!");
  };

  const handleDeleteCollection = (colId: string) => {
    saveCollections(collections.filter(c => c.id !== colId));
    if (activeCategory === colId) setActiveCategory("All Mods");
  };

  const handleRenameSubmit = async (modId: string) => {
    if (!renamingText.trim()) {
      setRenamingModId(null);
      return;
    }
    try {
      await invoke("rename_mod", { id: modId, newName: renamingText });
      setMods(mods.map(m => m.id === modId ? { ...m, name: renamingText } : m));
    } catch (e) {
      alert("Rename failed: " + e);
    }
    setRenamingModId(null);
  };

  const handleRenameCollectionSubmit = (colId: string) => {
    if (!renamingText.trim()) {
      setRenamingCollectionId(null);
      return;
    }
    const cols = collections.map(c => c.id === colId ? { ...c, name: renamingText.trim() } : c);
    saveCollections(cols);
    setRenamingCollectionId(null);
  };

  const handleDeleteMod = async (modId: string) => {
    if (confirm("Are you sure you want to permanently delete this mod?")) {
      try {
        await invoke("delete_mod", { id: modId });
        const newMods = mods.filter(m => m.id !== modId);
        setMods(newMods);
        setSelectedModIds(prev => {
          const next = new Set(prev);
          next.delete(modId);
          return next;
        });
        if (lastClickedModId === modId) setLastClickedModId(null);
        window.dispatchEvent(new Event("mod-deleted"));
        computeConflicts(newMods);
      } catch (e) {
        alert("Delete failed: " + e);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedModIds.size === 0) return;
    if (confirm(`Are you sure you want to permanently delete ${selectedModIds.size} mods?`)) {
      try {
        const promises = Array.from(selectedModIds).map(id => invoke("delete_mod", { id }));
        await Promise.allSettled(promises);
        const newMods = mods.filter(m => !selectedModIds.has(m.id));
        setMods(newMods);
        setSelectedModIds(new Set());
        setLastClickedModId(null);
        window.dispatchEvent(new Event("mod-deleted"));
        computeConflicts(newMods);
      } catch (e) {
        alert("Bulk delete encountered errors: " + e);
      }
    }
  };

  const handleBulkToggle = () => {
    if (selectedModIds.size === 0) return;
    const newMods = mods.map(mod => selectedModIds.has(mod.id) ? { ...mod, active: !mod.active } : mod);
    setMods(newMods);
    computeConflicts(newMods);
  };

  const handleOpenFolder = async (modId: string) => {
    try {
      await invoke("open_mod_folder", { id: modId });
    } catch (e) {
      alert("Failed to open folder: " + e);
    }
  };

  const installMods = async (paths: string[]) => {
    setIsInstalling(true);
    setInstallStatus("Installing mods...");
    try {
      const result = await invoke<string>("install_local_mods", { filePaths: paths });
      setInstallStatus(result);
      // Refresh list and merge active states (auto-enabling new ones)
      invoke("get_local_mods", { gamePath: null })
        .then((res: any) => {
          setMods((prevMods) => {
            const prevModsMap = new Map(prevMods.map(m => [m.id, m]));
            return res.map((m: any) => {
              const prev = prevModsMap.get(m.id);
              if (prev) {
                return { ...m, active: prev.active };
              } else {
                return { ...m, active: false };
              }
            });
          });
        })
        .catch(console.error);
    } catch (e: any) {
      setInstallStatus("Error: " + String(e));
    } finally {
      setIsInstalling(false);
    }
  };

  const handleImportMod = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Mod Files",
            extensions: ["pak", "zip"]
          }
        ],
        title: "Select Mod Files (.pak, .zip) to Import"
      });
      
      if (!selected) return;
      
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length > 0) {
        await installMods(paths);
      }
    } catch (e) {
      console.error(e);
      alert("Error selecting files: " + e);
    }
  };

  const fetchMods = () => {
    invoke("get_local_mods", { gamePath: null })
      .then((res: any) => {
        setMods(res);
        computeConflicts(res);
      })
      .catch(console.error);
  };

  useEffect(() => {
    // Fetch local mods once when the app loads
    fetchMods();
  }, []);

  useEffect(() => {
    // Try to auto-detect game path on load
    invoke("get_mhur_paks_path")
      .then((path: any) => {
        setGamePath(path);
      })
      .catch((e) => console.log("Auto-detect game path failed:", e));

    // Listen for drag enter
    const unlistenEnter = listen("tauri://drag-enter", () => {
      setIsDragging(true);
    });

    // Listen for drag leave
    const unlistenLeave = listen("tauri://drag-leave", () => {
      setIsDragging(false);
    });

    // Listen for drag drop
    const unlistenDrop = listen<any>("tauri://drag-drop", async (event) => {
      setIsDragging(false);
      const paths = event.payload?.paths;
      if (paths && paths.length > 0) {
        await installMods(paths);
      }
    });

    return () => {
      unlistenEnter.then(f => f());
      unlistenLeave.then(f => f());
      unlistenDrop.then(f => f());
    };
  }, []);

  const handleModClick = (e: React.MouseEvent, modId: string) => {
    if (e.shiftKey && lastClickedModId) {
      const currentIndex = filteredMods.findIndex(m => m.id === modId);
      const lastIndex = filteredMods.findIndex(m => m.id === lastClickedModId);
      
      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        
        const newSelection = new Set(selectedModIds);
        for (let i = start; i <= end; i++) {
          newSelection.add(filteredMods[i].id);
        }
        setSelectedModIds(newSelection);
      }
    } else if (e.ctrlKey || e.metaKey) {
      const newSelection = new Set(selectedModIds);
      if (newSelection.has(modId)) {
        newSelection.delete(modId);
      } else {
        newSelection.add(modId);
      }
      setSelectedModIds(newSelection);
      setLastClickedModId(modId);
    } else {
      setSelectedModIds(new Set([modId]));
      setLastClickedModId(modId);
    }
  };

  const toggleMod = (id: string) => {
    const newMods = mods.map(mod => mod.id === id ? { ...mod, active: !mod.active } : mod);
    setMods(newMods);
    computeConflicts(newMods);
  };

  // Dynamically calculate counts (memoized)
  const categoryCounts = useMemo(() => mods.reduce((acc, mod) => {
    const cat = mod.category || "OTHER";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [mods]);


  const characterCounts = useMemo(() => mods.reduce((acc, mod) => {
    const char = mod.character || "All";
    acc[char] = (acc[char] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [mods]);

  // Conflict detection - only recomputed when explicitly triggered (toggle, delete, collection apply, initial load)
  const [conflictSet, setConflictSet] = useState<Set<string>>(new Set());
  const modsRef = useRef(mods);
  modsRef.current = mods;

  const computeConflicts = (modsList: Mod[]) => {
    const set = new Set<string>();
    const activeMods = modsList.filter(m => m.active);
    if (activeMods.length < 2) { setConflictSet(set); return; }

    const extractKw = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes("weapon") || n.includes("nocanon") || n.includes("no canon") || n.includes("sword")) return "weapon";
      if (n.includes("hero")) return "hero";
      if (n.includes("training")) return "training";
      if (n.includes("casual")) return "casual";
      if (n.includes("default")) return "default";
      if (n.includes("undefeatable")) return "undefeatable";
      if (n.includes("suit")) return "suit";
      if (n.includes("school")) return "school";
      if (n.includes("fantasy")) return "fantasy";
      if (n.includes("awaken") || n.includes("aweooppo")) return "awaken";
      if (n.includes("greeting") || n.includes("greet")) return "greeting";
      if (n.includes("attention")) return "attention";
      if (n.includes("clap")) return "clap";
      if (n.includes("provoke")) return "provoke";
      if (n.includes("sit")) return "sit";
      if (n.includes("laugh")) return "laugh";
      if (n.includes("dance")) return "dance";
      if (n.includes("pose")) return "pose";
      if (n.includes("cheer")) return "cheer";
      if (n.includes("point")) return "point";
      if (n.includes("stretch")) return "stretch";
      if (n.includes("warmup") || n.includes("warm-up") || n.includes("warm up")) return "warmup";
      if (n.includes("flex")) return "flex";
      if (n.includes("bow")) return "bow";
      if (n.includes("wave")) return "wave";
      if (n.includes("nod")) return "nod";
      if (n.includes("shake")) return "shake";
      return null;
    };

    const getCostumes = (files: string[]) => {
      const costumes = new Set<string>();
      files.forEach(file => {
        const match = file.match(/\/Model\/(.+?)\/(?:Mesh|Mat|Tex|Animation|Physics)\//i);
        if (match) costumes.add(match[1]);
      });
      return costumes;
    };

    for (let i = 0; i < activeMods.length; i++) {
      for (let j = i + 1; j < activeMods.length; j++) {
        const mod = activeMods[i];
        const m = activeMods[j];
        let isConflict = false;

        if (mod.modified_files && m.modified_files && mod.modified_files.length > 0 && m.modified_files.length > 0) {
          const costumes1 = getCostumes(mod.modified_files);
          const costumes2 = getCostumes(m.modified_files);

          const getPrimaryCostumes = (costumes: Set<string>) => {
            const specific = Array.from(costumes).filter(c => c !== "Default");
            return specific.length > 0 ? specific : ["Default"];
          };

          const primary1 = getPrimaryCostumes(costumes1);
          const primary2 = getPrimaryCostumes(costumes2);

          const primaryIntersect = primary1.filter(c => primary2.includes(c));
          if (primaryIntersect.length === 0) continue;

          const modFilesSet = new Set(m.modified_files);
          const intersect = mod.modified_files.filter(file => {
            if (!modFilesSet.has(file)) return false;
            if (file.includes("/AnimNotifys/")) return false;
            if (file.includes("/Sound/CUE/system/")) return false;
            return true;
          });

          if (intersect.length > 0) {
            if (mod.category === "Emote" && m.category === "Emote") {
              if (mod.character !== "All" && m.character !== "All" && mod.character !== m.character) continue;
            }
            const kw1 = extractKw(mod.name) || (mod.pak_name && extractKw(mod.pak_name));
            const kw2 = extractKw(m.name) || (m.pak_name && extractKw(m.pak_name));
            if ((kw1 === "weapon" && kw2 !== "weapon") || (kw2 === "weapon" && kw1 !== "weapon")) continue;
            if (kw1 && kw2 && kw1 !== kw2) continue;
            isConflict = true;
          }
        } else {
          const sameCatChar = mod.character !== "All" && (mod.category === "Skin" || mod.category === "Voice" || mod.category === "Emote" || mod.category === "Weapon") && m.category === mod.category && m.character === mod.character;
          if (sameCatChar) {
            const kw1 = extractKw(mod.name) || (mod.pak_name && extractKw(mod.pak_name));
            const kw2 = extractKw(m.name) || (m.pak_name && extractKw(m.pak_name));
            if ((kw1 === "weapon" && kw2 !== "weapon") || (kw2 === "weapon" && kw1 !== "weapon")) continue;
            if (kw1 && kw2 && kw1 !== kw2) continue;
            isConflict = true;
          }
        }

        if (isConflict) {
          set.add(mod.id);
          set.add(m.id);
        }
      }
    }
    setConflictSet(set);
  };
  
  const [characters, setCharacters] = useState<string[]>(["All"]);
  
  useEffect(() => {
    invoke('get_characters').then((chars) => {
      setCharacters(chars as string[]);
    }).catch(console.error);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor));

  // Memoize filtered + sorted mod list
  const filteredMods = useMemo(() => {
    return mods
      .filter(mod => {
        if (activeCategory === "All Mods") return true;
        const col = collections.find(c => c.id === activeCategory);
        if (col) return col.activeMods.includes(mod.id);
        return mod.category === activeCategory || mod.character === activeCategory;
      })
      .filter(mod => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          mod.name.toLowerCase().includes(query) ||
          mod.author.toLowerCase().includes(query) ||
          mod.category.toLowerCase().includes(query) ||
          mod.character.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (!sortConfig) return 0;
        const key = sortConfig.key as keyof Mod;
        let valA = a[key] ?? "";
        let valB = b[key] ?? "";
        if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
  }, [mods, activeCategory, searchQuery, sortConfig, collections]);

  const handleSaveToGame = async () => {
    try {
      setIsSaving(true);
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
            setIsSaving(false);
            return; // User cancelled
          }
          path = selected as string;
          setGamePath(path);
        }
      }

      // Deploy the active mods without launching
      const activeModPaths = mods.filter(m => m.active).map(m => m.folder_path);
      await invoke("deploy_mods", { gamePath: path, activeModPaths });
      
      alert("Mods saved to game successfully!");
      
    } catch (e) {
      console.error(e);
      alert("Error saving mods: " + e);
    } finally {
      setIsSaving(false);
    }
  };

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
    <GlobalErrorBoundary>
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
          <NavItem icon={<Globe size={18} />} label="Mod Discovery" active={activeTab === "Discovery" || activeTab === "Store" || activeTab === "GameBanana" || activeTab === "NexusMods"} onClick={() => setActiveTab("Discovery")} />
          <NavItem icon={<Shuffle size={18} />} label="Skin Swapper" active={activeTab === "SkinSwapper"} onClick={() => setActiveTab("SkinSwapper")} />
          <NavItem icon={<Merge size={18} />} label="Mod Merger" active={activeTab === "ModMerger"} onClick={() => setActiveTab("ModMerger")} />
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

            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-8 mb-3 flex items-center justify-between">
              COLLECTIONS
              <button onClick={() => setIsCreatingCollection(true)} className="hover:text-white"><Plus size={12}/></button>
            </div>
            
            {isCreatingCollection && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-black/20 rounded-sm border border-white/5">
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Collection Name..." 
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleCreateCollection();
                    if (e.key === "Escape") setIsCreatingCollection(false);
                  }}
                  className="bg-transparent text-xs text-white outline-none w-full"
                />
              </div>
            )}

            {collections.map(col => (
              <div key={col.id} className="group flex items-center relative w-full">
                <div className="w-full">
                  {renamingCollectionId === col.id ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-sm mb-1 bg-black/40 border border-hero-primary/50">
                      <input
                        autoFocus
                        type="text"
                        value={renamingText}
                        onChange={e => setRenamingText(e.target.value)}
                        onBlur={() => handleRenameCollectionSubmit(col.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRenameCollectionSubmit(col.id);
                          if (e.key === "Escape") setRenamingCollectionId(null);
                        }}
                        className="bg-transparent text-xs text-white outline-none w-full"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  ) : (
                    <FilterItem 
                      label={col.name} 
                      count={col.activeMods.length} 
                      active={activeCategory === col.id} 
                      onClick={() => handleApplyCollection(col.id)} 
                      hideCountOnHover={true}
                      forceHideCount={collectionMenu?.colId === col.id}
                    />
                  )}
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCollectionMenu({ x: rect.right + 10, y: rect.top, colId: col.id });
                  }}
                  className={`absolute right-3 text-white hover:text-hero-primary transition-all p-1 rounded-sm ${collectionMenu?.colId === col.id ? 'opacity-100 text-hero-primary' : 'opacity-0 group-hover:opacity-100'}`}
                >
                  <MoreVertical size={16} />
                </button>
              </div>
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
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-hero-bg to-[#050508]">
        
        {/* HEADER */}
        <div className="h-24 px-8 flex items-center justify-between border-b border-white/5 bg-hero-sidebar/40 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-5">
            <h2 className="text-3xl font-black italic tracking-tight">{activeTab === "Local" ? "LOCAL LIBRARY" : activeTab === "Store" ? "DISCORD STORE" : activeTab === "GameBanana" ? "GAMEBANANA" : activeTab === "Discovery" ? "MOD DISCOVERY" : activeTab === "SkinSwapper" ? "SKIN SWAPPER" : activeTab === "ModMerger" ? "MOD MERGER" : "SETTINGS"}</h2>
            <div className="h-8 w-[2px] bg-white/10 transform rotate-12"></div>
            {activeTab === "Local" && (
               <span className="text-xs font-bold text-hero-primary bg-hero-primary/10 px-3 py-1.5 rounded-sm border border-hero-primary/20 tracking-wider">
               {mods.length} INSTALLED
             </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink min-w-0">
            {activeTab === "Local" && (
              <div className="flex items-center gap-2 mr-2">
                <button 
                  onClick={handleSaveToGame}
                  disabled={isSaving}
                  className={`group relative flex items-center justify-center gap-2 text-white font-black italic tracking-widest pl-5 pr-4 h-11 rounded-sm bg-white/5 border border-white/10 hover:bg-white/10 hover:border-hero-primary/50 transition-all duration-300 transform hover:scale-105 active:scale-95 ${isSaving ? 'opacity-50 cursor-not-allowed scale-100 hover:scale-100 hover:border-white/10' : ''}`}
                >
                  <Save size={18} className="text-hero-primary" />
                  {isSaving ? "SAVING..." : "SAVE"}
                  <div className="flex items-center justify-center ml-1 opacity-70">
                    <Info size={16} className="text-white/40 group-hover:text-white transition-colors" />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-max px-3 py-2 bg-black/95 text-white/90 text-xs rounded-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-2xl border border-white/10 font-medium not-italic tracking-normal normal-case">
                      Save to the game without having to launch it
                    </div>
                  </div>
                </button>
                
                <button 
                  onClick={handleImportMod}
                  className="flex items-center justify-center gap-2 text-white font-black italic tracking-widest px-5 h-11 rounded-sm bg-white/5 border border-white/10 hover:bg-white/10 hover:border-hero-primary/50 transition-all duration-300 transform hover:scale-105 active:scale-95"
                >
                  <Upload size={18} className="text-hero-primary" />
                  IMPORT MOD
                </button>
              </div>
            )}
            
            <button 
              onClick={handleRunGame}
              disabled={isLaunching}
              className={`flex items-center justify-center gap-2 text-black font-black italic tracking-widest px-6 h-11 rounded-sm shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all duration-300 transform 
                ${isLaunching ? 'bg-hero-primary/50 cursor-not-allowed scale-100' : 'bg-hero-primary hover:bg-hero-primaryHover hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] hover:scale-105 active:scale-95'}`}
            >
              <Play size={18} fill="currentColor" />
              {isLaunching ? "DEPLOYING..." : "LAUNCH GAME"}
            </button>

            <div className="h-6 w-[1px] bg-white/10 mx-2"></div>

            {activeTab === "Local" && (
              <div className="relative group shrink min-w-0">
                <input 
                  type="text" 
                  placeholder="Search mods..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-black/40 border border-white/10 text-sm font-medium text-white px-4 h-11 rounded-sm outline-none w-32 sm:w-48 md:w-64 focus:w-48 md:focus:w-80 focus:border-hero-primary transition-all duration-300 placeholder:text-white/20 italic"
                />
                <Search size={16} className="absolute right-3 top-3.5 text-white/30 group-focus-within:text-hero-primary transition-colors pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* CONTENT SPLIT */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── Discovery Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "Discovery" ? "flex" : "hidden"}`}>
            <ModDiscovery onSelect={(store) => setActiveTab(store)} />
          </div>

          {/* ── Store Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "Store" ? "block" : "hidden"}`}>
            <DiscordStore localMods={mods} allow18Plus={allow18Plus} onModInstalled={fetchMods} />
          </div>

          {/* ── GameBanana Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "GameBanana" ? "block" : "hidden"}`}>
            <GameBananaStore allow18Plus={allow18Plus} localMods={mods} onModInstalled={fetchMods} />
          </div>

          {/* ── Nexus Mods Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "NexusMods" ? "block" : "hidden"}`}>
            <NexusModsStore allow18Plus={allow18Plus} localMods={mods} onModInstalled={fetchMods} />
          </div>

          {/* ── Skin Swapper Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "SkinSwapper" ? "block" : "hidden"}`}>
            <SkinSwapper mods={mods} gamePath={gamePath} onModUpdated={(updatedMod) => setMods(mods.map(m => m.id === updatedMod.id ? updatedMod : m))} />
          </div>

          {/* ── Mod Merger Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "ModMerger" ? "block" : "hidden"}`}>
            <ModMerger mods={mods} gamePath={gamePath} onModsChanged={fetchMods} />
          </div>

          {/* ── Local Library Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "Local" ? "grid" : "hidden"}`} style={{gridTemplateColumns: '55% 1fr'}}>
              {/* MOD TABLE */}
              <div className="min-w-0 flex flex-col p-6 overflow-y-auto overflow-x-hidden custom-scrollbar border-r border-white/5">
                  
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className="flex items-center w-full min-w-0 px-4 pb-2 border-b-2 border-white/10 mb-4 select-none">
                      <div className="w-12 shrink-0"></div>
                      <div className="w-10 shrink-0"></div>
                      <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                        {columns.map(col => (
                          <SortableHeader key={col.id} id={col.id} label={col.label} width={col.width} sortConfig={sortConfig} onSort={handleSort} />
                        ))}
                      </SortableContext>
                    </div>
                  </DndContext>

                  <div className="space-y-1.5 pb-10 select-none">
                    {filteredMods
                      .map((mod) => {
                        const isConflicting = conflictSet.has(mod.id);
                        
                        return (
                      <div 
                        key={mod.id} 
                        title={getModDescription(mod)}
                        onClick={(e) => handleModClick(e, mod.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          // If clicking on an unselected mod, select only it first
                          if (!selectedModIds.has(mod.id)) {
                            setSelectedModIds(new Set([mod.id]));
                            setLastClickedModId(mod.id);
                          }
                          setContextMenu({ x: e.pageX, y: e.pageY, modId: mod.id });
                        }}
                        className={`flex items-center w-full min-w-0 px-4 py-3 rounded-sm group cursor-pointer border transition-all duration-200 relative
                          ${isConflicting ? 'bg-red-900/40 border-red-500 hover:bg-red-900/60' : 
                            selectedModIds.has(mod.id) ? 'bg-hero-primary/10 border-hero-primary/50' : 'bg-hero-card/40 border-white/5 hover:bg-hero-card/80 hover:border-hero-primary/30'}`}
                      >
                        {isConflicting && (
                          <div className="absolute top-0 right-0 px-2 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-bl-sm uppercase tracking-wider shadow-lg z-10">
                            Conflict Detected
                          </div>
                        )}
                        <div 
                          className="w-12 shrink-0 text-hero-muted hover:text-white transition-colors cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); toggleMod(mod.id); }}
                        >
                          {mod.active ? <CheckSquare size={18} className="text-hero-primary" /> : <Square size={18} />}
                        </div>
                        <div className={`w-10 shrink-0 transition-colors ${selectedModIds.has(mod.id) ? 'text-hero-primary' : 'text-white/20 group-hover:text-white/60'}`}>
                          <Eye size={16} />
                        </div>
                        {columns.map(col => {
                          if (col.id === "name") return (
                            <div key={col.id} title={mod.name} className={`${col.width} min-w-0 font-bold text-white truncate pr-4 text-[13px]`}>
                              {renamingModId === mod.id ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={renamingText}
                                  onChange={e => setRenamingText(e.target.value)}
                                  onBlur={() => handleRenameSubmit(mod.id)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleRenameSubmit(mod.id);
                                    if (e.key === "Escape") setRenamingModId(null);
                                  }}
                                  className="bg-black/50 border border-hero-primary text-white px-2 py-0.5 rounded-sm outline-none w-[90%]"
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : mod.name}
                            </div>
                          );
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
                      );
                    })}
                  </div>
              </div>

              {/* 3D MODEL VIEWER */}
              <div className="bg-black/40 relative min-w-0 min-h-0 overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-t from-hero-bg to-transparent z-0 opacity-80 pointer-events-none"></div>
                 <div className="absolute inset-0 z-0 opacity-50 pointer-events-none" style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
                 <div className="absolute inset-0 z-10">
                   <ModelViewer selectedMod={mods.find(m => m.id === lastClickedModId)} />
                 </div>
              </div>
          </div>

          {/* ── Settings Tab ── */}
          <div className={`flex-1 overflow-y-auto custom-scrollbar p-10 bg-hero-bg ${activeTab === "Settings" ? "block" : "hidden"}`}>
               <div className="max-w-3xl space-y-10">

                 <section>
                   <h2 className="text-xl font-bold mb-6 text-white flex items-center gap-2">
                     <Settings size={20} className="text-hero-primary" /> General
                   </h2>
                   
                   <div className="bg-hero-card/40 border border-white/5 rounded-xl p-6 shadow-xl">
                     <h3 className="text-lg font-bold mb-2">Hidden to tray</h3>
                     <div className="flex items-center justify-between">
                       <p className="text-sm text-white/50">
                         Minimize if exited and it will go to the hidden tray instead of closing.
                       </p>
                       <label className="relative inline-flex items-center cursor-pointer">
                         <input type="checkbox" className="sr-only peer" checked={minimizeToTray} onChange={(e) => {
                           setMinimizeToTray(e.target.checked);
                           localStorage.setItem("minimizeToTray", String(e.target.checked));
                         }} />
                         <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-hero-primary"></div>
                       </label>
                     </div>
                   </div>

                   <div className="bg-hero-card/40 border border-white/5 rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-red-400">18+ Content Filter</h3>
                     <div className="flex items-center justify-between">
                       <p className="text-sm text-white/50">
                         Allow NSFW and 18+ content in the mod discovery stores.
                       </p>
                       <label className="relative inline-flex items-center cursor-pointer">
                         <input type="checkbox" className="sr-only peer" checked={allow18Plus} onChange={(e) => {
                           setAllow18Plus(e.target.checked);
                           localStorage.setItem("allow18Plus", String(e.target.checked));
                         }} />
                         <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                       </label>
                     </div>
                   </div>

                   <div className="bg-hero-card/40 border border-white/5 rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2">Cache</h3>
                     <p className="text-sm text-white/50 mb-6">
                       Clear temporary files, cached mods, and store memory. This can fix loading issues.
                     </p>
                     
                     <button 
                       onClick={() => {
                         if (confirm("Are you sure you want to delete the cache? This will clear all downloaded data from the store.")) {
                            localStorage.clear();
                            alert("Cache cleared successfully!");
                            window.location.reload(); // Reload to apply cache clear visually
                         }
                       }}
                       className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded-md transition-colors flex items-center gap-2"
                     >
                       <Trash2 size={16} /> Delete Cache
                     </button>
                   </div>

                   <div className="bg-hero-card/40 border border-white/5 rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2">Restore to Default</h3>
                     <p className="text-sm text-white/50 mb-6">
                       It will remove all mods (Including the mods folder).
                     </p>
                     
                     <button 
                       onClick={() => {
                         if (confirm("WARNING: Are you sure you want to restore to default? This will permanently delete ALL your installed mods and the mods folder!")) {
                            invoke('restore_to_default', { gamePath: gamePath }).then(() => {
                              alert("Successfully restored to default!");
                              window.location.reload();
                            }).catch(e => {
                              alert("Error restoring to default: " + e);
                            });
                         }
                       }}
                       className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded-md transition-colors flex items-center gap-2"
                     >
                       <Trash2 size={16} /> Restore to Default
                     </button>
                   </div>
                   <div className="bg-hero-card/40 border border-white/5 rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2">Sign Out of Everything</h3>
                     <p className="text-sm text-white/50 mb-6">
                       Remove all saved logins, API keys, and secure tokens for all connected mod stores (Discord, Nexus Mods, etc).
                     </p>
                     
                     <button 
                       onClick={async () => {
                         if (confirm("Are you sure you want to sign out of everything? All your saved API keys and secure login tokens will be permanently deleted from your computer.")) {
                            try {
                                localStorage.removeItem("nexus_api_key");
                                await invoke('clear_discord_token');
                                alert("Successfully signed out of all accounts.");
                                window.location.reload();
                            } catch (e) {
                                alert("Error signing out: " + e);
                            }
                         }
                       }}
                       className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded-md transition-colors flex items-center gap-2"
                     >
                       <LogOut size={16} /> Sign Out of All Accounts
                     </button>
                   </div>
                 </section>

                 <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center justify-center text-center pb-8">
                   <p className="text-white/40 text-sm font-bold tracking-wider mb-2">My Hero Manager</p>
                   <p className="text-white/20 text-xs mb-4">Version 0.7</p>
                   <a 
                     href="https://github.com/regulardude1/My-Hero-Manager" 
                     target="_blank" 
                     rel="noreferrer"
                     className="text-hero-primary/70 hover:text-hero-primary transition-colors text-xs flex items-center gap-1"
                   >
                     <Globe size={14} /> GitHub Repository
                   </a>
                 </div>

               </div>
          </div>

        </div>
      </div>

      {/* DRAG OVERLAY */}
      {isDragging && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-8 pointer-events-none">
          <div className="w-full h-full border-2 border-dashed border-hero-primary/50 rounded-lg flex flex-col items-center justify-center gap-4 bg-hero-bg/40 max-w-4xl max-h-[80vh] m-auto shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-radial-gradient(circle, rgba(250,204,21,0.05) 0%, transparent 70%) pointer-events-none"></div>
            
            <div className="relative p-6 rounded-full bg-hero-primary/10 border border-hero-primary/20 text-hero-primary animate-bounce">
              <Upload size={48} className="stroke-[1.5]" />
            </div>
            
            <div className="text-center relative z-10">
              <h3 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-hero-primary to-orange-500 mb-2">
                PLUS ULTRA IMPORT
              </h3>
              <p className="text-sm text-hero-muted font-bold uppercase tracking-wider max-w-md">
                Drop your <span className="text-hero-primary">.pak</span> or <span className="text-hero-primary">.zip</span> mod files to install them instantly
              </p>
            </div>
          </div>
        </div>
      )}

      {/* INSTALLING LOADER */}
      {isInstalling && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4 pointer-events-auto">
          <div className="w-16 h-16 border-4 border-hero-primary/20 border-t-hero-primary rounded-full animate-spin"></div>
          <div className="text-center">
            <h3 className="text-lg font-black uppercase tracking-widest text-hero-primary animate-pulse">INSTALLING MODS</h3>
            <p className="text-xs text-hero-muted mt-1">Please wait while the manager registers the pak files...</p>
          </div>
        </div>
      )}

      {/* SYSTEM NOTIFICATION */}
      {installStatus && (
        <div className="absolute bottom-6 right-6 z-50 max-w-md bg-zinc-900/95 border border-white/10 rounded-lg shadow-2xl p-4 flex gap-3 animate-in slide-in-from-bottom duration-300">
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-hero-primary mb-1">System Notification</h4>
            <p className="text-xs text-white/80 whitespace-pre-line leading-relaxed font-medium">
              {installStatus}
            </p>
          </div>
          <button 
            onClick={() => setInstallStatus(null)} 
            className="text-white/40 hover:text-white/80 transition-colors self-start shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-[#18181b] border border-white/10 rounded-md shadow-2xl py-1 z-50 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedModIds.size > 1 ? (
            <>
              <div className="px-4 py-2 text-[10px] font-black text-hero-primary uppercase tracking-widest border-b border-white/5 mb-1">
                {selectedModIds.size} MODS SELECTED
              </div>
              <button 
                className="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
                onClick={() => {
                  handleBulkToggle();
                  setContextMenu(null);
                }}
              ><CheckSquare size={12}/> Toggle Selected</button>
              
              <div className="h-[1px] bg-white/10 my-1"></div>
              
              <button 
                className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-2"
                onClick={() => {
                  handleBulkDelete();
                  setContextMenu(null);
                }}
              ><Trash2 size={12}/> Delete {selectedModIds.size} Mods</button>
            </>
          ) : (
            <>
              <button 
                className="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
                onClick={() => {
                  setViewingModDetailsId(contextMenu.modId);
                  setContextMenu(null);
                }}
              ><Info size={12}/> View Details</button>

              <button 
                className="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
                onClick={() => {
                  const m = mods.find(m => m.id === contextMenu.modId);
                  if (m) {
                    setRenamingText(m.name);
                    setRenamingModId(contextMenu.modId);
                  }
                  setContextMenu(null);
                }}
              ><Edit2 size={12}/> Rename</button>
              
              <button 
                className="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
                onClick={() => {
                  handleOpenFolder(contextMenu.modId);
                  setContextMenu(null);
                }}
              ><Folder size={12}/> Open Folder</button>
              

              
              <div className="h-[1px] bg-white/10 my-1"></div>
              
              <button 
                className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-2"
                onClick={() => {
                  handleDeleteMod(contextMenu.modId);
                  setContextMenu(null);
                }}
              ><Trash2 size={12}/> Delete</button>
            </>
          )}
        </div>
      )}

      {/* Collection Menu */}
      {collectionMenu && (
        <div 
          className="fixed bg-[#18181b] border border-white/10 rounded-md shadow-2xl py-1 z-50 min-w-[160px]"
          style={{ top: collectionMenu.y, left: collectionMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
            onClick={() => {
              const col = collections.find(c => c.id === collectionMenu.colId);
              if (col) {
                setRenamingCollectionId(col.id);
                setRenamingText(col.name);
              }
              setCollectionMenu(null);
            }}
          ><Edit2 size={12}/> Rename Collection</button>
          
          <button 
            className="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2"
            onClick={() => {
              handleUpdateCollection(collectionMenu.colId);
              setCollectionMenu(null);
            }}
          ><CheckSquare size={12}/> Save Active Mods</button>
          
          <div className="h-[1px] bg-white/10 my-1"></div>
          
          <button 
            className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-2"
            onClick={() => {
              handleDeleteCollection(collectionMenu.colId);
              setCollectionMenu(null);
            }}
          ><Trash2 size={12}/> Delete Collection</button>
        </div>
      )}

      </div>

      {/* Mod Details Modal */}
      {viewingModDetailsId && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm" onClick={() => setViewingModDetailsId(null)}>
          <div 
            className="bg-[#18181b] border border-white/10 p-8 rounded-sm w-full max-w-3xl shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setViewingModDetailsId(null)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            ><X size={16}/></button>
            
            {(() => {
              const mod = mods.find(m => m.id === viewingModDetailsId);
              if (!mod) return null;
              
              return (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-2xl font-black italic tracking-wider text-hero-primary mb-1 break-words leading-tight pr-6">{mod.name}</h3>
                    <div className="flex gap-2 text-xs text-white/60 font-mono">
                      <span className="text-white">v{mod.version || "1.0"}</span>
                      <span>•</span>
                      <span>By <span className="text-white">{mod.author || "Unknown"}</span></span>
                    </div>
                  </div>
                  
                  {mod.url && (
                    <div className="bg-black/40 border border-white/5 p-4 rounded-sm">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <div>
                          <div className="text-white/60 uppercase tracking-wider mb-1 font-bold text-[10px]">Source Website</div>
                          <div className="text-white font-bold text-lg flex items-center gap-2">
                            <Globe size={16} className="text-hero-primary"/>
                            {(() => {
                              try {
                                const urlObj = new URL(mod.url);
                                const hostname = urlObj.hostname.toLowerCase();
                                if (hostname.includes('discord')) return 'Discord';
                                if (hostname.includes('gamebanana')) return 'GameBanana';
                                if (hostname.includes('nexusmods')) return 'Nexus Mods';
                                if (hostname.includes('drive.google')) return 'Google Drive';
                                if (hostname.includes('mega.nz')) return 'MEGA';
                                if (hostname.includes('github')) return 'GitHub';
                                return urlObj.hostname.replace('www.', '');
                              } catch (e) {
                                return 'External Link';
                              }
                            })()}
                          </div>
                        </div>
                        <a 
                          href={mod.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="flex-shrink-0 bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white px-5 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
                        >
                          <Globe size={14}/> Open Link
                        </a>
                      </div>
                      <div className="text-[11px] text-white/40 truncate bg-black/50 p-2 rounded border border-white/5 font-mono select-all hover:text-white/70 transition-colors">
                        {mod.url}
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-white/40 uppercase tracking-wider mb-1.5 font-bold">Category</div>
                      <div className="text-hero-bg bg-hero-primary px-2.5 py-1 inline-block rounded-sm font-bold uppercase">{mod.category || "N/A"}</div>
                    </div>
                    <div>
                      <div className="text-white/60 uppercase tracking-wider mb-1.5 font-bold">Character</div>
                      <div className="text-white bg-white/10 px-2.5 py-1 inline-block rounded-sm">{mod.character || "N/A"}</div>
                    </div>
                  </div>

                  {mod.pak_name && (
                    <div>
                      <div className="text-white/60 uppercase tracking-wider mb-1.5 font-bold text-xs">File Name</div>
                      <div className="text-white font-mono text-[11px] break-all bg-black/40 p-2.5 rounded-sm border border-white/5 select-all">
                        {mod.pak_name}
                      </div>
                    </div>
                  )}
                  
                  {mod.modified_files && mod.modified_files.length > 0 && (
                    <div>
                      <div className="text-white/60 uppercase tracking-wider mb-1.5 font-bold text-xs">Modified Internal Files ({mod.modified_files.length})</div>
                      <div className="text-white font-mono text-[11px] break-all bg-black/40 p-2.5 rounded-sm border border-white/5 max-h-48 overflow-y-auto custom-scrollbar">
                        {mod.modified_files.slice(0, 50).map((f, i) => (
                          <div key={i} className="truncate py-0.5" title={f}>{f}</div>
                        ))}
                        {mod.modified_files.length > 50 && (
                          <div className="text-hero-primary mt-2 italic border-t border-white/5 pt-1.5">...and {mod.modified_files.length - 50} more files (hidden)</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </GlobalErrorBoundary>
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

function FilterItem({ label, count, active, onClick, hideCountOnHover, forceHideCount }: any) {
  return (
    <div 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer transition-all duration-200 mb-1
      ${active ? 'bg-hero-primary/10 text-hero-primary border border-hero-primary/20' : 'text-hero-muted hover:bg-white/5 hover:text-white border border-transparent'}`}
    >
      <span className="text-xs font-bold truncate pr-2">{label}</span>
      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0 transition-opacity duration-200 ${active ? 'bg-hero-primary/20' : 'bg-white/5'} ${hideCountOnHover ? 'group-hover:opacity-0' : ''} ${forceHideCount ? 'opacity-0' : 'opacity-100'}`}>{count}</span>
    </div>
  );
}

export default App;
