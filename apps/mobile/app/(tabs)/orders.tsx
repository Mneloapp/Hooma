import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import type { ApiEnvelope, OrderSummary } from "@/types";
import { Screen } from "@/components/screen";
import { LoadingView, StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type OrdersPage = {
  items: OrderSummary[];
  totalCount: number;
};

const statusCopy: Record<string, [string, string, keyof typeof Ionicons.glyphMap]> = {
  order_received: ["შეკვეთა მიღებულია", "Order received", "receipt-outline"],
  confirmed: ["შეკვეთა დადასტურებულია", "Order confirmed", "checkmark-circle-outline"],
  production_queued: ["წარმოების რიგშია", "Queued for production", "time-outline"],
  in_production: ["წარმოება დაიწყო", "In production", "construct-outline"],
  quality_check: ["ხარისხის შემოწმება", "Quality check", "search-circle-outline"],
  ready_for_delivery: ["მზადაა მიწოდებისთვის", "Ready for delivery", "cube-outline"],
  out_for_delivery: ["კურიერს გადაეცა", "Out for delivery", "car-outline"],
  delivered: ["მიწოდებულია", "Delivered", "home-outline"],
  cancelled: ["გაუქმებულია", "Cancelled", "close-circle-outline"],
};

export default function OrdersScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const { language, t, money } = useCopy();
  const query = useQuery({
    queryKey: ["orders"],
    queryFn: () => apiFetch<ApiEnvelope<OrdersPage>>("/api/mobile/v1/orders", { authenticated: true }),
    enabled: Boolean(session),
    refetchInterval: 30_000,
  });
  if (loading) return <Screen title={t("შეკვეთები", "Orders")}><LoadingView /></Screen>;
  if (!session) {
    return (
      <Screen title={t("შეკვეთები", "Orders")}>
        <StateView
          icon="person-circle-outline"
          title={t("შედი ანგარიშში", "Sign in")}
          body={t("შეკვეთები და tracking timeline მხოლოდ შენს ანგარიშში ჩანს.", "Orders and tracking are available in your account.")}
          action={() => router.push({ pathname: "/auth/login", params: { next: "/(tabs)/orders" } })}
          actionLabel={t("შესვლა", "Sign in")}
        />
      </Screen>
    );
  }
  const orders = query.data?.data.items ?? [];
  return (
    <Screen
      title={t("შეკვეთები", "Orders")}
      subtitle={t("შეკვეთიდან მიწოდებამდე ერთი მკაფიო timeline.", "A clear timeline from order to delivery.")}
    >
      {query.isLoading ? <LoadingView /> : query.isError ? (
        <StateView
          title={t("შეკვეთები ვერ ჩაიტვირთა", "Orders could not load")}
          body={t("სცადე ხელახლა.", "Please try again.")}
          action={query.refetch}
          actionLabel={t("თავიდან ცდა", "Retry")}
        />
      ) : orders.length === 0 ? (
        <StateView
          icon="cube-outline"
          title={t("შეკვეთები ჯერ არ გაქვს", "No orders yet")}
          body={t("პირველი შეკვეთის შემდეგ სტატუსი აქ გამოჩნდება.", "Your first order will appear here.")}
          action={() => router.push("/(tabs)/shop")}
          actionLabel={t("მაღაზიის ნახვა", "Browse shop")}
        />
      ) : orders.map((order) => {
        const status = statusCopy[order.fulfillment_status] ?? statusCopy.order_received!;
        return (
          <Pressable
            key={order.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.78 }]}
          >
            <View style={styles.cardTop}>
              <View style={styles.statusIcon}><Ionicons name={status[2]} size={22} color={colors.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tracking}>#{order.tracking_code ?? order.id.slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.status}>{language === "ka" ? status[0] : status[1]}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </View>
            <View style={styles.cardBottom}>
              <Text style={styles.date}>{new Date(order.created_at).toLocaleDateString(language === "ka" ? "ka-GE" : "en-GB")}</Text>
              <Text style={styles.total}>{money(Math.round(Number(order.total) * 100))}</Text>
            </View>
            <View style={[styles.payment, order.payment_status === "paid" ? styles.paid : styles.pending]}>
              <Text style={styles.paymentText}>{order.payment_status === "paid" ? t("გადახდილია", "Paid") : t("გადახდა მოწმდება", "Payment pending")}</Text>
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: radii.large, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  tracking: { color: colors.accent, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  status: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 3 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { color: colors.muted, fontSize: 12 },
  total: { color: colors.text, fontSize: 18, fontWeight: "900" },
  payment: { alignSelf: "flex-start", borderRadius: radii.pill, paddingHorizontal: 11, paddingVertical: 6 },
  paid: { backgroundColor: "#E2F0E7" },
  pending: { backgroundColor: "#F7EBD8" },
  paymentText: { color: colors.text, fontSize: 11, fontWeight: "800" },
});
