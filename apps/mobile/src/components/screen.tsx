import type { PropsWithChildren, ReactNode } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radii } from "@/theme";
import { useCopy } from "@/lib/i18n";
import { useSettingsStore } from "@/stores/settings";

type Props = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  assistant?: boolean;
  headerRight?: ReactNode;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
}>;

export function Screen({
  children,
  title,
  subtitle,
  scroll = true,
  assistant = true,
  headerRight,
  contentContainerStyle,
}: Props) {
  const router = useRouter();
  const { language } = useCopy();
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const content = (
    <>
      {title ? (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {headerRight ?? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={language === "ka" ? "ინგლისურზე გადართვა" : "Switch to Georgian"}
              onPress={() => setLanguage(language === "ka" ? "en" : "ka")}
              style={styles.language}
            >
              <Text style={styles.languageText}>{language === "ka" ? "EN" : "ქარ"}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {children}
    </>
  );
  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : <View style={[styles.content, styles.flex, contentContainerStyle]}>{content}</View>}
      {assistant ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={language === "ka" ? "Hooma ასისტენტის გახსნა" : "Open Hooma Assistant"}
          onPress={() => router.push("/assistant")}
          style={styles.assistant}
        >
          <Ionicons name="sparkles" size={22} color={colors.white} />
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 120, gap: 18 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 16, marginBottom: 4 },
  headerCopy: { flex: 1, gap: 6 },
  title: { color: colors.text, fontSize: 32, lineHeight: 39, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  language: {
    minWidth: 48,
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  languageText: { color: colors.text, fontWeight: "800", fontSize: 12 },
  assistant: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#20251F",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
});
