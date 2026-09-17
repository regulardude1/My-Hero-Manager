export interface ThemeDefinition {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  author: string;
  description: string;
}

export type ThemeSelection = string | "system";

export const THEMES: ThemeDefinition[] = [
  {
    id: "default",
    name: "Default (Dark)",
    version: "1.0.0",
    apiVersion: 1,
    author: "Built-in",
    description: "The application's primary built-in theme. Optimized for low-light environments.",
  },
  {
    id: "light",
    name: "Light",
    version: "1.0.0",
    apiVersion: 1,
    author: "Built-in",
    description: "A clean, modern light mode experience. Best for daytime use.",
  },
  {
    id: "custom",
    name: "Custom",
    version: "1.0.0",
    apiVersion: 1,
    author: "User",
    description: "Build your own custom theme with custom colors and background image.",
  }
];

export const ThemeRegistry = {
  get(id: string): ThemeDefinition | undefined {
    return THEMES.find(t => t.id === id);
  },
  
  getAll(): ThemeDefinition[] {
    return THEMES;
  },
  
  getDefault(): ThemeDefinition {
    return THEMES[0];
  }
};
