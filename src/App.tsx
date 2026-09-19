import { useState, useEffect, useMemo } from "react";
import { FolderOpen, Globe, Settings, Search, CheckSquare, Play, Upload, X, Plus, Edit2, Folder, FolderPlus, ChevronDown, ChevronRight, Trash2, Shuffle, MoreVertical, Save, Info, Merge, LogOut, AlertTriangle, Gamepad2, Download, ListChecks } from "lucide-react";
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import DiscordStore from "./DiscordStore";
import GameBananaStore from "./GameBananaStore";
import ModDiscovery from "./ModDiscovery";
import SkinSwapper from "./SkinSwapper";
import NexusModsStore from "./NexusModsStore";
import ModMerger from "./ModMerger";
import { useTheme, THEMES } from "./theme";
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Component, ReactNode } from 'react';
import { Mod, ContextMenuState, ModFolder, getBaseFilename, extractSlotFromMod } from "./utils/mods";
import { NavItem, FilterItem, RenameFolderInput } from "./components/ui";
import { ModDetailsModal } from "./components/ModDetailsModal";
import { useCollections } from "./hooks/useCollections";
import ModTable, { INITIAL_COLUMNS } from "./components/ModTable";
import { setViewerVisible } from "./emote";

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
        <div className="w-full h-screen flex flex-col items-center justify-center bg-hero-bg text-hero-text p-8 overflow-auto">
          <div className="text-6xl mb-4">💥</div>
          <h1 className="text-2xl font-black text-red-500 mb-2">CRITICAL UI CRASH</h1>
          <p className="text-sm text-hero-muted mb-6 max-w-2xl text-center">
            The React application encountered an unhandled exception during rendering.
          </p>
          <div className="bg-hero-bg/50 border border-red-500/30 rounded-lg p-6 max-w-4xl w-full text-left font-mono text-xs text-red-300 overflow-x-auto whitespace-pre-wrap shadow-2xl">
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

const TUTORIAL_STEPS = [
  {
    title: "Welcome to My Hero Manager!",
    description: "This app helps you easily install, manage, and combine mods for My Hero Ultra Rumble. Let's get you set up in just a few quick steps.",
    icon: Gamepad2,
    image: "/tutorial_step1.gif"
  },
  {
    title: "Setting Your Game Path",
    description: "First, we need to know where your game is installed. If we couldn't auto-detect it, click the Settings (gear) icon in the bottom left, and browse for your 'My Hero Ultra Rumble/Content/Paks' folder.",
    icon: FolderOpen,
    image: "/tutorial_step2.gif"
  },
  {
    title: "Installing Mods is Easy",
    description: "Have a downloaded .pak, .zip, or .rar file? Just drag and drop it directly into the app! You can also use the 'Discover' tab to browse and download mods directly from GameBanana, Nexus, or Discord.",
    icon: Download,
    image: "/tutorial_step3.gif"
  },
  {
    title: "Manage & Organize",
    description: "Click the checkbox next to any mod to enable or disable it. You can drag mods into Folders or save your current active mods as a Collection for easy switching.",
    icon: ListChecks,
    image: "/tutorial_step4.gif"
  },
  {
    title: "Ready to Play!",
    description: "When you're ready, click the 'Launch Game' button in the bottom left. Your active mods are instantly applied. Have fun!",
    icon: Play,
    image: "/tutorial_step5.gif"
  }
];

function App() {
  const { selection, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("Local");

  const [showTutorial, setShowTutorial] = useState(() => {
    return localStorage.getItem("mhm_tutorial_completed") !== "true";
  });
  const [tutorialStep, setTutorialStep] = useState(0);

  const finishTutorial = () => {
    localStorage.setItem("mhm_tutorial_completed", "true");
    setShowTutorial(false);
  };


  const [globalDialog, setGlobalDialog] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm";
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  } | null>(null);

  const showAlert = (message: string) => {
    return new Promise<void>((resolve) => {
      setGlobalDialog({
        isOpen: true,
        type: "alert",
        message: String(message),
        onConfirm: () => {
          setGlobalDialog(null);
          resolve();
        }
      });
    });
  };

  const showConfirm = (message: string) => {
    return new Promise<boolean>((resolve) => {
      setGlobalDialog({
        isOpen: true,
        type: "confirm",
        message: String(message),
        onConfirm: () => {
          setGlobalDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setGlobalDialog(null);
          resolve(false);
        }
      });
    });
  };

  const [activeCategory, setActiveCategory] = useState("All Mods");
  const [expandedCharacters, setExpandedCharacters] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [gamePath, setGamePath] = useState<string | null>(() => {
    return localStorage.getItem("mhm_game_path") || null;
  });
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
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'created_at', direction: 'desc' });

  const [folders, setFolders] = useState<ModFolder[]>(() => {
    try { return JSON.parse(localStorage.getItem("plus_ultra_folders") || "[]"); }
    catch { return []; }
  });
  const [autoFolderPreview, setAutoFolderPreview] = useState<{ proposedFolders: ModFolder[] } | null>(null);
  const [isAutoFoldering, setIsAutoFoldering] = useState(false);
  const [conflictSet, setConflictSet] = useState<Set<string>>(new Set());
  const [characters, setCharacters] = useState<string[]>(["All"]);
  const [folderPrompt, setFolderPrompt] = useState<{ visible: boolean; value: string; callback: (name: string) => void }>({ visible: false, value: "New Folder", callback: () => {} });

  const [showModsFolderPrompt, setShowModsFolderPrompt] = useState(false);
  const [modsFolderPromptPath, setModsFolderPromptPath] = useState<string | null>(null);
  const [dontShowModsPromptAgain, setDontShowModsPromptAgain] = useState(
    localStorage.getItem("mhm_dont_show_mods_prompt") === "true"
  );

  const saveFolders = (newFolders: ModFolder[]) => {
    setFolders(newFolders);
    const json = JSON.stringify(newFolders);
    localStorage.setItem("plus_ultra_folders", json);
    invoke("save_folders_json", { foldersJson: json }).catch(console.error);
  };

  const [minimizeToTray, setMinimizeToTray] = useState(() => localStorage.getItem("minimizeToTray") === "true");
  const [allow18Plus, setAllow18Plus] = useState(() => localStorage.getItem("allow18Plus") === "true");
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(() => localStorage.getItem("autoCheckUpdates") !== "false"); // Default true

  const [customThemeColors, setCustomThemeColors] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("customThemeColors") || '{"bg":"#09090b","sidebar":"#18181b","card":"#27272a","text":"#fafafa","accent":"#facc15"}');
    } catch {
      return { bg: "#09090b", sidebar: "#18181b", card: "#27272a", text: "#fafafa", accent: "#facc15" };
    }
  });
  
  const [customBgImage, setCustomBgImage] = useState(() => localStorage.getItem("customBgImage") || "");
  const [customBgOpacity, setCustomBgOpacity] = useState(() => parseFloat(localStorage.getItem("customBgOpacity") || "0.5"));
  const [customBgImageDataUri, setCustomBgImageDataUri] = useState<string>("");

  useEffect(() => {
    if (!customBgImage) {
      setCustomBgImageDataUri("");
      return;
    }
    if (customBgImage.startsWith('http') || customBgImage.startsWith('data:')) {
      setCustomBgImageDataUri(customBgImage);
    } else {
      invoke<string>('read_image_base64', { path: customBgImage })
        .then(res => setCustomBgImageDataUri(res))
        .catch(err => {
           console.error("Failed to load background image:", err);
           setCustomBgImageDataUri("");
        });
    }
  }, [customBgImage]);

  useEffect(() => {
    const root = document.documentElement;
    if (selection === "custom") {
      root.style.setProperty('--hero-bg', customThemeColors.bg);
      root.style.setProperty('--hero-sidebar', customThemeColors.sidebar);
      root.style.setProperty('--hero-card', customThemeColors.card);
      root.style.setProperty('--hero-text', customThemeColors.text);
      root.style.setProperty('--hero-accent', customThemeColors.accent);
      root.style.setProperty('--hero-accent-hover', customThemeColors.accent); // Simplify hover to same color for now
    } else {
      root.style.removeProperty('--hero-bg');
      root.style.removeProperty('--hero-sidebar');
      root.style.removeProperty('--hero-card');
      root.style.removeProperty('--hero-text');
      root.style.removeProperty('--hero-accent');
      root.style.removeProperty('--hero-accent-hover');
    }
  }, [selection, customThemeColors]);

  useEffect(() => {
    invoke('set_minimize_to_tray', { enabled: minimizeToTray }).catch(console.error);
  }, [minimizeToTray]);

  useEffect(() => {
    if (autoCheckUpdates) {
      import('@tauri-apps/api/app').then(appApi => {
        appApi.getVersion().then(currentVersion => {
          fetch("https://api.github.com/repos/regulardude1/My-Hero-Manager/releases/latest")
            .then(res => res.json())
            .then(data => {
              const latestVersion = data.tag_name?.replace('v', '');
              if (latestVersion && latestVersion !== currentVersion) {
                import('@tauri-apps/plugin-dialog').then(dialog => {
                  dialog.ask(`A new version of My Hero Manager (v${latestVersion}) is available! You are currently on v${currentVersion}.\n\nWould you like to open the download page?`, { title: 'Update Available', kind: 'info' })
                    .then(yes => {
                      if (yes) {
                        import('@tauri-apps/plugin-opener').then(opener => {
                          opener.openUrl(data.html_url);
                        });
                      }
                    });
                });
              }
            })
            .catch(console.error);
        });
      }).catch(console.error);
    }
  }, [autoCheckUpdates]);

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

  // The Local Library (and its emote viewer) stays mounted when hidden, so
  // pause emote animation + audio whenever we're on a different tab.
  useEffect(() => {
    setViewerVisible(activeTab === "Local");
  }, [activeTab]);

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
      setCollectionMenu(null);
    };
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    invoke<string>("load_folders_json")
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFolders(parsed);
            localStorage.setItem("plus_ultra_folders", raw);
          }
        } catch (e) { console.error(e); }
      })
      .catch(console.error);

  }, []);

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    createCollection(newCollectionName);
    setNewCollectionName("");
    setIsCreatingCollection(false);
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
      await showAlert("Rename failed: " + e);
    }
    setRenamingModId(null);
  };

  const handleRenameCollectionSubmit = (colId: string) => {
    if (renamingText.trim()) renameCollection(colId, renamingText);
    setRenamingCollectionId(null);
  };

  const handleDeleteMod = async (modId: string) => {
    if (await showConfirm("Are you sure you want to permanently delete this mod?")) {
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
        await showAlert("Delete failed: " + e);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedModIds.size === 0) return;
    if (await showConfirm(`Are you sure you want to permanently delete ${selectedModIds.size} mods?`)) {
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
        await showAlert("Bulk delete encountered errors: " + e);
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
      await showAlert("Failed to open folder: " + e);
    }
  };

  const executeInstallMods = async (paths: string[]) => {
    if (paths.length === 0) return;
    setIsInstalling(true);
    setInstallStatus("Installing mods...");
    try {
      const result = await invoke<string>("install_local_mods", { filePaths: paths });
      setInstallStatus(result);
      invoke("get_local_mods", { gamePath: gamePath || localStorage.getItem("mhm_game_path") })
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

  const [importConflicts, setImportConflicts] = useState<{
    pathsToInstall: string[];
    conflicts: { file_path: string; duplicate_mod: Mod }[];
    currentIndex: number;
  } | null>(null);

  const [startupConflicts, setStartupConflicts] = useState<{
    groups: Mod[][];
    currentIndex: number;
  } | null>(null);
  
  const [hasCheckedStartupDuplicates, setHasCheckedStartupDuplicates] = useState(false);

  const installMods = async (paths: string[]) => {
    setIsInstalling(true);
    setInstallStatus("Checking for duplicates...");
    try {
      type PrepareImportResult = { file_path: string; pak_hashes: string[] };
      const prepResults = await invoke<PrepareImportResult[]>("prepare_import", { filePaths: paths });
      
      const conflicts: { file_path: string; duplicate_mod: Mod }[] = [];
      const pathsToInstall: string[] = [];

      for (const res of prepResults) {
        let isDuplicate = false;
        let matchedMod: Mod | null = null;
        for (const hash of res.pak_hashes) {
          const match = mods.find(m => m.pak_hash === hash);
          if (match) {
            isDuplicate = true;
            matchedMod = match;
            break;
          }
        }
        if (isDuplicate && matchedMod) {
          conflicts.push({ file_path: res.file_path, duplicate_mod: matchedMod });
        } else {
          pathsToInstall.push(res.file_path);
        }
      }

      if (conflicts.length > 0) {
        setImportConflicts({
          pathsToInstall,
          conflicts,
          currentIndex: 0
        });
        setIsInstalling(false);
        setInstallStatus(null);
      } else {
        await executeInstallMods(pathsToInstall);
      }
    } catch (e) {
      setIsInstalling(false);
      setInstallStatus("Error: " + String(e));
    }
  };

  const handleImportMod = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Mod Files", extensions: ["pak", "zip"] }],
        title: "Select Mod Files (.pak, .zip) to Import"
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length > 0) {
        await installMods(paths);
      }
    } catch (e) {
      console.error(e);
      await showAlert("Error selecting files: " + e);
    }
  };

  const updateGamePath = (newPath: string | null) => {
    const trimmed = newPath ? newPath.trim() : null;
    setGamePath(trimmed);
    if (trimmed) {
      localStorage.setItem("mhm_game_path", trimmed);
    } else {
      localStorage.removeItem("mhm_game_path");
    }
    fetchMods(trimmed);
  };

  const fetchMods = (overridePath?: string | null) => {
    const targetPath = overridePath !== undefined ? overridePath : (gamePath || localStorage.getItem("mhm_game_path"));
    
    if (targetPath && !dontShowModsPromptAgain) {
      const modsPath = `${targetPath}\\~mods`;
      invoke<boolean>("check_path_exists", { path: modsPath }).then((exists) => {
        if (!exists) {
          setModsFolderPromptPath(modsPath);
          setShowModsFolderPrompt(true);
        }
      }).catch(console.error);
    }

    invoke("get_local_mods", { gamePath: targetPath })
      .then((res: any) => {
        setMods(res);
        computeConflicts(res);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchMods();
  }, []);

  useEffect(() => {
    if (mods.length > 0 && !hasCheckedStartupDuplicates) {
      setHasCheckedStartupDuplicates(true);
      
      const groups = new Map<string, Mod[]>();
      for (const mod of mods) {
        if (mod.pak_hash && mod.pak_hash.trim() !== "") {
          if (!groups.has(mod.pak_hash)) {
            groups.set(mod.pak_hash, []);
          }
          groups.get(mod.pak_hash)!.push(mod);
        }
      }
      
      const duplicates = Array.from(groups.values()).filter(group => group.length > 1);
      if (duplicates.length > 0) {
        setStartupConflicts({ groups: duplicates, currentIndex: 0 });
      }
    }
  }, [mods, hasCheckedStartupDuplicates]);

  useEffect(() => {
    const savedPath = localStorage.getItem("mhm_game_path");
    if (savedPath) {
      setGamePath(savedPath);
      fetchMods(savedPath);
    } else {
      invoke("get_mhur_paks_path")
        .then((path: any) => {
          if (path && typeof path === "string") {
            setGamePath(path);
            fetchMods(path);
          }
        })
        .catch((e) => console.log("Auto-detect game path failed:", e));
    }

    const unlistenEnter = listen("tauri://drag-enter", () => {
      setIsDragging(true);
    });

    const unlistenLeave = listen("tauri://drag-leave", () => {
      setIsDragging(false);
    });

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

  const displayCharacters = useMemo(() => {
    const allChars = new Set(characters);
    mods.forEach(mod => {
      if (mod.character && mod.character !== "All") allChars.add(mod.character);
    });

    const filtered = Array.from(allChars).filter(char => {
      if (char === "All") return true;
      return (characterCounts[char] || 0) > 0;
    });

    return filtered.sort((a, b) => {
      if (a === "All") return -1;
      if (b === "All") return 1;
      return a.localeCompare(b);
    });
  }, [characters, mods, characterCounts]);

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

    const getIdentifiers = (files: string[]) => {
      const identifiers = new Set<string>();
      files.forEach(file => {
        let charPrefix = "";
        const charMatch = file.match(/\/Character\/(?:Player\/|Enemy\/|Mob\/)?([^\/]+)\//i);
        if (charMatch) {
            charPrefix = `${charMatch[1].toUpperCase()}_`;
        }

        const costumeMatch = file.match(/\/Model\/(.+?)\/(?:Mesh|Mat|Tex|Animation|Physics)\//i);
        if (costumeMatch) identifiers.add(charPrefix + "Costume_" + costumeMatch[1]);
        const emoteMatch = file.match(/(?:em|EmotionAct|Emote)[_-]?(\d{2,3})/i);
        if (emoteMatch) identifiers.add(charPrefix + "Emote_" + emoteMatch[1]);
        const voiceMatch = file.match(/(?:vo|Voice|Cue)[_-]?(\d{2,3})/i);
        if (voiceMatch) identifiers.add(charPrefix + "Voice_" + voiceMatch[1]);
      });
      return identifiers;
    };

    for (let i = 0; i < activeMods.length; i++) {
      for (let j = i + 1; j < activeMods.length; j++) {
        const mod = activeMods[i];
        const m = activeMods[j];
        let isConflict = false;

        if (mod.modified_files && m.modified_files && mod.modified_files.length > 0 && m.modified_files.length > 0) {
          const identifiers1 = getIdentifiers(mod.modified_files);
          const identifiers2 = getIdentifiers(m.modified_files);

          const getPrimaryIdentifiers = (ids: Set<string>) => {
            const specific = Array.from(ids).filter(c => c !== "Default");
            return specific.length > 0 ? specific : ["Default"];
          };

          const primary1 = getPrimaryIdentifiers(identifiers1);
          const primary2 = getPrimaryIdentifiers(identifiers2);

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

  const { collections, createCollection, applyCollection, updateCollection, deleteCollection, renameCollection } = useCollections({
    mods,
    setMods,
    activeCategory,
    setActiveCategory,
    computeConflicts,
    showAlert
  });
  
  useEffect(() => {
    invoke('get_characters').then((chars) => {
      setCharacters(chars as string[]);
    }).catch(console.error);
  }, []);



  const filteredMods = useMemo(() => {
    return mods
      .filter(mod => {
        if (activeCategory === "All Mods") return true;
        const col = collections.find(c => c.id === activeCategory);
        if (col) return col.activeMods.includes(mod.id);
        
        if (activeCategory.startsWith("char:")) {
          const parts = activeCategory.split("|");
          const targetChar = parts[0].substring(5);
          if (mod.character !== targetChar && targetChar !== "All") return false;
          
          if (parts.length > 1 && parts[1].startsWith("cat:")) {
            const targetCat = parts[1].substring(4);
            if (mod.category !== targetCat) return false;
            
            if (parts.length > 2 && parts[2].startsWith("slot:")) {
              const targetSlot = parts[2].substring(5);
              const modSlot = extractSlotFromMod(mod);
              if (modSlot !== targetSlot) return false;
            }
          }
          return true;
        }

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

  const handleAutoFolder = () => {
    setIsAutoFoldering(true);
    setTimeout(async () => {
      const existingFolderedModIds = new Set(folders.flatMap(f => f.modIds));
      const availableMods = mods.filter(m => !existingFolderedModIds.has(m.id));

    const getCommonPrefix = (names: string[]) => {
      if (names.length === 0) return "";
      let prefix = names[0];
      for (let i = 1; i < names.length; i++) {
        while (names[i].indexOf(prefix) !== 0) {
          prefix = prefix.substring(0, prefix.length - 1);
          if (prefix === "") return names[0];
        }
      }
      return prefix.trim().replace(/[-_]+$/, '');
    };

    const proposedFolders: ModFolder[] = [];
    let folderIndex = 0;
    const groupedModIds = new Set<string>();

    const signatureGroups: Record<string, Mod[]> = {};
    for (const mod of availableMods) {
      if (!mod.modified_files || mod.modified_files.length === 0) continue;
      const baseFiles = mod.modified_files.map(getBaseFilename).sort();
      const signature = baseFiles.join('|');
      if (!signatureGroups[signature]) signatureGroups[signature] = [];
      signatureGroups[signature].push(mod);
    }

    for (const groupMods of Object.values(signatureGroups)) {
      if (groupMods.length > 1) {
        const commonPrefix = getCommonPrefix(groupMods.map(m => m.name));
        proposedFolders.push({
          id: `folder_auto_${Date.now()}_${folderIndex++}`,
          name: commonPrefix || "Auto Folder",
          modIds: groupMods.map(m => m.id)
        });
        groupMods.forEach(m => groupedModIds.add(m.id));
      }
    }

    const remainingMods = availableMods.filter(m => !groupedModIds.has(m.id));
    const charGroups: Record<string, Mod[]> = {};
    for (const mod of remainingMods) {
      if (!charGroups[mod.character]) charGroups[mod.character] = [];
      charGroups[mod.character].push(mod);
    }

    for (const charMods of Object.values(charGroups)) {
      if (charMods.length < 2) continue;
      
      charMods.sort((a, b) => a.name.localeCompare(b.name));
      let currentGroup = [charMods[0]];
      
      for (let i = 1; i < charMods.length; i++) {
         const prevName = currentGroup[0].name;
         const currName = charMods[i].name;
         
         let prefix = prevName;
         while (currName.indexOf(prefix) !== 0 && prefix.length > 0) {
            prefix = prefix.substring(0, prefix.length - 1);
         }
         
         if (prefix.length >= 10) {
            currentGroup.push(charMods[i]);
         } else {
            if (currentGroup.length > 1) {
               const cp = getCommonPrefix(currentGroup.map(m => m.name));
               proposedFolders.push({
                 id: `folder_auto_${Date.now()}_${folderIndex++}`,
                 name: cp || "Auto Folder",
                 modIds: currentGroup.map(m => m.id)
               });
            }
            currentGroup = [charMods[i]];
         }
      }
      
      if (currentGroup.length > 1) {
         const cp = getCommonPrefix(currentGroup.map(m => m.name));
         proposedFolders.push({
           id: `folder_auto_${Date.now()}_${folderIndex++}`,
           name: cp || "Auto Folder",
           modIds: currentGroup.map(m => m.id)
         });
      }
    }

    if (proposedFolders.length > 0) {
      setAutoFolderPreview({ proposedFolders });
    } else {
      await showAlert("No new similar mods found to group into folders!");
    }
    setIsAutoFoldering(false);
    }, 50);
  };

  const confirmAutoFolder = (approvedFolderIds: string[]) => {
    if (!autoFolderPreview) return;
    const foldersToAdd = autoFolderPreview.proposedFolders.filter(f => approvedFolderIds.includes(f.id));
    saveFolders([...folders, ...foldersToAdd]);
    setAutoFolderPreview(null);
  };

  const handlePreviewNameChange = (folderId: string, newName: string) => {
    setAutoFolderPreview(prev => {
      if (!prev) return prev;
      return {
        proposedFolders: prev.proposedFolders.map(f => f.id === folderId ? { ...f, name: newName } : f)
      };
    });
  };

  const handleSaveToGame = async () => {
    try {
      setIsSaving(true);
      let path = gamePath || localStorage.getItem("mhm_game_path");
      if (!path) {
        try {
          path = await invoke("get_mhur_paks_path");
          updateGamePath(path);
        } catch (autoDetectError) {
          const selected = await open({
            directory: true,
            multiple: false,
            title: "Select your My Hero Ultra Rumble 'Paks' folder (HerovsGame/Content/Paks)"
          });
          if (!selected) {
            setIsSaving(false);
            return;
          }
          path = selected as string;
          updateGamePath(path);
        }
      }
      const activeModPaths = mods.filter(m => m.active).map(m => m.folder_path);
      await invoke("deploy_mods", { gamePath: path, activeModPaths });
      await showAlert("Mods saved to game successfully!");
    } catch (e) {
      console.error(e);
      await showAlert("Error saving mods: " + e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunGame = async () => {
    try {
      setIsLaunching(true);
      let path = gamePath || localStorage.getItem("mhm_game_path");
      if (!path) {
        try {
          path = await invoke("get_mhur_paks_path");
          updateGamePath(path);
        } catch (autoDetectError) {
          const selected = await open({
            directory: true,
            multiple: false,
            title: "Select your My Hero Ultra Rumble 'Paks' folder (HerovsGame/Content/Paks)"
          });
          if (!selected) {
            setIsLaunching(false);
            return;
          }
          path = selected as string;
          updateGamePath(path);
        }
      }
      const activeModPaths = mods.filter(m => m.active).map(m => m.folder_path);
      await invoke("deploy_mods", { gamePath: path, activeModPaths });
      await invoke("launch_game");
    } catch (e) {
      console.error(e);
      await showAlert("Error: " + e);
    } finally {
      setIsLaunching(false);
    }
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active.data.current?.type === 'mod') {
      const modId = active.data.current.modId;
      const isInFolder = folders.some(f => f.modIds.includes(modId));
      if (over && over.data.current?.type === 'folder') {
        const targetFolderId = over.data.current.folderId;
        const targetFolder = folders.find(f => f.id === targetFolderId);
        if (targetFolder?.modIds.includes(modId)) return;
        let updatedFolders = folders.map(f => ({ ...f, modIds: f.modIds.filter(id => id !== modId) }));
        updatedFolders = updatedFolders.map(f => {
          if (f.id === targetFolderId) return { ...f, modIds: [...f.modIds, modId] };
          return f;
        });
        saveFolders(updatedFolders);
      } else if (isInFolder) {
        const updatedFolders = folders.map(f => ({ ...f, modIds: f.modIds.filter(id => id !== modId) }));
        saveFolders(updatedFolders);
      }
      return;
    }
    if (!over) return;
    if (active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) return arrayMove(items, oldIndex, newIndex);
        return items;
      });
    }
  }

  return (
    <GlobalErrorBoundary>
      <div onContextMenu={(e) => e.preventDefault()} className="relative font-sans text-sm w-full h-screen overflow-hidden">
        <div className="flex h-screen w-full bg-hero-bg text-hero-text overflow-hidden selection:bg-hero-accent selection:text-black relative z-10">
          {selection === "custom" && customBgImageDataUri && (
            <div 
              className="absolute inset-0 pointer-events-none z-[-1]" 
              style={{ 
                backgroundImage: `url('${customBgImageDataUri.replace(/'/g, "\\'")}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: customBgOpacity
              }}
            />
          )}
          <div className="w-64 bg-hero-sidebar flex flex-col shrink-0 border-r border-hero-border relative shadow-2xl z-20">
        <div className="p-6 pb-2">
          <h1 className="font-black text-2xl tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-br from-hero-primary to-orange-500 drop-shadow-sm">
            PLUS ULTRA
          </h1>
          <h2 className="font-bold text-[10px] uppercase tracking-[0.25em] text-hero-muted mt-[-2px]">
            Mod Manager
          </h2>
        </div>
        <div className="mt-8 px-4 space-y-1">
          <NavItem icon={<FolderOpen size={18} />} label="Local Library" active={activeTab === "Local"} onClick={() => setActiveTab("Local")} />
          <NavItem icon={<Globe size={18} />} label="Mod Discovery" active={activeTab === "Discovery" || activeTab === "Store" || activeTab === "GameBanana" || activeTab === "NexusMods"} onClick={() => setActiveTab("Discovery")} />
          <NavItem icon={<Shuffle size={18} />} label="Skin Swapper" active={activeTab === "SkinSwapper"} onClick={() => setActiveTab("SkinSwapper")} />
          <NavItem icon={<Merge size={18} />} label="Mod Merger" active={activeTab === "ModMerger"} onClick={() => setActiveTab("ModMerger")} />
          <NavItem icon={<Settings size={18} />} label="Settings" active={activeTab === "Settings"} onClick={() => setActiveTab("Settings")} />
        </div>
        {activeTab === "Local" && (
          <div className="mt-8 px-5 flex-1 overflow-y-auto custom-scrollbar">
            <div className="text-[10px] font-black text-hero-text/30 uppercase tracking-widest mb-3">Categories</div>
            <FilterItem label="All Mods" count={mods.length} active={activeCategory === "All Mods"} onClick={() => setActiveCategory("All Mods")} />
            {Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <FilterItem key={cat} label={cat} count={count} active={activeCategory === cat} onClick={() => setActiveCategory(cat)} />
            ))}
            <div className="text-[10px] font-black text-hero-text/30 uppercase tracking-widest mt-8 mb-3 flex items-center justify-between">
              COLLECTIONS
              <button onClick={() => setIsCreatingCollection(true)} className="hover:text-hero-text"><Plus size={12}/></button>
            </div>
            {isCreatingCollection && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-black/20 rounded-sm border border-hero-border">
                <input autoFocus type="text" placeholder="Collection Name..." value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCreateCollection(); if (e.key === "Escape") setIsCreatingCollection(false); }} className="bg-transparent text-xs text-hero-text outline-none w-full" />
              </div>
            )}
            {collections.map(col => (
              <div key={col.id} className="group flex items-center relative w-full">
                <div className="w-full">
                  {renamingCollectionId === col.id ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-sm mb-1 bg-black/40 border border-hero-accent/50">
                      <input autoFocus type="text" value={renamingText} onChange={e => setRenamingText(e.target.value)} onBlur={() => handleRenameCollectionSubmit(col.id)} onKeyDown={e => { if (e.key === "Enter") handleRenameCollectionSubmit(col.id); if (e.key === "Escape") setRenamingCollectionId(null); }} className="bg-transparent text-xs text-hero-text outline-none w-full" onClick={e => e.stopPropagation()} />
                    </div>
                  ) : (
                    <FilterItem label={col.name} count={col.activeMods.length} active={activeCategory === col.id} onClick={() => applyCollection(col.id)} hideCountOnHover={true} forceHideCount={collectionMenu?.colId === col.id} />
                  )}
                </div>
                <button onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setCollectionMenu({ x: rect.right + 10, y: rect.top, colId: col.id }); }} className={`absolute right-3 text-hero-text hover:text-hero-accent transition-all p-1 rounded-sm ${collectionMenu?.colId === col.id ? 'opacity-100 text-hero-accent' : 'opacity-0 group-hover:opacity-100'}`}><MoreVertical size={16} /></button>
              </div>
            ))}
            <div className="text-[10px] font-black text-hero-text/30 uppercase tracking-widest mt-8 mb-3">Characters</div>
            {displayCharacters.map((char) => {
              if (char === "All") {
                 return <FilterItem key={char} label={char} count={mods.length} active={activeCategory === char} onClick={() => setActiveCategory(char)} />;
              }
              const isCharExpanded = expandedCharacters.has(char);
              const charMods = mods.filter(m => m.character === char);
              
              const toggleChar = (e: React.MouseEvent) => {
                e.stopPropagation();
                const next = new Set(expandedCharacters);
                if (next.has(char)) next.delete(char);
                else next.add(char);
                setExpandedCharacters(next);
              };

              return (
                <div key={char} className="w-full">
                  <div 
                    onClick={() => setActiveCategory(`char:${char}`)}
                    className={`w-full flex items-center justify-between px-2 py-2 rounded-sm cursor-pointer transition-all duration-200 mb-1 ${activeCategory === `char:${char}` || activeCategory === char ? 'bg-hero-accent/10 text-hero-accent border border-hero-accent/20' : 'text-hero-muted hover:bg-hero-surface hover:text-hero-text border border-transparent'}`}
                  >
                    <div className="flex items-center gap-1 overflow-hidden">
                      <div onClick={toggleChar} className="p-0.5 hover:bg-hero-surfaceHover rounded-sm text-hero-text/50 hover:text-hero-text cursor-pointer shrink-0">
                        {isCharExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                      <span className="text-xs font-bold truncate">{char}</span>
                    </div>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0 transition-opacity duration-200 ${activeCategory === `char:${char}` || activeCategory === char ? 'bg-hero-accent/20' : 'bg-hero-surface'}`}>{charMods.length}</span>
                  </div>
                  
                  {isCharExpanded && (
                    <div className="pl-4 border-l border-hero-border/30 ml-2 mt-1 space-y-1 mb-2">
                      {Array.from(new Set(charMods.map(m => m.category))).sort().map(cat => {
                        const catKey = `${char}|${cat}`;
                        const isCatExpanded = expandedCategories.has(catKey);
                        const catMods = charMods.filter(m => m.category === cat);
                        
                        const toggleCat = (e: React.MouseEvent) => {
                          e.stopPropagation();
                          const next = new Set(expandedCategories);
                          if (next.has(catKey)) next.delete(catKey);
                          else next.add(catKey);
                          setExpandedCategories(next);
                        };
                        
                        return (
                          <div key={catKey} className="w-full">
                            <div 
                              onClick={() => setActiveCategory(`char:${char}|cat:${cat}`)}
                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm cursor-pointer transition-all duration-200 ${activeCategory === `char:${char}|cat:${cat}` ? 'bg-hero-accent/10 text-hero-accent border border-hero-accent/20' : 'text-hero-muted hover:bg-hero-surface hover:text-hero-text border border-transparent'}`}
                            >
                              <div className="flex items-center gap-1 overflow-hidden">
                                <div onClick={toggleCat} className="p-0.5 hover:bg-hero-surfaceHover rounded-sm text-hero-text/50 hover:text-hero-text cursor-pointer shrink-0">
                                  {isCatExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </div>
                                <span className="text-[11px] font-bold truncate">{cat}</span>
                              </div>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0 ${activeCategory === `char:${char}|cat:${cat}` ? 'bg-hero-accent/20' : 'bg-hero-surface'}`}>{catMods.length}</span>
                            </div>
                            
                            {isCatExpanded && (
                              <div className="pl-4 border-l border-hero-border/30 ml-2 mt-1 space-y-0.5 mb-1">
                                {Array.from(new Set(catMods.map(m => extractSlotFromMod(m)))).sort().map(slot => {
                                  const activeSlotStr = `char:${char}|cat:${cat}|slot:${slot}`;
                                  const slotMods = catMods.filter(m => extractSlotFromMod(m) === slot);
                                  return (
                                    <div 
                                      key={slot}
                                      onClick={() => setActiveCategory(activeSlotStr)}
                                      className={`w-full flex items-center justify-between px-2 py-1 rounded-sm cursor-pointer transition-all duration-200 ${activeCategory === activeSlotStr ? 'bg-hero-accent/10 text-hero-accent border border-hero-accent/20' : 'text-hero-muted hover:bg-hero-surface hover:text-hero-text border border-transparent'}`}
                                    >
                                      <span className="text-[10px] font-medium truncate">{slot}</span>
                                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm shrink-0 ${activeCategory === activeSlotStr ? 'bg-hero-accent/20' : 'bg-hero-surface'}`}>{slotMods.length}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="p-4 mt-auto bg-transparent border-t border-hero-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e] animate-pulse"></div>
            <span className="text-xs font-bold text-hero-muted uppercase tracking-wider">MHUR Ready</span>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col relative bg-transparent border-l border-hero-border shadow-2xl">
        <div className="h-24 px-8 flex items-center justify-between border-b border-hero-border bg-hero-sidebar/40 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-5">
            <h2 className="text-3xl font-black italic tracking-tight">
              {activeTab === "Local" ? "LOCAL LIBRARY" : 
               activeTab === "Store" ? "DISCORD STORE" : 
               activeTab === "GameBanana" ? "GAMEBANANA" : 
               activeTab === "NexusMods" ? "NEXUS MODS" : 
               activeTab === "Discovery" ? "MOD DISCOVERY" : 
               activeTab === "SkinSwapper" ? "SKIN SWAPPER" : 
               activeTab === "ModMerger" ? "MOD MERGER" : 
               "SETTINGS"}
            </h2>
            <div className="h-8 w-[2px] bg-white/10 transform rotate-12"></div>
            {activeTab === "Local" && (
              <span className="text-xs font-bold text-hero-accent bg-hero-accent/10 px-3 py-1.5 rounded-sm border border-hero-accent/20 tracking-wider">
                 {mods.length} INSTALLED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink min-w-0">
            {activeTab === "Local" && (
              <div className="flex items-center gap-2 mr-2">
                  <button 
                    onClick={handleAutoFolder} 
                    disabled={isAutoFoldering} 
                    className={`group relative flex items-center justify-center gap-2 text-hero-text font-black italic tracking-widest pl-5 pr-4 h-11 rounded-sm bg-hero-surface border border-hero-border hover:bg-hero-surfaceHover hover:border-hero-accent/50 transition-all duration-300 transform hover:scale-105 active:scale-95 ${isAutoFoldering ? 'opacity-50 cursor-not-allowed scale-100 hover:scale-100 hover:border-hero-border' : ''}`}
                  >
                    <FolderPlus size={18} className="text-hero-accent" />
                    {isAutoFoldering ? "SCANNING..." : "AUTO FOLDER"}
                    <div className="flex items-center justify-center ml-1 opacity-70 group/info cursor-help">
                      <Info size={16} className="text-hero-text/40 group-hover/info:text-hero-text transition-colors" />
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-max px-3 py-2 bg-black/95 text-white/90 text-xs rounded-md opacity-0 pointer-events-none group-hover/info:opacity-100 transition-opacity z-50 shadow-2xl border border-white/10 font-medium not-italic tracking-normal normal-case">
                        Automatically scans and groups your mods that share the same character
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={handleSaveToGame} 
                    disabled={isSaving} 
                    className={`group relative flex items-center justify-center gap-2 text-hero-text font-black italic tracking-widest pl-5 pr-4 h-11 rounded-sm bg-hero-surface border border-hero-border hover:bg-hero-surfaceHover hover:border-hero-accent/50 transition-all duration-300 transform hover:scale-105 active:scale-95 ${isSaving ? 'opacity-50 cursor-not-allowed scale-100 hover:scale-100 hover:border-hero-border' : ''}`}
                  >
                    <Save size={18} className="text-hero-accent" />
                    {isSaving ? "SAVING..." : "SAVE"}
                    <div className="flex items-center justify-center ml-1 opacity-70 group/info cursor-help">
                      <Info size={16} className="text-hero-text/40 group-hover/info:text-hero-text transition-colors" />
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-max px-3 py-2 bg-black/95 text-white/90 text-xs rounded-md opacity-0 pointer-events-none group-hover/info:opacity-100 transition-opacity z-50 shadow-2xl border border-white/10 font-medium not-italic tracking-normal normal-case">
                        Save to the game without having to launch it
                      </div>
                    </div>
                  </button>
                <button onClick={handleImportMod} className="flex items-center justify-center gap-2 text-hero-text font-black italic tracking-widest px-5 h-11 rounded-sm bg-hero-surface border border-hero-border hover:bg-hero-surfaceHover hover:border-hero-accent/50 transition-all duration-300 transform hover:scale-105 active:scale-95">
                  <Upload size={18} className="text-hero-accent" />
                  IMPORT MOD
                </button>
              </div>
            )}
            {activeTab === "Local" && (
              <button onClick={handleRunGame} disabled={isLaunching} className={`flex items-center justify-center gap-2 text-black font-black italic tracking-widest px-6 h-11 rounded-sm shadow-[0_0_15px_rgba(250,204,21,0.3)] transition-all duration-300 transform ${isLaunching ? 'bg-hero-accent/50 cursor-not-allowed scale-100' : 'bg-hero-accent hover:bg-hero-accentHover hover:shadow-[0_0_25px_rgba(250,204,21,0.5)] hover:scale-105 active:scale-95'}`}>
                <Play size={18} fill="currentColor" />
                {isLaunching ? "DEPLOYING..." : "LAUNCH GAME"}
              </button>
            )}
            {activeTab === "Local" && (
              <>
                <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
                <div className="relative group shrink min-w-0">
                  <input type="text" placeholder="Search mods..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-hero-card border border-hero-border text-sm font-medium text-hero-text pl-4 pr-10 h-11 rounded-sm outline-none w-32 sm:w-48 md:w-64 focus:w-48 md:focus:w-80 focus:border-hero-accent shadow-md transition-all duration-300 placeholder:text-hero-text/40 italic" />
                  {searchQuery ? (
                    <X size={16} className="absolute right-3 top-3.5 text-hero-text/60 hover:text-hero-accent transition-colors cursor-pointer" onClick={() => setSearchQuery("")} />
                  ) : (
                    <Search size={16} className="absolute right-3 top-3.5 text-hero-text/30 group-focus-within:text-hero-accent transition-colors pointer-events-none" />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 flex overflow-hidden">
          {/* ── Discovery Tab ── */}
          {activeTab === "Discovery" && (
            <div className="flex-1 overflow-hidden flex">
              <ModDiscovery onSelect={(store) => setActiveTab(store)} />
            </div>
          )}

          {/* ── Store Tab ── */}
          {activeTab === "Store" && (
            <div className="flex-1 overflow-hidden block">
              <DiscordStore localMods={mods} allow18Plus={allow18Plus} onModInstalled={fetchMods} />
            </div>
          )}

          {/* ── GameBanana Tab ── */}
          {activeTab === "GameBanana" && (
            <div className="flex-1 overflow-hidden block">
              <GameBananaStore allow18Plus={allow18Plus} localMods={mods} onModInstalled={fetchMods} />
            </div>
          )}

          {/* ── Nexus Mods Tab ── */}
          {activeTab === "NexusMods" && (
            <div className="flex-1 overflow-hidden block">
              <NexusModsStore allow18Plus={allow18Plus} localMods={mods} onModInstalled={fetchMods} />
            </div>
          )}

          {/* ── Skin Swapper Tab ── */}
          {activeTab === "SkinSwapper" && (
            <div className="flex-1 overflow-hidden block">
              <SkinSwapper mods={mods} gamePath={gamePath} onModUpdated={() => fetchMods()} />
            </div>
          )}

          {/* ── Mod Merger Tab ── */}
          {activeTab === "ModMerger" && (
            <div className="flex-1 overflow-hidden block">
              <ModMerger mods={mods} gamePath={gamePath} onModsChanged={fetchMods} />
            </div>
          )}

          {/* ── Local Library Tab ── */}
          <div className={`flex-1 overflow-hidden ${activeTab === "Local" ? "grid" : "hidden"}`} style={{gridTemplateColumns: '55% 1fr'}}>
            <ModTable
              mods={mods}
              filteredMods={filteredMods}
              setMods={setMods}
              folders={folders}
              saveFolders={saveFolders}
              conflictSet={conflictSet}
              selectedModIds={selectedModIds}
              setSelectedModIds={setSelectedModIds}
              lastClickedModId={lastClickedModId}
              setLastClickedModId={setLastClickedModId}
              renamingModId={renamingModId}
              setRenamingModId={setRenamingModId}
              renamingText={renamingText}
              setRenamingText={setRenamingText}
              handleModClick={handleModClick}
              toggleMod={toggleMod}
              handleRenameSubmit={handleRenameSubmit}
              setContextMenu={setContextMenu}
              columns={columns}
              sortConfig={sortConfig}
              handleSort={handleSort}
              handleDragEnd={handleDragEnd}
            />
          </div>

          {/* ── Settings Tab ── */}
          {activeTab === "Settings" && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-transparent block">
               <div className="max-w-3xl space-y-10">

                 <section>
                   <h2 className="text-xl font-bold mb-6 text-hero-text flex items-center gap-2">
                     <Settings size={20} className="text-hero-accent" /> General
                   </h2>
                   
                   <div className="bg-hero-card border border-hero-border rounded-xl p-6 shadow-xl mb-6">
                     <h3 className="text-lg font-bold mb-4 text-hero-text">Theme</h3>
                     <div className="grid grid-cols-3 gap-4 mb-4">
                       {THEMES.map(t => (
                         <button 
                           key={t.id}
                           onClick={() => setTheme(t.id)}
                           className={`flex flex-col text-left rounded-lg overflow-hidden border-2 transition-all ${selection === t.id ? 'border-hero-accent ring-2 ring-hero-accent/20' : 'border-hero-border hover:border-hero-accent/50'} bg-hero-surface`}
                         >
                           <div className="h-20 w-full flex" style={{ backgroundColor: t.id === 'light' ? '#f8fafc' : t.id === 'custom' ? customThemeColors.bg : '#09090b' }}>
                             {/* Mini mockup of the UI */}
                             <div className="w-1/4 h-full border-r" style={{ borderColor: 'rgba(128,128,128,0.2)', backgroundColor: t.id === 'light' ? '#f1f5f9' : t.id === 'custom' ? customThemeColors.sidebar : '#18181b' }}></div>
                             <div className="flex-1 p-2 space-y-2">
                               <div className="w-1/3 h-2 rounded-full" style={{ backgroundColor: t.id === 'light' ? '#eab308' : t.id === 'custom' ? customThemeColors.accent : '#facc15' }}></div>
                               <div className="w-full h-4 rounded" style={{ backgroundColor: t.id === 'light' ? '#ffffff' : t.id === 'custom' ? customThemeColors.card : '#27272a' }}></div>
                             </div>
                           </div>
                           <div className="p-3">
                             <div className="font-bold text-sm text-hero-text">{t.name}</div>
                             <div className="text-[10px] text-hero-text-muted mt-1 leading-tight">{t.description}</div>
                           </div>
                         </button>
                       ))}
                       <button 
                           onClick={() => setTheme("system")}
                           className={`flex flex-col text-left rounded-lg overflow-hidden border-2 transition-all ${selection === "system" ? 'border-hero-accent ring-2 ring-hero-accent/20' : 'border-hero-border hover:border-hero-accent/50'} bg-hero-surface`}
                         >
                           <div className="h-20 w-full flex relative overflow-hidden">
                             <div className="absolute inset-0 w-1/2 bg-[#f8fafc]"></div>
                             <div className="absolute inset-0 left-1/2 w-1/2 bg-[#09090b]"></div>
                           </div>
                           <div className="p-3">
                             <div className="font-bold text-sm text-hero-text">Follow System</div>
                             <div className="text-[10px] text-hero-text-muted mt-1 leading-tight">Automatically match your operating system's appearance.</div>
                           </div>
                         </button>
                     </div>
                     
                     {selection === "custom" && (
                        <div className="p-5 border border-hero-border bg-hero-surface rounded-xl space-y-4">
                          <h4 className="font-bold text-hero-text text-sm flex items-center justify-between">
                            Custom Theme Builder
                            <button 
                              onClick={async () => {
                                const def = { bg: "#09090b", sidebar: "#18181b", card: "#27272a", text: "#fafafa", accent: "#facc15" };
                                setCustomThemeColors(def);
                                localStorage.setItem("customThemeColors", JSON.stringify(def));
                                setCustomBgImage("");
                                localStorage.removeItem("customBgImage");
                                setCustomBgOpacity(0.5);
                                localStorage.setItem("customBgOpacity", "0.5");
                              }}
                              className="px-3 py-1 bg-hero-card border border-hero-border hover:border-hero-danger hover:text-hero-danger rounded text-xs transition-colors"
                            >
                              Reset to Default
                            </button>
                          </h4>
                          
                          <div className="grid grid-cols-2 gap-4">
                            {[
                              { key: 'bg', label: 'Background' },
                              { key: 'sidebar', label: 'Sidebar' },
                              { key: 'card', label: 'Card / Panel' },
                              { key: 'text', label: 'Text' },
                              { key: 'accent', label: 'Accent' }
                            ].map(color => (
                              <div key={color.key} className="flex items-center gap-3">
                                <input 
                                  type="color" 
                                  value={customThemeColors[color.key as keyof typeof customThemeColors]}
                                  onChange={(e) => {
                                    const next = { ...customThemeColors, [color.key]: e.target.value };
                                    setCustomThemeColors(next);
                                    localStorage.setItem("customThemeColors", JSON.stringify(next));
                                  }}
                                  className="w-10 h-10 rounded cursor-pointer border border-hero-border bg-transparent p-1"
                                />
                                <div className="flex flex-col">
                                  <span className="text-xs text-hero-muted font-bold">{color.label}</span>
                                  <input 
                                    type="text" 
                                    value={customThemeColors[color.key as keyof typeof customThemeColors]}
                                    onChange={(e) => {
                                      const next = { ...customThemeColors, [color.key]: e.target.value };
                                      setCustomThemeColors(next);
                                      localStorage.setItem("customThemeColors", JSON.stringify(next));
                                    }}
                                    className="bg-transparent border-b border-hero-border text-hero-text text-sm w-20 focus:outline-none focus:border-hero-accent uppercase"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="pt-4 border-t border-hero-border mt-4">
                            <span className="text-xs text-hero-muted font-bold block mb-2">Background Image</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  const selected = await open({
                                    multiple: false,
                                    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
                                  });
                                  if (selected && typeof selected === 'string') {
                                    setCustomBgImage(selected);
                                    localStorage.setItem("customBgImage", selected);
                                  }
                                }}
                                className="px-3 py-1.5 bg-hero-accent text-black font-bold rounded-sm text-xs hover:bg-hero-accent-hover transition-colors"
                              >
                                Browse...
                              </button>
                              <input 
                                type="text" 
                                placeholder="Or paste a URL..."
                                value={customBgImage}
                                onChange={(e) => {
                                  setCustomBgImage(e.target.value);
                                  localStorage.setItem("customBgImage", e.target.value);
                                }}
                                className="flex-1 bg-hero-card border border-hero-border rounded-sm px-3 py-1.5 text-xs text-hero-text placeholder-hero-muted focus:outline-none focus:border-hero-accent"
                              />
                              {customBgImage && (
                                <button 
                                  onClick={async () => {
                                    setCustomBgImage("");
                                    localStorage.removeItem("customBgImage");
                                  }}
                                  className="p-1.5 hover:bg-hero-danger hover:text-white text-hero-muted rounded-sm transition-colors"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                            
                            {customBgImage && (
                              <div className="mt-3 flex items-center gap-3">
                                <span className="text-xs text-hero-muted w-16">Opacity</span>
                                <input 
                                  type="range" 
                                  min="0" max="1" step="0.05"
                                  value={customBgOpacity}
                                  onChange={(e) => {
                                    setCustomBgOpacity(parseFloat(e.target.value));
                                    localStorage.setItem("customBgOpacity", e.target.value);
                                  }}
                                  className="flex-1 accent-hero-accent h-1 bg-hero-border rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-xs text-hero-text w-8 text-right">{Math.round(customBgOpacity * 100)}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                   
                   <div className="bg-hero-card border border-hero-border rounded-xl p-6 shadow-xl">
                     <h3 className="text-lg font-bold mb-2 text-hero-text">Hidden to tray</h3>
                     <div className="flex items-center justify-between">
                       <p className="text-sm text-hero-muted">
                         Minimize if exited and it will go to the hidden tray instead of closing.
                       </p>
                       <label className="relative inline-flex items-center cursor-pointer">
                         <input type="checkbox" className="sr-only peer" checked={minimizeToTray} onChange={(e) => {
                           setMinimizeToTray(e.target.checked);
                           localStorage.setItem("minimizeToTray", String(e.target.checked));
                         }} />
                         <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-hero-accent"></div>
                       </label>
                     </div>
                   </div>

                   <div className="bg-hero-card border border-hero-border rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2 text-hero-text">Auto Check for Updates</h3>
                     <div className="flex items-center justify-between">
                       <p className="text-sm text-hero-muted">
                         Automatically check GitHub for new app releases on startup.
                       </p>
                       <label className="relative inline-flex items-center cursor-pointer">
                         <input type="checkbox" className="sr-only peer" checked={autoCheckUpdates} onChange={(e) => {
                           setAutoCheckUpdates(e.target.checked);
                           localStorage.setItem("autoCheckUpdates", String(e.target.checked));
                         }} />
                         <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-hero-accent"></div>
                       </label>
                     </div>
                   </div>

                   <div className="bg-hero-card/40 border border-hero-border rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2 flex items-center gap-2 text-red-400">18+ Content Filter</h3>
                     <div className="flex items-center justify-between">
                       <p className="text-sm text-hero-muted">
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

                   {/* Game & Mods Directory Section */}
                   <div className="bg-hero-card border border-hero-border rounded-xl p-6 shadow-xl mt-6">
                     <div className="flex items-center justify-between mb-3">
                       <div>
                         <h3 className="text-lg font-bold text-hero-text flex items-center gap-2">
                           <FolderOpen size={20} className="text-hero-accent" /> Game & Mods Location
                         </h3>
                         <p className="text-xs text-hero-muted mt-1">
                           Select the My Hero Ultra Rumble <code className="bg-black/40 px-1.5 py-0.5 rounded text-hero-accent font-mono text-[11px]">Paks</code> directory (where <code className="bg-black/40 px-1.5 py-0.5 rounded text-hero-accent font-mono text-[11px]">~mods</code> will be stored).
                         </p>
                       </div>
                       {gamePath ? (
                         <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 shrink-0">
                           <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                           Location Set
                         </span>
                       ) : (
                         <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5 shrink-0">
                           <AlertTriangle size={12} />
                           Not Configured
                         </span>
                       )}
                     </div>

                     <div className="space-y-3">
                       <div className="flex items-center gap-2">
                         <input
                           type="text"
                           value={gamePath || ""}
                           placeholder="e.g. C:\Program Files (x86)\Steam\steamapps\common\My Hero Ultra Rumble\HerovsGame\Content\Paks"
                           onChange={(e) => updateGamePath(e.target.value)}
                           className="flex-1 bg-hero-surface border border-hero-border rounded-lg px-3 py-2 text-xs text-hero-text placeholder:text-hero-muted focus:outline-none focus:border-hero-accent transition-colors font-mono"
                         />
                         <button
                           onClick={async () => {
                             try {
                               const selected = await open({
                                 directory: true,
                                 multiple: false,
                                 title: "Select My Hero Ultra Rumble 'Paks' Folder (HerovsGame/Content/Paks)",
                                 defaultPath: gamePath || undefined
                               });
                               if (selected && typeof selected === "string") {
                                 updateGamePath(selected);
                               }
                             } catch (e) {
                               console.error(e);
                             }
                           }}
                           className="px-4 py-2 bg-hero-accent hover:bg-hero-accent-hover text-black font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-md cursor-pointer"
                         >
                           <FolderOpen size={14} />
                           Browse...
                         </button>
                       </div>

                       <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                         <div className="flex items-center gap-2">
                           <button
                             onClick={async () => {
                               try {
                                 const detected: string = await invoke("get_mhur_paks_path");
                                 updateGamePath(detected);
                                 await showAlert("Auto-detected game location successfully!\n\n" + detected);
                               } catch (e: any) {
                                 await showAlert("Auto-detection failed: " + String(e) + "\n\nPlease click Browse to select your HerovsGame/Content/Paks folder manually.");
                               }
                             }}
                             className="px-3 py-1.5 bg-hero-surface hover:bg-hero-card border border-hero-border text-hero-text text-xs rounded-md transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                           >
                             <Search size={13} className="text-hero-accent" />
                             Auto-Detect Location
                           </button>

                           {gamePath && (
                             <button
                               onClick={async () => {
                                 invoke("open_path", { path: gamePath })
                                   .catch(async () => {
                                     await showAlert("Could not open directory: " + gamePath);
                                   });
                               }}
                               className="px-3 py-1.5 bg-hero-surface hover:bg-hero-card border border-hero-border text-hero-text text-xs rounded-md transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                             >
                               <Folder size={13} className="text-hero-accent" />
                               Open Folder in Explorer
                             </button>
                           )}
                         </div>

                         {gamePath && (
                           <button
                             onClick={async () => {
                               if (await showConfirm("Reset game location?")) {
                                 updateGamePath(null);
                               }
                             }}
                             className="text-xs text-hero-muted hover:text-hero-danger transition-colors underline cursor-pointer"
                           >
                             Clear Location
                           </button>
                         )}
                       </div>

                       {gamePath && (
                         <div className="mt-2 p-2.5 bg-black/30 border border-hero-border/50 rounded-lg flex items-center gap-2 text-xs text-hero-muted">
                           <Info size={14} className="text-hero-accent shrink-0" />
                           <span>
                             Mods deployment target: <span className="font-mono text-hero-text select-all">{gamePath}\~mods</span>
                           </span>
                         </div>
                       )}
                     </div>
                   </div>

                   <div className="bg-hero-card/40 border border-hero-border rounded-xl p-6 shadow-xl mt-6">
                     
                   <div className="bg-hero-card/40 border border-hero-border rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2">Tutorial</h3>
                     <p className="text-sm text-hero-muted mb-6">
                       Need a refresher? Replay the first-time setup tutorial.
                     </p>
                     
                     <button 
                       onClick={() => {
                         setTutorialStep(0);
                         setShowTutorial(true);
                       }}
                       className="px-4 py-2 bg-hero-accent hover:bg-hero-accent/90 text-hero-bg font-bold rounded-lg transition-colors flex items-center gap-2 text-sm cursor-pointer"
                     >
                       <Info size={16} />
                       Replay Tutorial
                     </button>
                   </div>

                   <h3 className="text-lg font-bold mb-2">Cache</h3>
                     <p className="text-sm text-hero-muted mb-6">
                       Clear the character/category scan cache. Your mods will NOT be deleted — the app will just re-detect character and category info on next load.
                     </p>
                     
                     <button 
                       onClick={async () => {
                         if (await showConfirm("Clear the scan cache? Your mods will NOT be deleted. The app will re-detect character/category info on next load.")) {
                            const keysToPreserve = [
                              "plus_ultra_collections",
                              "plus_ultra_folders",
                              "minimizeToTray",
                              "allow18Plus",
                              "autoCheckUpdates",
                              "nexus_api_key",
                              "global_card_size",
                              "discord_sort_order",
                              "mhm_theme_preference",
                              "mhm_game_path"
                            ];
                            const preservedData: Record<string, string> = {};
                            keysToPreserve.forEach(key => {
                              const value = localStorage.getItem(key);
                              if (value !== null) {
                                preservedData[key] = value;
                              }
                            });
                            localStorage.clear();
                            Object.keys(preservedData).forEach(key => {
                              localStorage.setItem(key, preservedData[key]);
                            });
                            invoke('clear_mod_cache').then(async () => {
                              await showAlert("Cache cleared successfully!");
                              window.location.reload(); // Reload to apply cache clear visually
                            }).catch(console.error);
                         }
                       }}
                       className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded-md transition-colors flex items-center gap-2"
                     >
                       <Trash2 size={16} /> Delete Cache
                     </button>
                   </div>

                   <div className="bg-hero-card/40 border border-hero-border rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2">Restore to Default</h3>
                     <p className="text-sm text-hero-muted mb-6">
                       It will remove all mods (Including the mods folder).
                     </p>
                     
                     <button 
                       onClick={async () => {
                         if (await showConfirm("WARNING: Are you sure you want to restore to default? This will permanently delete ALL your installed mods and the mods folder!")) {
                            invoke('restore_to_default', { gamePath: gamePath }).then(async () => {
                              await showAlert("Successfully restored to default!");
                              window.location.reload();
                            }).catch(async e  => { await showAlert("Error restoring to default: " + e); });
                         }
                       }}
                       className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded-md transition-colors flex items-center gap-2"
                     >
                       <Trash2 size={16} /> Restore to Default
                     </button>
                   </div>
                   <div className="bg-hero-card/40 border border-hero-border rounded-xl p-6 shadow-xl mt-6">
                     <h3 className="text-lg font-bold mb-2">Sign Out of Everything</h3>
                     <p className="text-sm text-hero-muted mb-6">
                       Remove all saved logins, API keys, and secure tokens for all connected mod stores (Discord, Nexus Mods, etc).
                     </p>
                     
                     <button 
                       onClick={async () => {
                         if (await showConfirm("Are you sure you want to sign out of everything? All your saved API keys and secure login tokens will be permanently deleted from your computer.")) {
                            try {
                                localStorage.removeItem("nexus_api_key");
                                await invoke('clear_discord_token');
                                await showAlert("Successfully signed out of all accounts.");
                                window.location.reload();
                            } catch (e) {
                                await showAlert("Error signing out: " + e);
                            }
                         }
                       }}
                       className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded-md transition-colors flex items-center gap-2"
                     >
                       <LogOut size={16} /> Sign Out of All Accounts
                     </button>
                   </div>
                 </section>

                 <div className="mt-8 pt-8 border-t border-hero-border flex flex-col items-center justify-center text-center pb-8">
                   <p className="text-hero-text text-sm font-bold tracking-wider mb-2">My Hero Manager</p>
                   <p className="text-hero-text/60 text-xs mb-4">Version 0.7</p>
                   <a 
                     href="https://github.com/regulardude1/My-Hero-Manager" 
                     target="_blank" 
                     rel="noreferrer"
                     className="text-hero-accent/70 hover:text-hero-accent transition-colors text-xs flex items-center gap-1"
                   >
                     <Globe size={14} /> GitHub Repository
                   </a>
                 </div>

               </div>
            </div>
          )}

        </div>
      </div>

      {/* DRAG OVERLAY */}
      {isDragging && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-8 pointer-events-none">
          <div className="w-full h-full border-2 border-dashed border-hero-accent/50 rounded-lg flex flex-col items-center justify-center gap-4 bg-hero-bg/40 max-w-4xl max-h-[80vh] m-auto shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-radial-gradient(circle, rgba(250,204,21,0.05) 0%, transparent 70%) pointer-events-none"></div>
            
            <div className="relative p-6 rounded-full bg-hero-accent/10 border border-hero-accent/20 text-hero-accent animate-bounce">
              <Upload size={48} className="stroke-[1.5]" />
            </div>
            
            <div className="text-center relative z-10">
              <h3 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-hero-primary to-orange-500 mb-2">
                PLUS ULTRA IMPORT
              </h3>
              <p className="text-sm text-hero-muted font-bold uppercase tracking-wider max-w-md">
                Drop your <span className="text-hero-accent">.pak</span> or <span className="text-hero-accent">.zip</span> mod files to install them instantly
              </p>
            </div>
          </div>
        </div>
      )}

      {/* INSTALLING LOADER */}
      {isInstalling && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4 pointer-events-auto">
          <div className="w-16 h-16 border-4 border-hero-accent/20 border-t-hero-primary rounded-full animate-spin"></div>
          <div className="text-center">
            <h3 className="text-lg font-black uppercase tracking-widest text-hero-accent animate-pulse">INSTALLING MODS</h3>
            <p className="text-xs text-hero-muted mt-1">Please wait while the manager registers the pak files...</p>
          </div>
        </div>
      )}

      {/* SYSTEM NOTIFICATION */}
      {installStatus && (
        <div className="absolute bottom-6 right-6 z-50 max-w-md bg-zinc-900/95 border border-hero-border rounded-lg shadow-2xl p-4 flex gap-3 animate-in slide-in-from-bottom duration-300">
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-hero-accent mb-1">System Notification</h4>
            <p className="text-xs text-hero-text/80 whitespace-pre-line leading-relaxed font-medium">
              {installStatus}
            </p>
          </div>
          <button 
            onClick={() => setInstallStatus(null)} 
            className="text-hero-muted hover:text-hero-text/80 transition-colors self-start shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Context Menu */}
      {importConflicts && importConflicts.conflicts[importConflicts.currentIndex] && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-hero-bg/95 border border-hero-border rounded-xl shadow-2xl overflow-hidden w-full max-w-md">
            <div className="p-4 border-b border-hero-border bg-hero-surface flex items-center gap-2">
              <AlertTriangle className="text-yellow-400" size={20} />
              <h3 className="text-lg font-black italic tracking-widest text-hero-text">DUPLICATE DETECTED</h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-hero-text/80 mb-4">
                The file you are importing is a duplicate of an already installed mod:
              </p>
              <div className="bg-hero-surface border border-hero-border p-3 rounded mb-6">
                <span className="font-bold text-hero-accent block mb-1">
                  {importConflicts.conflicts[importConflicts.currentIndex].duplicate_mod.name}
                </span>
                <span className="text-xs text-hero-muted block break-all">
                  File: {importConflicts.conflicts[importConflicts.currentIndex].file_path.split(/[\\/]/).pop()}
                </span>
              </div>
              <p className="text-xs text-hero-muted mb-6">
                What would you like to do?
              </p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={async () => {
                    const conflict = importConflicts.conflicts[importConflicts.currentIndex];
                    try {
                      await invoke("delete_mod", { id: conflict.duplicate_mod.id });
                    } catch (e) {
                      console.error("Failed to delete duplicate mod", e);
                    }
                    const nextPaths = [...importConflicts.pathsToInstall, conflict.file_path];
                    if (importConflicts.currentIndex + 1 < importConflicts.conflicts.length) {
                      setImportConflicts({ ...importConflicts, pathsToInstall: nextPaths, currentIndex: importConflicts.currentIndex + 1 });
                    } else {
                      setImportConflicts(null);
                      executeInstallMods(nextPaths);
                    }
                  }}
                  className="px-4 py-2 bg-hero-accent text-black font-bold border border-hero-accent rounded transition-colors w-full text-center hover:brightness-110"
                >
                  Replace Old Mod (Keep New)
                </button>
                <button 
                  onClick={async () => {
                    const nextPaths = [...importConflicts.pathsToInstall, importConflicts.conflicts[importConflicts.currentIndex].file_path];
                    if (importConflicts.currentIndex + 1 < importConflicts.conflicts.length) {
                      setImportConflicts({ ...importConflicts, pathsToInstall: nextPaths, currentIndex: importConflicts.currentIndex + 1 });
                    } else {
                      setImportConflicts(null);
                      executeInstallMods(nextPaths);
                    }
                  }}
                  className="px-4 py-2 bg-hero-surface hover:bg-hero-surfaceHover text-hero-text font-bold border border-hero-border rounded transition-colors w-full text-center"
                >
                  Keep Both
                </button>
                <button 
                  onClick={async () => {
                    const nextPaths = [...importConflicts.pathsToInstall]; 
                    if (importConflicts.currentIndex + 1 < importConflicts.conflicts.length) {
                      setImportConflicts({ ...importConflicts, pathsToInstall: nextPaths, currentIndex: importConflicts.currentIndex + 1 });
                    } else {
                      setImportConflicts(null);
                      if (nextPaths.length > 0) executeInstallMods(nextPaths);
                    }
                  }}
                  className="px-4 py-2 bg-transparent hover:bg-white/5 text-hero-muted font-bold border border-transparent hover:border-hero-border rounded transition-colors w-full text-center"
                >
                  Cancel Import for this File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Startup Duplicate Checker */}
      {startupConflicts && startupConflicts.groups[startupConflicts.currentIndex] && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="bg-hero-bg/95 border border-hero-border rounded-xl shadow-2xl overflow-hidden w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-hero-border bg-hero-surface flex items-center gap-2 shrink-0">
              <AlertTriangle className="text-yellow-400" size={24} />
              <div>
                <h3 className="text-lg font-black italic tracking-widest text-hero-text">STARTUP DUPLICATE CHECKER</h3>
                <p className="text-xs text-hero-muted font-medium">Group {startupConflicts.currentIndex + 1} of {startupConflicts.groups.length}</p>
              </div>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <p className="text-sm text-hero-text/80 mb-6">
                We detected the following installed mods that share identical internal files. You should probably delete the duplicates to prevent game crashes.
              </p>
              
              <div className="space-y-3 mb-6">
                {startupConflicts.groups[startupConflicts.currentIndex].map((mod) => (
                  <div key={mod.id} className="bg-hero-surface border border-hero-border p-4 rounded-lg flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-hero-accent block truncate">{mod.name}</span>
                      <span className="text-xs text-hero-muted block truncate opacity-70">Author: {mod.author} • Category: {mod.category}</span>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                           await invoke("delete_mod", { id: mod.id });
                           fetchMods();
                           
                           // If we delete one, we remove it from the array visually
                           const newGroups = [...startupConflicts.groups];
                           newGroups[startupConflicts.currentIndex] = newGroups[startupConflicts.currentIndex].filter(m => m.id !== mod.id);
                           
                           // If only 1 or 0 left in this group, auto advance
                           if (newGroups[startupConflicts.currentIndex].length <= 1) {
                              if (startupConflicts.currentIndex + 1 < newGroups.length) {
                                setStartupConflicts({ groups: newGroups, currentIndex: startupConflicts.currentIndex + 1 });
                              } else {
                                setStartupConflicts(null);
                              }
                           } else {
                              setStartupConflicts({ ...startupConflicts, groups: newGroups });
                           }
                        } catch (e) {
                           console.error(e);
                        }
                      }}
                      className="shrink-0 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/30 rounded transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                ))}
              </div>
              
            </div>
            
            <div className="p-4 border-t border-hero-border bg-hero-surface flex items-center justify-between shrink-0">
               <button 
                  onClick={async () => {
                     if (startupConflicts.currentIndex + 1 < startupConflicts.groups.length) {
                       setStartupConflicts({ ...startupConflicts, currentIndex: startupConflicts.currentIndex + 1 });
                     } else {
                       setStartupConflicts(null);
                     }
                  }}
                  className="px-6 py-2.5 bg-hero-surface hover:bg-hero-surfaceHover text-hero-text font-bold border border-hero-border rounded transition-colors w-full text-center"
               >
                 Keep Remaining (Skip)
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-hero-sidebar border border-hero-border rounded-md shadow-2xl py-1 z-50 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedModIds.size > 1 ? (
            <>
              <div className="px-4 py-2 text-[10px] font-black text-hero-accent uppercase tracking-widest border-b border-hero-border mb-1">
                {selectedModIds.size} MODS SELECTED
              </div>
              <button 
                className="w-full text-left px-4 py-2 text-xs text-hero-text/80 hover:bg-hero-surfaceHover hover:text-hero-text flex items-center gap-2"
                onClick={async () => {
                  handleBulkToggle();
                  setContextMenu(null);
                }}
              ><CheckSquare size={12}/> Toggle Selected</button>
              
              <div className="h-[1px] bg-white/10 my-1"></div>
              
              <button 
                className="w-full text-left px-4 py-2 text-xs text-hero-accent hover:bg-hero-accent/20 flex items-center gap-2 font-bold"
                onClick={async () => {
                  setFolderPrompt({
                    visible: true,
                    value: "New Folder",
                    callback: (folderName) => {
                      if (folderName) {
                        const newFolder: ModFolder = {
                          id: `folder_manual_${Date.now()}`,
                          name: folderName,
                          modIds: Array.from(selectedModIds)
                        };
                        saveFolders([...folders, newFolder]);
                      }
                    }
                  });
                  setContextMenu(null);
                }}
              ><FolderPlus size={12}/> Group into Folder</button>
              
              <div className="h-[1px] bg-white/10 my-1"></div>
              
              <button 
                className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-2"
                onClick={async () => {
                  handleBulkDelete();
                  setContextMenu(null);
                }}
              ><Trash2 size={12}/> Delete {selectedModIds.size} Mods</button>
            </>
          ) : (
            <>
              <button 
                className="w-full text-left px-4 py-2 text-xs text-hero-text/80 hover:bg-hero-surfaceHover hover:text-hero-text flex items-center gap-2"
                onClick={async () => {
                  setViewingModDetailsId(contextMenu.modId);
                  setContextMenu(null);
                }}
              ><Info size={12}/> View Details</button>

              <button 
                className="w-full text-left px-4 py-2 text-xs text-hero-text/80 hover:bg-hero-surfaceHover hover:text-hero-text flex items-center gap-2"
                onClick={async () => {
                  const m = mods.find(m => m.id === contextMenu.modId);
                  if (m) {
                    setRenamingText(m.name);
                    setRenamingModId(contextMenu.modId);
                  }
                  setContextMenu(null);
                }}
              ><Edit2 size={12}/> Rename</button>
              
              <button 
                className="w-full text-left px-4 py-2 text-xs text-hero-text/80 hover:bg-hero-surfaceHover hover:text-hero-text flex items-center gap-2"
                onClick={async () => {
                  handleOpenFolder(contextMenu.modId);
                  setContextMenu(null);
                }}
              ><Folder size={12}/> Open Directory</button>

              <button 
                className="w-full text-left px-4 py-2 text-xs text-hero-accent hover:bg-hero-accent/20 flex items-center gap-2 font-bold"
                onClick={async () => {
                  setFolderPrompt({
                    visible: true,
                    value: "New Folder",
                    callback: (folderName) => {
                      if (folderName) {
                        const newFolder: ModFolder = {
                          id: `folder_manual_${Date.now()}`,
                          name: folderName,
                          modIds: [contextMenu.modId]
                        };
                        saveFolders([...folders, newFolder]);
                      }
                    }
                  });
                  setContextMenu(null);
                }}
              ><FolderPlus size={12}/> Create new folder</button>
              
              <div className="h-[1px] bg-white/10 my-1"></div>
              
              <button 
                className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-2"
                onClick={async () => {
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
          className="fixed bg-hero-sidebar border border-hero-border rounded-md shadow-2xl py-1 z-50 min-w-[160px]"
          style={{ top: collectionMenu.y, left: collectionMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="w-full text-left px-4 py-2 text-xs text-hero-text/80 hover:bg-hero-surfaceHover hover:text-hero-text flex items-center gap-2"
            onClick={async () => {
              const col = collections.find(c => c.id === collectionMenu.colId);
              if (col) {
                setRenamingCollectionId(col.id);
                setRenamingText(col.name);
              }
              setCollectionMenu(null);
            }}
          ><Edit2 size={12}/> Rename Collection</button>
          
          <button 
            className="w-full text-left px-4 py-2 text-xs text-hero-text/80 hover:bg-hero-surfaceHover hover:text-hero-text flex items-center gap-2"
            onClick={async () => {
              updateCollection(collectionMenu.colId);
              setCollectionMenu(null);
            }}
          ><CheckSquare size={12}/> Save Active Mods</button>
          
          <div className="h-[1px] bg-white/10 my-1"></div>
          
          <button 
            className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-2"
            onClick={async () => {
              deleteCollection(collectionMenu.colId);
              setCollectionMenu(null);
            }}
          ><Trash2 size={12}/> Delete Collection</button>
        </div>
      )}

      </div>

      {/* Mod Details Modal */}
      {viewingModDetailsId && (
        <ModDetailsModal
          mod={mods.find(m => m.id === viewingModDetailsId)}
          onClose={() => setViewingModDetailsId(null)}
        />
      )}

      {/* AUTO FOLDER PREVIEW MODAL */}
      {autoFolderPreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-hero-sidebar border border-hero-border p-6 rounded-sm w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl relative">
            <button onClick={() => setAutoFolderPreview(null)} className="absolute top-4 right-4 text-hero-muted hover:text-hero-text">
              <X size={20} />
            </button>
            <h3 className="text-xl font-black italic tracking-widest text-hero-accent mb-2 uppercase flex items-center gap-2">
              <FolderPlus size={20} />
              Auto Folder Preview
            </h3>
            <p className="text-hero-text/70 text-sm mb-6 border-b border-hero-border pb-4">
              We found the following mods that share identical internal files. Please uncheck any folders you don't want to create.
            </p>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
              {autoFolderPreview.proposedFolders.map((folder) => (
                <div key={folder.id} className="bg-black/40 border border-hero-border p-4 rounded-sm flex gap-4 group">
                  <div className="pt-1">
                    <input 
                      type="checkbox" 
                      id={`chk_${folder.id}`} 
                      defaultChecked 
                      className="accent-hero-accent w-4 h-4 cursor-pointer" 
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <label htmlFor={`chk_${folder.id}`} className="cursor-pointer">
                        <span className="text-hero-muted font-normal text-sm">({folder.modIds.length} mods)</span>
                      </label>
                      <RenameFolderInput 
                        initialName={folder.name} 
                        onChange={(newName) => handlePreviewNameChange(folder.id, newName)} 
                      />
                    </div>
                    <div className="space-y-1 mt-2 pl-2 border-l-2 border-hero-border/50">
                      {folder.modIds.map(id => {
                        const m = mods.find(m => m.id === id);
                        return m ? (
                          <div key={id} className="text-xs text-hero-text/60 truncate flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-hero-text/30"></div>
                            {m.name}
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-hero-border">
              <button 
                onClick={() => setAutoFolderPreview(null)}
                className="px-4 py-2 font-bold text-xs uppercase tracking-wider text-hero-text/70 hover:text-hero-text hover:bg-white/5 rounded-sm transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const approved = autoFolderPreview.proposedFolders
                    .filter(f => (document.getElementById(`chk_${f.id}`) as HTMLInputElement)?.checked)
                    .map(f => f.id);
                  confirmAutoFolder(approved);
                }}
                className="px-6 py-2 font-black italic tracking-widest bg-hero-accent text-hero-bg hover:bg-hero-accent/90 rounded-sm transition-colors"
              >
                CONFIRM FOLDERS
              </button>
            </div>
          </div>
        </div>
      )}

      {folderPrompt.visible && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] backdrop-blur-sm">
          <div className="bg-hero-sidebar border border-hero-border p-6 rounded-md shadow-2xl max-w-sm w-full">
            <h3 className="text-hero-text font-black text-lg uppercase tracking-wider mb-4">New Folder</h3>
            <input
              type="text"
              autoFocus
              className="w-full bg-hero-surface border border-hero-border text-hero-text p-2 rounded-sm mb-6 outline-none focus:border-hero-accent transition-colors"
              placeholder="Enter folder name..."
              value={folderPrompt.value}
              onChange={(e) => setFolderPrompt({ ...folderPrompt, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  folderPrompt.callback(folderPrompt.value);
                  setFolderPrompt({ ...folderPrompt, visible: false });
                } else if (e.key === 'Escape') {
                  setFolderPrompt({ ...folderPrompt, visible: false });
                }
              }}
            />
            <div className="flex justify-end gap-3">
              <button 
                className="px-4 py-2 font-bold text-xs uppercase tracking-wider text-hero-muted hover:text-hero-text transition-colors"
                onClick={() => setFolderPrompt({ ...folderPrompt, visible: false })}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 font-black italic text-xs uppercase tracking-wider bg-hero-accent text-hero-bg hover:bg-hero-accent/90 rounded-sm transition-colors"
                onClick={async () => {
                  folderPrompt.callback(folderPrompt.value);
                  setFolderPrompt({ ...folderPrompt, visible: false });
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {showModsFolderPrompt && modsFolderPromptPath && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-hero-bg/95 backdrop-blur-xl border border-hero-border rounded-xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-hero-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-hero-primary/10 flex items-center justify-center mb-4 border border-hero-primary/20">
                <FolderPlus size={32} className="text-hero-primary" />
              </div>
              <h2 className="text-xl font-bold text-hero-text mb-2 text-center">~mods Folder Not Found</h2>
              <p className="text-hero-text/70 text-center mb-6 text-sm">
                The <span className="font-mono text-hero-primary">~mods</span> folder does not exist at your selected game path. Would you like to create it now?
              </p>
              <div className="flex gap-4 w-full mb-4">
                <button
                  onClick={() => setShowModsFolderPrompt(false)}
                  className="flex-1 py-2 px-4 rounded-lg font-medium text-hero-text bg-hero-border/50 hover:bg-hero-border transition-colors"
                >
                  No
                </button>
                <button
                  onClick={async () => {
                    try {
                      await invoke("create_dir_if_not_exists", { path: modsFolderPromptPath });
                      await showAlert("~mods folder created successfully!");
                    } catch (e) {
                      await showAlert("Failed to create ~mods folder: " + e);
                    }
                    setShowModsFolderPrompt(false);
                  }}
                  className="flex-1 py-2 px-4 rounded-lg font-medium text-hero-bg bg-hero-accent hover:bg-hero-accent/90 transition-colors shadow-lg shadow-hero-accent/20"
                >
                  Yes, Create It
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2 w-full justify-center">
                <input
                  type="checkbox"
                  id="dont-show-mods-prompt"
                  checked={dontShowModsPromptAgain}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDontShowModsPromptAgain(checked);
                    if (checked) {
                      localStorage.setItem("mhm_dont_show_mods_prompt", "true");
                    } else {
                      localStorage.removeItem("mhm_dont_show_mods_prompt");
                    }
                  }}
                  className="w-4 h-4 rounded border-hero-border bg-hero-bg/50 text-hero-primary focus:ring-hero-primary/30"
                />
                <label htmlFor="dont-show-mods-prompt" className="text-sm text-hero-text/70 select-none cursor-pointer">
                  Don't Show Again
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      </div>
    
      {globalDialog?.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
          <div className="bg-hero-bg/95 backdrop-blur-xl border border-hero-border rounded-xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-hero-primary/5 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-hero-accent/10 flex items-center justify-center mb-4 border border-hero-accent/20">
                <Info size={32} className="text-hero-accent" />
              </div>
              <h2 className="text-xl font-bold text-hero-text mb-2 text-center">
                {globalDialog.type === 'confirm' ? 'Confirmation' : 'Notice'}
              </h2>
              <p className="text-hero-text/70 text-center mb-6 text-sm whitespace-pre-wrap">
                {globalDialog.message}
              </p>
              <div className="flex gap-4 w-full">
                {globalDialog.type === 'confirm' && (
                  <button
                    onClick={globalDialog.onCancel}
                    className="flex-1 py-2 px-4 rounded-lg font-medium text-hero-text bg-hero-border/50 hover:bg-hero-border transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={globalDialog.onConfirm}
                  className="flex-1 py-2 px-4 rounded-lg font-medium text-hero-bg bg-hero-accent hover:bg-hero-accent/90 transition-colors shadow-lg shadow-hero-accent/20"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    
      {showTutorial && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-hero-bg/95 border border-hero-border rounded-2xl p-8 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col min-h-[400px]">
            <div className="absolute inset-0 bg-gradient-to-br from-hero-accent/5 to-transparent pointer-events-none" />
            
            {/* Header / Icon / Image */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center mt-2">
              {(() => {
                const step = TUTORIAL_STEPS[tutorialStep];
                const Icon = step.icon;
                return (
                  <div className="w-full flex justify-center items-center mb-6 min-h-[80px]">
                    {step.image ? (
                      <div className="relative w-full max-w-[400px] h-[180px] rounded-xl overflow-hidden border-2 border-hero-accent/30 shadow-lg shadow-hero-accent/10 bg-black/40 flex items-center justify-center">
                        <img 
                          src={step.image} 
                          alt={step.title} 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.parentElement) {
                                e.currentTarget.parentElement.innerHTML = `<div class="w-20 h-20 rounded-full bg-hero-accent/10 flex items-center justify-center border border-hero-accent/20"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-hero-accent"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>`;
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-hero-accent/10 flex items-center justify-center border border-hero-accent/20 shadow-lg shadow-hero-accent/10">
                        <Icon size={40} className="text-hero-accent" />
                      </div>
                    )}
                  </div>
                );
              })()}
              <h2 className="text-2xl font-black italic tracking-wide text-hero-text mb-4 uppercase">
                {TUTORIAL_STEPS[tutorialStep].title}
              </h2>
              <p className="text-hero-text/80 text-base leading-relaxed max-w-md">
                {TUTORIAL_STEPS[tutorialStep].description}
              </p>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-2 mb-8 mt-4 relative z-10">
              {TUTORIAL_STEPS.map((_, idx) => (
                <div 
                  key={idx} 
                  className={`h-2 rounded-full transition-all duration-300 ${tutorialStep === idx ? 'w-8 bg-hero-accent' : 'w-2 bg-hero-border'}`}
                />
              ))}
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-between items-center relative z-10">
              <button
                onClick={finishTutorial}
                className="text-hero-text/50 hover:text-hero-text text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Skip Tutorial
              </button>
              
              <div className="flex gap-3">
                {tutorialStep > 0 && (
                  <button
                    onClick={() => setTutorialStep(prev => prev - 1)}
                    className="px-5 py-2.5 rounded-lg font-bold text-sm text-hero-text bg-hero-surface hover:bg-hero-border transition-colors border border-hero-border cursor-pointer"
                  >
                    Back
                  </button>
                )}
                {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
                  <button
                    onClick={() => setTutorialStep(prev => prev + 1)}
                    className="px-6 py-2.5 rounded-lg font-bold text-sm text-hero-bg bg-hero-accent hover:bg-hero-accent/90 transition-colors shadow-lg shadow-hero-accent/20 cursor-pointer"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={finishTutorial}
                    className="px-6 py-2.5 rounded-lg font-black italic uppercase tracking-wider text-sm text-hero-bg bg-hero-accent hover:bg-hero-accent/90 transition-colors shadow-lg shadow-hero-accent/20 flex items-center gap-2 cursor-pointer"
                  >
                    <CheckSquare size={16} />
                    Get Started
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </GlobalErrorBoundary>
  );
}
export default App;
