import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { Screen } from "@/components/screen";
import { LoadingView, StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type OrderDetail = {
  id: string;
  tracking_code: string | null;
  payment_status: string;
  fulfillment_status: string;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  promised_at: string | null;
  created_at: string;
  items: { id: string; product_name: string; quantity: number; material: string | null; color: string | null }[];
  events: { id: string; event_type: string; customer_label_ka: string; customer_label_en: string; created_at: string }[];
};

const stages = [
  ["order_received", "შეკვეთა მიღებულია", "Order received"],
  ["in_production", "წარმოება დაიწყო", "Production started"],
  ["quality_check", "ხარისხის შემოწმება", "Quality check"],
  ["ready_for_delivery", "მზადაა მიწოდებისთვის", "Ready for delivery"],
  ["out_for_delivery", "კურიერს გადაეცა", "Out for delivery"],
  ["delivered", "მიწოდებულია", "Delivered"],
] as const;

const stageIndex: Record<string, number> = {
  order_received: 0, confirmed: 0, production_queued: 1, in_production: 1,
  quality_check: 2, ready_for_delivery: 3, out_for_delivery: 4, delivered: 5,
};

export default function OrderDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { language, t, money } = useCopy();
  const query = useQuery({
    queryKey: ["order", id],
    queryFn: () => apiFetch<{ ok: true; data: OrderDetail }>(`/api/mobile/v1/orders/${encodeURIComponent(id)}`, { authenticated: true }),
    enabled: Boolean(id),
    refetchInterval: 30_000,
  });
  if (query.isLoading) return <Screen><LoadingView /></Screen>;
  if (query.isError || !query.data) return <Screen><StateView title={t("შეკვეთა ვერ ჩაიტვირთა", "Order could not load")} body={t("სცადე ხელახლა.", "Try again.")} action={query.refetch} actionLabel={t("თავიდან ცდა", "Retry")} /></Screen>;
  const order = query.data.data;
  const current = stageIndex[order.fulfillment_status] ?? 0;
  return (
    <Screen
      title={`#${order.tracking_code ?? order.id.slice(0, 8).toUpperCase()}`}
      subtitle={new Date(order.created_at).toLocaleString(language === "ka" ? "ka-GE" : "en-GB")}
    >
      <View style={styles.payment}>
        <Ionicons name={order.payment_status === "paid" ? "checkmark-circle" : "time-outline"} size={24} color={order.payment_status === "paid" ? colors.success : colors.warning} />
        <Text style={styles.paymentText}>{order.payment_status === "paid" ? t("გადახდა დადასტურებულია", "Payment confirmed") : t("გადახდა მოწმდება", "Payment pending")}</Text>
      </View>
      <View style={styles.timeline}>
        {stages.map(([key, ka, en], index) => {
          const complete = index <= current;
          const event = order.events.find((item) => item.event_type === key);
          return (
            <View key={key} style={styles.stage}>
              <View style={styles.rail}>
                <View style={[styles.dot, complete && styles.completeDot]}>{complete ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}</View>
                {index < stages.length - 1 ? <View style={[styles.line, index < current && styles.completeLine]} /> : null}
              </View>
              <View style={styles.stageCopy}>
                <Text style={[styles.stageTitle, !complete && styles.inactive]}>{language === "ka" ? ka : en}</Text>
                {event ? <Text style={styles.stageDate}>{new Date(event.created_at).toLocaleString(language === "ka" ? "ka-GE" : "en-GB")}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
      <Text style={styles.sectionTitle}>{t("პროდუქტები", "Products")}</Text>
      {order.items.map((item) => (
        <View key={item.id} style={styles.item}>
          <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.product_name}</Text><Text style={styles.itemMeta}>{item.material} · {item.color}</Text></View>
          <Text style={styles.quantity}>×{item.quantity}</Text>
        </View>
      ))}
      <View style={styles.summary}>
        <Summary label={t("პროდუქტები", "Products")} value={money(Math.round(Number(order.subtotal) * 100))} />
        <Summary label={t("მიწოდება", "Delivery")} value={Number(order.delivery_fee) === 0 ? t("უფასო", "Free") : money(Math.round(Number(order.delivery_fee) * 100))} />
        <Summary label={t("ჯამი", "Total")} value={money(Math.round(Number(order.total) * 100))} strong />
      </View>
    </Screen>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.summaryRow}><Text style={[styles.summaryLabel, strong && styles.strong]}>{label}</Text><Text style={[styles.summaryValue, strong && styles.strong]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  payment: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: radii.medium, backgroundColor: colors.surface },
  paymentText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" },
  timeline: { padding: 18, borderRadius: radii.large, backgroundColor: colors.surface },
  stage: { flexDirection: "row", minHeight: 70 },
  rail: { width: 34, alignItems: "center" },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.surfaceStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  completeDot: { backgroundColor: colors.accent, borderColor: colors.accent },
  line: { width: 2, flex: 1, backgroundColor: colors.surfaceStrong },
  completeLine: { backgroundColor: colors.accent },
  stageCopy: { flex: 1, paddingLeft: 8, paddingTop: 3 },
  stageTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  inactive: { color: colors.muted },
  stageDate: { color: colors.muted, fontSize: 11, marginTop: 5 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radii.medium, backgroundColor: colors.surface },
  itemName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  itemMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  quantity: { color: colors.text, fontWeight: "900" },
  summary: { padding: 19, borderRadius: radii.large, backgroundColor: colors.accentSoft, gap: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryLabel: { color: colors.muted, fontSize: 14 },
  summaryValue: { color: colors.text, fontWeight: "800" },
  strong: { color: colors.text, fontSize: 19, fontWeight: "900" },
});
