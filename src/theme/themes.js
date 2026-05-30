export const DEFAULT_THEME_ID = "mobr-og";

export const THEMES = [
  {
    id: "mobr-og",
    label: "MOBR OG",
    description: "Original MOBR dark interface",
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral dark theme for focused analytics",
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep blue professional dashboard theme",
  },
  {
    id: "paper",
    label: "Paper",
    description: "Clean light theme for reports and admin work",
  },
];

export function isValidThemeId(themeId) {
  return THEMES.some((theme) => theme.id === themeId);
}
