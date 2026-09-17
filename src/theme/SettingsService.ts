import { ThemeSelection } from "./ThemeRegistry";

const THEME_KEY = "mhm_theme_preference";

export const SettingsService = {
  getThemeId(): ThemeSelection {
    const saved = localStorage.getItem(THEME_KEY);
    return saved ? (saved as ThemeSelection) : "system";
  },

  setThemeId(themeId: ThemeSelection): void {
    localStorage.setItem(THEME_KEY, themeId);
  }
};
