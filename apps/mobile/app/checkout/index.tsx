import { useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { apiFetch, ApiError } from "@/lib/api";
import { quoteDeliveryPreview, type DeliverySummary } from "@/lib/delivery";
import { useCopy } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { useCartStore } from "@/stores/cart";
import type { Address, ApiEnvelope } from "@/types";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { LoadingView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type CheckoutResult = {
  ok: boolean;
  code: string;
  message: string;
  redirectUrl?: string;
  orderId?: string;
  resetCheckout?: boolean;
};

export default function CheckoutScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { language, t, money } = useCopy();
  const lines = useCartStore((state) => state.lines);
  const [draft, setDraft] = useState<Partial<Address>>({});
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => apiFetch<ApiEnvelope<Address[]>>("/api/mobile/v1/addresses", { authenticated: true }),
    enabled: Boolean(session),
  });
  const benefit = useQuery({
    queryKey: ["hooma-plus"],
    queryFn: () => apiFetch<{ ok: true; data: { summary: DeliverySummary } }>("/api/mobile/v1/hooma-plus", { authenticated: true }),
    enabled: Boolean(session),
  });
  const address = { ...(addresses.data?.data[0] ?? {}), ...draft };
  const subtotalMinor = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const quote = quoteDeliveryPreview({ subtotalMinor, unitCount, summary: benefit.data?.data.summary });
  const expectedTotalMinor = subtotalMinor + quote.deliveryMinor;
  const checkoutKey = useRef(Crypto.randomUUID()).current;

  const mutation = useMutation({
    mutationFn: async () => apiFetch<CheckoutResult>("/api/mobile/v1/checkout", {
      method: "POST",
      authenticated: true,
      timeoutMs: 30_000,
      body: JSON.stringify({
        checkout_key: checkoutKey,
        language,
        expected_total_minor: expectedTotalMinor,
        guest_email: session?.user.email,
        guest_phone: address.phone,
        full_name: address.full_name,
        city: address.city,
        address_line_1: address.address_line_1,
        address_line_2: address.address_line_2,
        postal_code: address.postal_code,
        latitude: address.latitude,
        longitude: address.longitude,
        items: lines.map((line) => ({
          product_id: line.productId,
          variant_id: line.variantId,
          material: line.material,
          color: line.color,
          quantity: line.quantity,
        })),
      }),
    }),
    onSuccess: async (result) => {
      if (!result.redirectUrl || !result.orderId) return;
      const browserResult = await WebBrowser.openAuthSessionAsync(
        result.redirectUrl,
        "https://hooma.ge/mobile/payment/result",
        { preferUniversalLinks: true },
      );
      router.replace({
        pathname: "/mobile/payment/result",
        params: { order: result.orderId, return: browserResult.type },
      });
    },
  });

  if (authLoading) return <Screen><LoadingView /></Screen>;
  if (!session) return <Redirect href={{ pathname: "/auth/login", params: { next: "/checkout" } }} />;
  if (!lines.length) return <Redirect href="/(tabs)/cart" />;
  if (addresses.isLoading || benefit.isLoading) return <Screen title={t("Checkout", "Checkout")}><LoadingView /></Screen>;
  const errorCode = mutation.error instanceof ApiError ? mutation.error.code : null;
  return (
    <Screen
      title={t("შეკვეთის გაფორმება", "Checkout")}
      subtitle={t("ბარათის მონაცემები მხოლოდ BOG-ის დაცულ გვერდზე შეგყავს.", "Card details are entered only on BOG's secure page.")}
      assistant={false}
    >
      <View style={styles.secure}>
        <Text style={styles.secureTitle}>BOG Hosted Checkout</Text>
        <Text style={styles.secureBody}>{t("აპი იღებს მხოლოდ server-generated redirect URL-ს. დაბრუნება თავისთავად გადახდის დასტური არ არის.", "The app receives only a server-generated redirect URL. Returning is not proof of payment.")}</Text>
      </View>
      <Text style={styles.sectionTitle}>{t("მიწოდების მისამართი", "Delivery address")}</Text>
      <FormField label={t("სახელი და გვარი", "Full name")} value={address.full_name ?? ""} onChangeText={(full_name) => setDraft((state) => ({ ...state, full_name }))} />
      <FormField label={t("ტელეფონი", "Phone")} value={address.phone ?? ""} onChangeText={(phone) => setDraft((state) => ({ ...state, phone }))} keyboardType="phone-pad" />
      <FormField label={t("ქალაქი", "City")} value={address.city ?? ""} onChangeText={(city) => setDraft((state) => ({ ...state, city }))} />
      <FormField label={t("მისამართი", "Address")} value={address.address_line_1 ?? ""} onChangeText={(address_line_1) => setDraft((state) => ({ ...state, address_line_1 }))} />
      <FormField label={t("სადარბაზო, სართული, ბინა", "Entrance, floor, apartment")} value={address.address_line_2 ?? ""} onChangeText={(address_line_2) => setDraft((state) => ({ ...state, address_line_2 }))} />
      <View style={styles.summary}>
        <Summary label={t("პროდუქტები", "Products")} value={money(subtotalMinor)} />
        <Summary label={t("მიწოდება", "Delivery")} value={quote.deliveryMinor === 0 ? t("უფასო", "Free") : money(quote.deliveryMinor)} />
        <Summary label={t("ჯამი", "Total")} value={money(expectedTotalMinor)} strong />
      </View>
      {mutation.isError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {errorCode === "cart_changed"
            ? t("ფასი შეიცვალა. დაბრუნდი კალათაში და გადაამოწმე.", "The price changed. Return to the cart and review it.")
            : t("გადახდის სესია ვერ მომზადდა. თანხა არ ჩამოგეჭრება.", "The payment session could not be prepared. You will not be charged.")}
        </Text>
      ) : null}
      <Button
        label={t(`${money(expectedTotalMinor)} — უსაფრთხო გადახდა`, `Pay securely — ${money(expectedTotalMinor)}`)}
        loading={mutation.isPending}
        disabled={!address.full_name || !address.phone || !address.city || !address.address_line_1}
        onPress={() => mutation.mutate()}
      />
    </Screen>
  );
}

function Summary({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.summaryRow}><Text style={[styles.summaryText, strong && styles.strong]}>{label}</Text><Text style={[styles.summaryValue, strong && styles.strong]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  secure: { padding: 17, borderRadius: radii.medium, backgroundColor: colors.accentSoft, gap: 7 },
  secureTitle: { color: colors.accent, fontWeight: "900", fontSize: 15 },
  secureBody: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  summary: { padding: 19, borderRadius: radii.large, backgroundColor: colors.surface, gap: 13 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryText: { color: colors.muted, fontSize: 14 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
  strong: { color: colors.text, fontSize: 20, fontWeight: "900" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
