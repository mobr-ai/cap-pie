import { DEFAULT_THEME_ID, isValidThemeId } from "./themes";

export const THEME_STORAGE_KEY = "cap.theme";

export function getStoredTheme() {
  try {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidThemeId(storedTheme) ? storedTheme : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function applyTheme(themeId) {
  const safeThemeId = isValidThemeId(themeId) ? themeId : DEFAULT_THEME_ID;

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", safeThemeId);
  }

  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, safeThemeId);
    }
  } catch {
    // Ignore storage errors. Theme still applies for the current session.
  }

  return safeThemeId;
}
