import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Button } from "./button";
import { colors } from "@/theme";

export function LoadingView({ label = "იტვირთება..." }: { label?: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.wrap}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export function StateView({
  title,
  body,
  icon = "cube-outline",
  action,
  actionLabel,
}: {
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={38} color={colors.muted} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action && actionLabel ? <Button label={actionLabel} onPress={action} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 280, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
});
