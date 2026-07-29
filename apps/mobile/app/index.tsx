import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSettingsStore } from "@/stores/settings";
import { colors } from "@/theme";

export default function IndexScreen() {
  const hydrated = useSettingsStore((state) => state.hydrated);
  const complete = useSettingsStore((state) => state.onboardingComplete);
  if (!hydrated) {
    return <View style={styles.loading}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }
  return <Redirect href={complete ? "/(tabs)" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
