import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { LoadingView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type HoomaPlusData = {
  summary: {
    active: boolean;
    activeUntil: string | null;
    welcomeUnitsTotal: number;
    welcomeUnitsConsumed: number;
    welcomeUnitsReserved: number;
    welcomeUnitsRemaining: number;
  };
  purchases: { id: string; plan_code: string; amount: number | string; status: string; created_at: string; expires_at: string | null }[];
  paymentAvailable: boolean;
  rulesReady: boolean;
};

export default function HoomaPlusScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { language, t, money } = useCopy();
  const query = useQuery({
    queryKey: ["hooma-plus"],
    queryFn: () => apiFetch<{ ok: true; data: HoomaPlusData }>("/api/mobile/v1/hooma-plus", { authenticated: true }),
    enabled: Boolean(session),
  });
  const checkout = useMutation({
    mutationFn: (plan: "monthly" | "annual") => apiFetch<{ ok: boolean; redirectUrl?: string; purchaseId?: string }>("/api/mobile/v1/hooma-plus", {
      method: "POST",
      authenticated: true,
      body: JSON.stringify({ plan, checkoutKey: Crypto.randomUUID(), language }),
    }),
    onSuccess: async (result) => {
      if (!result.redirectUrl || !result.purchaseId) return;
      await WebBrowser.openAuthSessionAsync(
        result.redirectUrl,
        "https://hooma.ge/mobile/hooma-plus/result",
        { preferUniversalLinks: true },
      );
      router.replace({ pathname: "/mobile/hooma-plus/result", params: { purchase: result.purchaseId } });
    },
  });
  if (loading) return <Screen><LoadingView /></Screen>;
  if (!session) return <Redirect href={{ pathname: "/auth/login", params: { next: "/hooma-plus" } }} />;
  if (query.isLoading || !query.data) return <Screen><LoadingView /></Screen>;
  const data = query.data.data;
  return (
    <Screen title="Hooma+" subtitle={t("უფასო სტანდარტული მიწოდება აქტიური წევრობის განმავლობაში.", "Free standard delivery while membership is active.")}>
      <View style={styles.status}>
        <Ionicons name={data.summary.active ? "sparkles" : "leaf-outline"} size={30} color={colors.accent} />
        <Text style={styles.statusTitle}>{data.summary.active ? t("წევრობა აქტიურია", "Membership active") : t("წევრობა არააქტიურია", "Membership inactive")}</Text>
        <Text style={styles.statusBody}>{data.summary.activeUntil
          ? t(`მოქმედებს ${new Date(data.summary.activeUntil).toLocaleDateString("ka-GE")}-მდე`, `Active until ${new Date(data.summary.activeUntil).toLocaleDateString("en-GB")}`)
          : t("ავტომატური განახლების გარეშე", "No automatic renewal")}</Text>
      </View>
      <View style={styles.balance}>
        <Text style={styles.balanceValue}>{data.summary.welcomeUnitsRemaining}</Text>
        <Text style={styles.balanceText}>{t("პირველი 10 ერთეულიდან დარჩენილი უფასო მიწოდების ბალანსი", "Free-delivery units remaining from your first 10")}</Text>
      </View>
      <View style={styles.plans}>
        <Plan title={t("თვიური", "Monthly")} price={money(3500)} caption={t("1 თვე", "1 month")} onPress={() => checkout.mutate("monthly")} loading={checkout.isPending} disabled={!data.paymentAvailable || !data.rulesReady} />
        <Plan title={t("წლიური", "Annual")} price={money(35000)} caption={t("12 თვე · 2 თვე საჩუქრად", "12 months · save 2 months")} onPress={() => checkout.mutate("annual")} loading={checkout.isPending} disabled={!data.paymentAvailable || !data.rulesReady} />
      </View>
      {!data.paymentAvailable ? <Text style={styles.notice}>{t("Hooma+ ონლაინ გადახდა launch flag-ის ჩართვამდე გამორთულია.", "Hooma+ online payment remains off until the launch flag is enabled.")}</Text> : null}
      <Text style={styles.sectionTitle}>{t("შეძენის ისტორია", "Purchase history")}</Text>
      {data.purchases.length ? data.purchases.map((purchase) => (
        <View key={purchase.id} style={styles.history}>
          <View><Text style={styles.historyTitle}>{purchase.plan_code === "annual" ? t("წლიური", "Annual") : t("თვიური", "Monthly")}</Text><Text style={styles.historyDate}>{new Date(purchase.created_at).toLocaleDateString(language === "ka" ? "ka-GE" : "en-GB")}</Text></View>
          <View style={{ alignItems: "flex-end" }}><Text style={styles.historyPrice}>{money(Math.round(Number(purchase.amount) * 100))}</Text><Text style={styles.historyStatus}>{purchase.status}</Text></View>
        </View>
      )) : <Text style={styles.notice}>{t("შეძენის ისტორია ჯერ ცარიელია.", "No purchase history yet.")}</Text>}
    </Screen>
  );
}

function Plan({ title, price, caption, onPress, loading, disabled }: { title: string; price: string; caption: string; onPress: () => void; loading: boolean; disabled: boolean }) {
  return <View style={styles.plan}><Text style={styles.planTitle}>{title}</Text><Text style={styles.planPrice}>{price}</Text><Text style={styles.planCaption}>{caption}</Text><Button label={title} onPress={onPress} loading={loading} disabled={disabled} /></View>;
}

const styles = StyleSheet.create({
  status: { padding: 22, borderRadius: radii.large, backgroundColor: colors.accentSoft, gap: 8, alignItems: "center" },
  statusTitle: { color: colors.text, fontSize: 21, fontWeight: "900" },
  statusBody: { color: colors.muted, fontSize: 13 },
  balance: { flexDirection: "row", alignItems: "center", gap: 15, padding: 18, borderRadius: radii.medium, backgroundColor: colors.surface },
  balanceValue: { color: colors.accent, fontSize: 38, fontWeight: "900" },
  balanceText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 20 },
  plans: { gap: 12 },
  plan: { padding: 20, borderRadius: radii.large, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 8 },
  planTitle: { color: colors.accent, fontSize: 13, fontWeight: "900", textTransform: "uppercase" },
  planPrice: { color: colors.text, fontSize: 30, fontWeight: "900" },
  planCaption: { color: colors.muted, fontSize: 13, marginBottom: 6 },
  notice: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  history: { flexDirection: "row", justifyContent: "space-between", padding: 16, borderRadius: radii.medium, backgroundColor: colors.surface },
  historyTitle: { color: colors.text, fontWeight: "800" },
  historyDate: { color: colors.muted, fontSize: 11, marginTop: 4 },
  historyPrice: { color: colors.text, fontWeight: "900" },
  historyStatus: { color: colors.accent, fontSize: 11, marginTop: 4 },
});
