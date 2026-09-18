import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Collection, Mod } from "../utils/mods";

interface UseCollectionsOptions {
  mods: Mod[];
  setMods: (mods: Mod[]) => void;
  activeCategory: string;
  setActiveCategory: (category: string) => void;
  computeConflicts: (mods: Mod[]) => void;
  showAlert: (message: string) => Promise<void>;
}

export function useCollections({ mods, setMods, activeCategory, setActiveCategory, computeConflicts, showAlert }: UseCollectionsOptions) {
  const [collections, setCollections] = useState<Collection[]>(() => {
    try { return JSON.parse(localStorage.getItem("plus_ultra_collections") || "[]"); }
    catch { return []; }
  });

  useEffect(() => {
    invoke<string>("load_collections_json")
      .then((raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCollections(parsed);
            localStorage.setItem("plus_ultra_collections", raw);
          }
        } catch (e) { console.error(e); }
      })
      .catch(console.error);
  }, []);

  const saveCollections = (cols: Collection[]) => {
    setCollections(cols);
    const json = JSON.stringify(cols);
    localStorage.setItem("plus_ultra_collections", json);
    invoke("save_collections_json", { collectionsJson: json }).catch(console.error);
  };

  const createCollection = (name: string) => {
    const newCol: Collection = {
      id: Date.now().toString(),
      name: name.trim(),
      activeMods: mods.filter(m => m.active).map(m => m.id)
    };
    saveCollections([...collections, newCol]);
    setActiveCategory(newCol.id);
  };

  const applyCollection = (colId: string) => {
    const col = collections.find(c => c.id === colId);
    if (!col) return;
    const activeSet = new Set(col.activeMods);
    const newMods = mods.map(m => ({ ...m, active: activeSet.has(m.id) }));
    setMods(newMods);
    setActiveCategory(colId);
    computeConflicts(newMods);
  };

  const updateCollection = async (colId: string) => {
    const cols = collections.map(c =>
      c.id === colId ? { ...c, activeMods: mods.filter(m => m.active).map(m => m.id) } : c
    );
    saveCollections(cols);
    await showAlert("Collection updated with current active mods!");
  };

  const deleteCollection = (colId: string) => {
    saveCollections(collections.filter(c => c.id !== colId));
    if (activeCategory === colId) setActiveCategory("All Mods");
  };

  const renameCollection = (colId: string, name: string) => {
    const cols = collections.map(c => c.id === colId ? { ...c, name: name.trim() } : c);
    saveCollections(cols);
  };

  return { collections, saveCollections, createCollection, applyCollection, updateCollection, deleteCollection, renameCollection };
}
