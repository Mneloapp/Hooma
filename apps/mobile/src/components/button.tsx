import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { colors, radii } from "@/theme";

type Props = ComponentProps<typeof Pressable> & {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...props
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
      {...props}
    >
      {loading
        ? <ActivityIndicator color={variant === "primary" ? colors.white : colors.text} />
        : <Text allowFontScaling style={[styles.label, variant === "primary" && styles.primaryLabel, variant === "danger" && styles.dangerLabel]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.pill,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primary: { backgroundColor: colors.text, borderColor: colors.text },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line },
  danger: { backgroundColor: colors.surface, borderColor: colors.danger },
  label: { color: colors.text, fontSize: 15, fontWeight: "700" },
  primaryLabel: { color: colors.white },
  dangerLabel: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
