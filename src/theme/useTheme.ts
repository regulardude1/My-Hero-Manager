import { useState, useEffect } from "react";
import { ThemeManager, ActiveTheme } from "./ThemeManager";
import { ThemeSelection } from "./ThemeRegistry";

export function useTheme() {
  const [activeTheme, setActiveTheme] = useState<ActiveTheme>(ThemeManager.getActiveTheme());
  const [selection, setSelection] = useState<ThemeSelection>(ThemeManager.getSelection());

  useEffect(() => {
    const unsubscribe = ThemeManager.subscribe((active, sel) => {
      setActiveTheme(active);
      setSelection(sel);
    });
    return unsubscribe;
  }, []);

  const setTheme = (newSelection: ThemeSelection) => {
    ThemeManager.apply(newSelection);
  };

  return { activeTheme, selection, setTheme };
}
