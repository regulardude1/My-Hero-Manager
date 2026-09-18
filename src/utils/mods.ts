// Shared Mod types and pure helper functions (moved from App.tsx)

export type Mod = {
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
  pak_hash?: string;
};

export type ContextMenuState = { x: number; y: number; modId: string } | null;
export type Collection = { id: string; name: string; activeMods: string[] };
export type ModFolder = { id: string; name: string; modIds: string[]; };

export const getBaseFilename = (filepath: string) => {
  // Strip out costume slots to get the base structural file path
  return filepath.replace(/\/Model\/(Default|Costume_\d+|Or\/[^\/]+|Eq\/[^\/]+|Sp\/[^\/]+)\//, '/Model/<SLOT>/');
};

export const extractSlotFromMod = (mod: Mod): string => {
  if (mod.category === "Emote") {
    for (const file of mod.modified_files) {
      const match = file.match(/\/(?:em|EmotionAct|Emote)[_-]?(\d{2,3})/i);
      if (match) return `em${match[1]}`;
    }
  } else if (mod.category === "Skin" || mod.category === "Costume") {
    for (const file of mod.modified_files) {
      const match = file.match(/\/Model\/(Default|Costume_\d+|Sp\/[^\/]+)\//);
      if (match) {
        if (match[1].startsWith("Sp/")) return match[1].replace("Sp/", "Sp_");
        return match[1];
      }
    }
  } else if (mod.category === "Voice") {
    for (const file of mod.modified_files) {
      const match = file.match(/\/Voice\/([^\/]+)\//i);
      if (match) return match[1];
    }
  }
  return "Unknown";
};

export const getModDescription = (mod: Mod) => {
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
