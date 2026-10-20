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
  // Strip out costume slots to get the base structural file path.
  // UModel/Unreal paths can arrive with either slash style.
  const normalized = filepath.replace(/\\/g, "/");
  return normalized.replace(/\/Model\/(Default|Costume_\d+|Or\/[^/]+|Eq\/[^/]+|Sp\/[^/]+)\//i, "/Model/<SLOT>/");
};

const normalizeGamePath = (filepath: string) => filepath.replace(/\\/g, "/").replace(/\/+/g, "/");

/**
 * Returns the concrete game target a mod is replacing, e.g. Ch025:Costume_01.
 * This is intentionally based on the internal Character/Model path rather
 * than the mod's display name or the UI's costume label.
 */
export const getModCostumeTargetIds = (mod: Mod): string[] => {
  const targets = new Set<string>();

  for (const rawFile of mod.modified_files || []) {
    const file = normalizeGamePath(rawFile);
    // UModel does not always return the same root prefix. Depending on the
    // pak, the path can be Game/Character/..., Character/..., or even use a
    // Player/Enemy/Mob subdirectory. Match the actual Ch###/Model slot
    // instead of requiring a particular root path.
    const match = file.match(/(?:^|\/)Character\/(?:Player\/|Enemy\/|Mob\/)?(Ch\d{3})\/Model\/(Default|Costume_\d+|Eq\/[^/]+|Sp\/[^/]+|Or\/[^/]+)(?:\/|$)/i)
      || file.match(/(?:^|\/)(Ch\d{3})\/Model\/(Default|Costume_\d+|Eq\/[^/]+|Sp\/[^/]+|Or\/[^/]+)(?:\/|$)/i);
    if (!match) continue;

    const characterId = match[1].toUpperCase();
    const slotId = match[2].replace(/\//g, "_");
    targets.add(`${characterId}:${slotId}`);
  }

  return Array.from(targets);
};

export const getModCostumeTargetLabel = (mod: Mod): string => {
  const targets = getModCostumeTargetIds(mod);
  if (targets.length === 0) return "Unknown";
  return targets.length === 1 ? targets[0] : `${targets.length} costume targets`;
};

export const extractSlotFromMod = (mod: Mod): string => {
  if (mod.category === "Emote") {
    for (const file of mod.modified_files) {
      const match = file.match(/\/(?:em|EmotionAct|Emote)[_-]?(\d{2,3})/i);
      if (match) return `em${match[1]}`;
    }
  } else if (mod.category === "Skin" || mod.category === "Costume") {
    const targets = getModCostumeTargetIds(mod);
    if (targets.length > 0) return targets[0].split(":")[1];
  } else if (mod.category === "Voice") {
    for (const file of mod.modified_files) {
      const match = normalizeGamePath(file).match(/\/Voice\/([^/]+)\//i);
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
  const targetIds = getModCostumeTargetIds(mod);
  
  mod.modified_files.forEach(file => {
    // Keep the UI description tied to the same concrete target IDs used by
    // the main conflict/filter logic instead of hard-coded costume numbers.
    targetIds.forEach(target => costumes.add(target));
    
    if (file.includes("/UI/") || file.includes("/GUI/")) hasUi = true;
    if (file.includes("/Sound/") || file.includes("/Audio/")) hasAudio = true;
  });
  
  let lines = [];
  if (costumes.size > 0) {
    lines.push(`• Overwrites costume ID: ${Array.from(costumes).join(", ")}`);
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
