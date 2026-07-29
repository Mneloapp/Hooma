export const colors = {
  background: "#F8F4EE",
  surface: "#FFFCF8",
  surfaceStrong: "#EEE8DF",
  text: "#272C25",
  muted: "#72766E",
  accent: "#6B765D",
  accentSoft: "#DFE8DA",
  line: "rgba(39,44,37,0.10)",
  white: "#FFFFFF",
  danger: "#A63C32",
  warning: "#A56A1F",
  success: "#397052",
} as const;

export const radii = {
  small: 12,
  medium: 18,
  large: 28,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: "#1F241E",
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
} as const;
