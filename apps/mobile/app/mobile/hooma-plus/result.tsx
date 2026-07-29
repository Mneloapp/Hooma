import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { colors, radii } from "@/theme";

export default function HoomaPlusResultScreen() {
  const router = useRouter();
  const { purchase = "" } = useLocalSearchParams<{ purchase?: string }>();
  const { t } = useCopy();
  const query = useQuery({
    queryKey: ["hooma-plus"],
    queryFn: () => apiFetch<{ ok: true; data: { purchases: { id: string; status: string }[] } }>("/api/mobile/v1/hooma-plus", { authenticated: true }),
    refetchInterval: (state) => {
      const status = state.state.data?.data.purchases.find((item) => item.id === purchase)?.status;
      return ["paid", "failed", "refunded", "review_required"].includes(status ?? "") ? false : 2_500;
    },
  });
  const status = query.data?.data.purchases.find((item) => item.id === purchase)?.status ?? "pending";
  return (
    <Screen assistant={false}>
      <View style={styles.panel}>
        <Text style={styles.title}>{status === "paid" ? t("Hooma+ გააქტიურდა", "Hooma+ is active") : t("გადახდა მოწმდება", "Verifying payment")}</Text>
        <Text style={styles.body}>{t("წევრობა აქტიურდება მხოლოდ BOG-ის ხელმოწერილი callback-ის server-side დადასტურების შემდეგ.", "Membership activates only after server-side verification of BOG's signed callback.")}</Text>
        <Button label={t("Hooma+ გვერდზე დაბრუნება", "Back to Hooma+")} onPress={() => router.replace("/hooma-plus")} />
        {status !== "paid" ? <Button label={t("სტატუსის განახლება", "Refresh")} variant="secondary" onPress={() => query.refetch()} loading={query.isFetching} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 24, borderRadius: radii.large, backgroundColor: colors.accentSoft, gap: 15, alignItems: "center" },
  title: { color: colors.text, fontSize: 25, fontWeight: "900", textAlign: "center" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "center" },
});
