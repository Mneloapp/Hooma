import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { registerForPushNotifications } from "@/lib/notifications";
import { useAuth } from "@/providers/auth-provider";
import { useSettingsStore } from "@/stores/settings";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { colors, radii } from "@/theme";

type SessionData = {
  user: { id: string; email: string | null };
  profile: { full_name: string | null; phone: string | null };
};

export default function AccountScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { language, t } = useCopy();
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const query = useQuery({
    queryKey: ["session-profile"],
    queryFn: () => apiFetch<{ ok: true; data: SessionData }>("/api/mobile/v1/session", { authenticated: true }),
    enabled: Boolean(session),
  });
  useEffect(() => {
    if (session) registerForPushNotifications(language).catch(() => undefined);
  }, [session, language]);

  if (!session) {
    return (
      <Screen title={t("ანგარიში", "Account")}>
        <View style={styles.guest}>
          <View style={styles.avatar}><Ionicons name="person-outline" size={38} color={colors.accent} /></View>
          <Text style={styles.guestTitle}>{t("Hooma-ში შესვლა", "Sign in to Hooma")}</Text>
          <Text style={styles.guestBody}>{t("შეინახე მისამართები, აკონტროლე შეკვეთები და გამოიყენე Hooma+.", "Save addresses, track orders and use Hooma+.")}</Text>
          <Button label={t("შესვლა", "Sign in")} onPress={() => router.push("/auth/login")} />
          <Button label={t("ანგარიშის შექმნა", "Create account")} variant="secondary" onPress={() => router.push("/auth/signup")} />
        </View>
        <AccountMenu language={language} t={t} setLanguage={setLanguage} />
      </Screen>
    );
  }

  const profile = query.data?.data;
  return (
    <Screen title={t("ანგარიში", "Account")}>
      <View style={styles.profile}>
        <View style={styles.avatar}><Text style={styles.initial}>{profile?.profile.full_name?.slice(0, 1).toUpperCase() ?? "H"}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{profile?.profile.full_name ?? t("Hooma მომხმარებელი", "Hooma customer")}</Text>
          <Text style={styles.email}>{profile?.user.email ?? session.user.email}</Text>
        </View>
      </View>
      <MenuItem icon="location-outline" label={t("მისამართები", "Addresses")} onPress={() => router.push("/addresses")} />
      <MenuItem icon="sparkles-outline" label="Hooma+" onPress={() => router.push("/hooma-plus")} />
      <MenuItem icon="notifications-outline" label={t("შეტყობინებები", "Notifications")} onPress={() => router.push("/notifications")} />
      <MenuItem icon="document-attach-outline" label={t("ინდივიდუალური შეკვეთა", "Custom order")} onPress={() => router.push("/custom-orders")} />
      <MenuItem icon="help-circle-outline" label={t("როგორ შევუკვეთოთ?", "How to order")} onPress={() => router.push("/how-to-order")} />
      <MenuItem icon="settings-outline" label={t("პროფილი და პარამეტრები", "Profile and settings")} onPress={() => router.push("/settings")} />
      <AccountMenu language={language} t={t} setLanguage={setLanguage} />
      <Button label={t("გასვლა", "Sign out")} variant="secondary" onPress={() => signOut()} />
    </Screen>
  );
}

function AccountMenu({
  language,
  t,
  setLanguage,
}: {
  language: "ka" | "en";
  t: (ka: string, en: string) => string;
  setLanguage: (language: "ka" | "en") => void;
}) {
  const router = useRouter();
  return (
    <>
      <MenuItem icon="language-outline" label={t("ენა: ქართული", "Language: English")} onPress={() => setLanguage(language === "ka" ? "en" : "ka")} />
      <MenuItem icon="shield-checkmark-outline" label={t("კონფიდენციალურობა", "Privacy Policy")} onPress={() => router.push({ pathname: "/legal/[document]", params: { document: "privacy" } })} />
      <MenuItem icon="document-text-outline" label={t("წესები და პირობები", "Terms and Conditions")} onPress={() => router.push({ pathname: "/legal/[document]", params: { document: "terms" } })} />
    </>
  );
}

function MenuItem({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.menu, pressed && { opacity: 0.7 }]}>
      <View style={styles.menuIcon}><Ionicons name={icon} size={20} color={colors.accent} /></View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={19} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  guest: { padding: 22, borderRadius: radii.large, backgroundColor: colors.surface, gap: 13, alignItems: "stretch" },
  guestTitle: { color: colors.text, fontSize: 23, fontWeight: "900", textAlign: "center" },
  guestBody: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 5 },
  profile: { flexDirection: "row", alignItems: "center", gap: 15, padding: 19, borderRadius: radii.large, backgroundColor: colors.accentSoft },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surface, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  initial: { color: colors.accent, fontSize: 29, fontWeight: "900" },
  profileName: { color: colors.text, fontSize: 20, fontWeight: "900" },
  email: { color: colors.muted, fontSize: 12, marginTop: 4 },
  menu: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  menuIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  menuLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "700" },
});
