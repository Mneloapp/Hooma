import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { absoluteMediaUrl, apiFetch } from "@/lib/api";
import { quoteDeliveryPreview, type DeliverySummary } from "@/lib/delivery";
import { useCopy } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { useCartStore } from "@/stores/cart";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type HoomaPlusData = { summary: DeliverySummary };

export default function CartScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { language, t, money } = useCopy();
  const lines = useCartStore((state) => state.lines);
  const remove = useCartStore((state) => state.remove);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const summaryQuery = useQuery({
    queryKey: ["hooma-plus"],
    queryFn: () => apiFetch<{ ok: true; data: HoomaPlusData }>("/api/mobile/v1/hooma-plus", { authenticated: true }),
    enabled: Boolean(session),
  });
  const subtotalMinor = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const quote = quoteDeliveryPreview({
    subtotalMinor,
    unitCount,
    summary: summaryQuery.data?.data.summary ?? null,
  });
  const totalMinor = subtotalMinor + quote.deliveryMinor;

  return (
    <Screen
      title={t("კალათა", "Cart")}
      subtitle={t(`${unitCount} პროდუქტის ერთეული`, `${unitCount} product units`)}
    >
      {lines.length === 0 ? (
        <StateView
          icon="bag-outline"
          title={t("კალათა ცარიელია", "Your cart is empty")}
          body={t("კატალოგში აირჩიე სასურველი ნივთი, ფერი და მასალა.", "Choose a product, colour and material in the catalog.")}
          action={() => router.push("/(tabs)/shop")}
          actionLabel={t("მაღაზიაში გადასვლა", "Go to shop")}
        />
      ) : (
        <>
          {lines.map((line) => (
            <View key={line.key} style={styles.line}>
              <Image source={absoluteMediaUrl(line.image)} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
              <View style={styles.lineCopy}>
                <Text numberOfLines={2} style={styles.name}>{language === "ka" ? line.nameKa : line.nameEn}</Text>
                <Text numberOfLines={1} style={styles.meta}>{line.sizeLabel} · {line.material} · {line.color}</Text>
                <Text style={styles.linePrice}>{money(line.unitPriceMinor * line.quantity)}</Text>
                <View style={styles.actions}>
                  <Pressable accessibilityLabel={t("რაოდენობის შემცირება", "Decrease quantity")} onPress={() => line.quantity === 1 ? remove(line.key) : setQuantity(line.key, line.quantity - 1)} style={styles.stepper}><Ionicons name="remove" size={18} color={colors.text} /></Pressable>
                  <Text style={styles.quantity}>{line.quantity}</Text>
                  <Pressable accessibilityLabel={t("რაოდენობის გაზრდა", "Increase quantity")} onPress={() => setQuantity(line.key, line.quantity + 1)} style={styles.stepper}><Ionicons name="add" size={18} color={colors.text} /></Pressable>
                  <Pressable accessibilityLabel={t("პროდუქტის წაშლა", "Remove product")} onPress={() => remove(line.key)} hitSlop={10} style={styles.remove}><Ionicons name="trash-outline" size={19} color={colors.danger} /></Pressable>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.summary}>
            <SummaryRow label={t("პროდუქტები", "Products")} value={money(subtotalMinor)} />
            <SummaryRow label={t("მიწოდება", "Delivery")} value={quote.deliveryMinor === 0 ? t("უფასო", "Free") : money(quote.deliveryMinor)} />
            <View style={styles.divider} />
            <SummaryRow label={t("სავარაუდო ჯამი", "Estimated total")} value={money(totalMinor)} strong />
            <Text style={styles.serverNotice}>{t("საბოლოო თანხას checkout-ზე Hooma-ს სერვერი ითვლის.", "Hooma's server calculates the final amount at checkout.")}</Text>
          </View>
          <View style={styles.delivery}>
            <Ionicons name={quote.deliveryMinor === 0 ? "checkmark-circle" : "car-outline"} size={22} color={colors.accent} />
            <Text style={styles.deliveryText}>
              {quote.benefitCode === "hooma_plus"
                ? t("Hooma+ — უფასო მიწოდება", "Hooma+ — free delivery")
                : quote.benefitCode === "welcome_units"
                  ? t("პირველი 10 ერთეულის ბენეფიტი", "First 10 units benefit")
                  : quote.benefitCode === "subtotal_threshold"
                    ? t("100₾-დან უფასო მიწოდება", "Free delivery from ₾100")
                    : t("სტანდარტული მიწოდება — 5₾", "Standard delivery — ₾5")}
            </Text>
          </View>
          <Button
            label={t("შეკვეთის გაფორმება", "Continue to checkout")}
            onPress={() => session
              ? router.push("/checkout")
              : router.push({ pathname: "/auth/login", params: { next: "/checkout" } })}
          />
        </>
      )}
    </Screen>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.summaryRow}><Text style={[styles.summaryLabel, strong && styles.strong]}>{label}</Text><Text style={[styles.summaryValue, strong && styles.strong]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", gap: 14, padding: 14, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  image: { width: 100, height: 112, borderRadius: radii.small, backgroundColor: colors.surfaceStrong },
  lineCopy: { flex: 1, gap: 6 },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 11 },
  linePrice: { color: colors.text, fontSize: 15, fontWeight: "800" },
  actions: { marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 9 },
  stepper: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceStrong, alignItems: "center", justifyContent: "center" },
  quantity: { minWidth: 20, color: colors.text, textAlign: "center", fontWeight: "800" },
  remove: { marginLeft: "auto", width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  summary: { gap: 13, padding: 20, borderRadius: radii.large, backgroundColor: colors.surface },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryLabel: { color: colors.muted, fontSize: 14 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: "700" },
  strong: { color: colors.text, fontSize: 19, fontWeight: "900" },
  divider: { height: 1, backgroundColor: colors.line },
  serverNotice: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  delivery: { flexDirection: "row", alignItems: "center", gap: 11, padding: 16, borderRadius: radii.medium, backgroundColor: colors.accentSoft },
  deliveryText: { flex: 1, color: colors.accent, fontSize: 14, fontWeight: "800" },
});
