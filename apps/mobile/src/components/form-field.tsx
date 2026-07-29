import type { ComponentProps } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radii } from "@/theme";

type Props = ComponentProps<typeof TextInput> & {
  label: string;
  hint?: string;
};

export function FormField({ label, hint, multiline, style, ...props }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        style={[styles.input, multiline && styles.multiline, style]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: "700" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  multiline: { minHeight: 120, paddingTop: 14, textAlignVertical: "top" },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
