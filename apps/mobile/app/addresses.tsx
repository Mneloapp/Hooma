import { useState } from "react";
import { Redirect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import type { Address, ApiEnvelope } from "@/types";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { LoadingView } from "@/components/state-view";
import { colors } from "@/theme";

export default function AddressesScreen() {
  const { session, loading } = useAuth();
  const { t } = useCopy();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Partial<Address>>({});
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["addresses"],
    queryFn: () => apiFetch<ApiEnvelope<Address[]>>("/api/mobile/v1/addresses", { authenticated: true }),
    enabled: Boolean(session),
  });
  const address = { ...(query.data?.data[0] ?? {}), ...draft };
  const mutation = useMutation({
    mutationFn: () => apiFetch("/api/mobile/v1/addresses", {
      method: "POST",
      authenticated: true,
      body: JSON.stringify({
        fullName: address.full_name,
        phone: address.phone,
        city: address.city,
        addressLine1: address.address_line_1,
        addressLine2: address.address_line_2,
        postalCode: address.postal_code,
        latitude: address.latitude,
        longitude: address.longitude,
      }),
    }),
    onSuccess: async () => {
      setMessage(t("მისამართი შენახულია.", "Address saved."));
      await client.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: () => setMessage(t("მისამართის შენახვა ვერ მოხერხდა.", "Address could not be saved.")),
  });
  if (loading) return <Screen><LoadingView /></Screen>;
  if (!session) return <Redirect href={{ pathname: "/auth/login", params: { next: "/addresses" } }} />;
  if (query.isLoading) return <Screen><LoadingView /></Screen>;
  return (
    <Screen title={t("მისამართები", "Addresses")} assistant={false}>
      <Text style={{ color: colors.muted, lineHeight: 22 }}>{t("ნაგულისხმევი მისამართი checkout-ზე ავტომატურად შეივსება.", "Your default address will be filled in automatically at checkout.")}</Text>
      <FormField label={t("მიმღების სახელი", "Recipient name")} value={address.full_name ?? ""} onChangeText={(full_name) => setDraft((state) => ({ ...state, full_name }))} />
      <FormField label={t("ტელეფონი", "Phone")} value={address.phone ?? ""} onChangeText={(phone) => setDraft((state) => ({ ...state, phone }))} keyboardType="phone-pad" />
      <FormField label={t("ქალაქი", "City")} value={address.city ?? ""} onChangeText={(city) => setDraft((state) => ({ ...state, city }))} />
      <FormField label={t("მისამართი", "Address")} value={address.address_line_1 ?? ""} onChangeText={(address_line_1) => setDraft((state) => ({ ...state, address_line_1 }))} />
      <FormField label={t("სადარბაზო, სართული, ბინა", "Entrance, floor, apartment")} value={address.address_line_2 ?? ""} onChangeText={(address_line_2) => setDraft((state) => ({ ...state, address_line_2 }))} />
      <FormField label={t("საფოსტო ინდექსი", "Postal code")} value={address.postal_code ?? ""} onChangeText={(postal_code) => setDraft((state) => ({ ...state, postal_code }))} />
      {message ? <Text style={{ color: colors.accent }}>{message}</Text> : null}
      <Button
        label={t("მისამართის შენახვა", "Save address")}
        loading={mutation.isPending}
        disabled={!address.full_name || !address.phone || !address.city || !address.address_line_1}
        onPress={() => mutation.mutate()}
      />
    </Screen>
  );
}
