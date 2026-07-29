import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { colors, radii } from "@/theme";

type StatusData = {
  id: string;
  tracking_code: string | null;
  payment_status: string;
  total: number | string;
};

export default function PaymentResultScreen() {
  const router = useRouter();
  const { order = "" } = useLocalSearchParams<{ order?: string; return?: string }>();
  const { t, money } = useCopy();
  const query = useQuery({
    queryKey: ["checkout-status", order],
    queryFn: () => apiFetch<{ ok: true; data: StatusData }>(`/api/mobile/v1/checkout/status?order=${encodeURIComponent(order)}`, { authenticated: true }),
    enabled: Boolean(order),
    refetchInterval: (state) => {
      const status = state.state.data?.data.payment_status;
      return ["paid", "failed", "refunded", "review_required"].includes(status ?? "") ? false : 2_500;
    },
  });
  const status = query.data?.data.payment_status ?? "pending";
  const paid = status === "paid";
  const failed = status === "failed";
  const review = status === "review_required";
  return (
    <Screen assistant={false}>
      <View style={[styles.panel, paid ? styles.success : failed ? styles.failure : review ? styles.review : styles.pending]}>
        <Ionicons
          name={paid ? "checkmark-circle" : failed ? "close-circle" : review ? "alert-circle" : "time"}
          size={58}
          color={paid ? colors.success : failed ? colors.danger : colors.warning}
        />
        <Text style={styles.title}>{paid
          ? t("გადახდა დადასტურებულია", "Payment confirmed")
          : failed
            ? t("გადახდა ვერ დასრულდა", "Payment failed")
            : review
              ? t("გადახდას შემოწმება სჭირდება", "Payment needs review")
              : t("გადახდა მოწმდება", "Verifying payment")}</Text>
        <Text style={styles.body}>{paid
          ? t("BOG-ის ხელმოწერილი callback დადასტურებულია. შეკვეთა მიღებულია.", "BOG's signed callback is confirmed. Your order is received.")
          : t("ბანკის გვერდიდან დაბრუნება გადახდის დასტური არ არის. საბოლოო სტატუსს სერვერიდან ვამოწმებთ.", "Returning from the bank is not proof of payment. We are checking the final server status.")}</Text>
        {query.data ? <Text style={styles.total}>{money(Math.round(Number(query.data.data.total) * 100))}</Text> : null}
        {query.data ? <Text style={styles.tracking}>#{query.data.data.tracking_code ?? order.slice(0, 8).toUpperCase()}</Text> : null}
        <Button label={t("ჩემი შეკვეთები", "My orders")} onPress={() => router.replace("/(tabs)/orders")} />
        {!paid ? <Button label={t("სტატუსის განახლება", "Refresh status")} variant="secondary" onPress={() => query.refetch()} loading={query.isFetching} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 25, borderRadius: radii.large, alignItems: "center", gap: 14, borderWidth: 1 },
  success: { backgroundColor: "#E7F3EA", borderColor: "#B9D9C3" },
  failure: { backgroundColor: "#F9E7E4", borderColor: "#E8BBB5" },
  pending: { backgroundColor: "#FAEEDC", borderColor: "#E9CDA6" },
  review: { backgroundColor: "#F7E9DB", borderColor: "#E5B887" },
  title: { color: colors.text, fontSize: 25, lineHeight: 32, fontWeight: "900", textAlign: "center" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 23, textAlign: "center" },
  total: { color: colors.text, fontSize: 27, fontWeight: "900" },
  tracking: { color: colors.accent, fontSize: 12, fontWeight: "900" },
});
