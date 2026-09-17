import { ThemeDefinition, ThemeRegistry, ThemeSelection } from "./ThemeRegistry";
import { SettingsService } from "./SettingsService";

export interface ActiveTheme {
  definition: ThemeDefinition;
  resolvedMode: string;
}

type ThemeChangeListener = (activeTheme: ActiveTheme, selection: ThemeSelection) => void;

class ThemeManagerImpl {
  private listeners: Set<ThemeChangeListener> = new Set();
  private currentSelection: ThemeSelection = "system";
  private currentActive: ActiveTheme | null = null;
  
  // Media query listener for system changes
  private mediaQuery: MediaQueryList | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.mediaQuery.addEventListener("change", this.handleSystemThemeChange);
    }
  }

  /**
   * Initializes the theme system. Should be called early in app lifecycle.
   */
  public init() {
    const saved = SettingsService.getThemeId();
    this.apply(saved);
  }

  /**
   * Apply a theme selection ("system" or a specific theme ID).
   */
  public apply(selection: ThemeSelection) {
    this.currentSelection = selection;
    SettingsService.setThemeId(selection);
    
    let resolvedId = selection;
    
    // Resolve system mode
    if (selection === "system") {
      resolvedId = this.getSystemPreferredId();
    }
    
    // Fallback if missing
    let definition = ThemeRegistry.get(resolvedId);
    if (!definition) {
      console.warn(`Theme '${resolvedId}' not found, falling back to default.`);
      definition = ThemeRegistry.getDefault();
      resolvedId = definition.id;
    }
    
    this.currentActive = {
      definition,
      resolvedMode: resolvedId
    };

    // Update DOM
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = resolvedId;
      // You could also manage CSS variables dynamically here if needed for custom user themes
    }

    this.notifyListeners();
  }

  public getActiveTheme(): ActiveTheme {
    if (!this.currentActive) {
      // Fallback if accessed before init
      return { definition: ThemeRegistry.getDefault(), resolvedMode: "default" };
    }
    return this.currentActive;
  }
  
  public getSelection(): ThemeSelection {
    return this.currentSelection;
  }

  public subscribe(listener: ThemeChangeListener): () => void {
    this.listeners.add(listener);
    // Initial call
    if (this.currentActive) {
      listener(this.currentActive, this.currentSelection);
    }
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    if (!this.currentActive) return;
    for (const listener of this.listeners) {
      listener(this.currentActive, this.currentSelection);
    }
  }

  private handleSystemThemeChange = () => {
    if (this.currentSelection === "system") {
      // Re-apply system logic
      this.apply("system");
    }
  };

  private getSystemPreferredId(): string {
    if (this.mediaQuery && !this.mediaQuery.matches) {
      // If prefers-color-scheme: light, use the built-in light theme
      return "light";
    }
    return "default"; // dark
  }
}

export const ThemeManager = new ThemeManagerImpl();
