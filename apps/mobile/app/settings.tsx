import { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { LoadingView } from "@/components/state-view";
import { colors } from "@/theme";

type SessionData = {
  user: { email: string | null };
  profile: { full_name: string | null; phone: string | null };
};

export default function SettingsScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const { session, loading, signOut } = useAuth();
  const { t } = useCopy();
  const [draft, setDraft] = useState<{ fullName?: string; phone?: string }>({});
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["session-profile"],
    queryFn: () => apiFetch<{ ok: true; data: SessionData }>("/api/mobile/v1/session", { authenticated: true }),
    enabled: Boolean(session),
  });
  const fullName = draft.fullName ?? query.data?.data.profile.full_name ?? "";
  const phone = draft.phone ?? query.data?.data.profile.phone ?? "";
  const save = useMutation({
    mutationFn: () => apiFetch("/api/mobile/v1/profile", {
      method: "PATCH",
      authenticated: true,
      body: JSON.stringify({ fullName, phone }),
    }),
    onSuccess: async () => {
      setMessage(t("პროფილი შენახულია.", "Profile saved."));
      await client.invalidateQueries({ queryKey: ["session-profile"] });
    },
    onError: () => setMessage(t("პროფილის შენახვა ვერ მოხერხდა.", "Profile could not be saved.")),
  });
  const deletion = useMutation({
    mutationFn: () => apiFetch("/api/mobile/v1/profile", {
      method: "DELETE",
      authenticated: true,
      body: JSON.stringify({ confirmation: "DELETE" }),
    }),
    onSuccess: async () => {
      await signOut();
      router.replace("/(tabs)");
    },
  });
  if (loading) return <Screen><LoadingView /></Screen>;
  if (!session) return <Redirect href="/auth/login" />;
  if (query.isLoading) return <Screen><LoadingView /></Screen>;
  return (
    <Screen title={t("პროფილი და პარამეტრები", "Profile and settings")} assistant={false}>
      <FormField label={t("სახელი და გვარი", "Full name")} value={fullName} onChangeText={(value) => setDraft((state) => ({ ...state, fullName: value }))} />
      <FormField label={t("ტელეფონი", "Phone")} value={phone} onChangeText={(value) => setDraft((state) => ({ ...state, phone: value }))} keyboardType="phone-pad" />
      <FormField label={t("ელფოსტა", "Email")} value={query.data?.data.user.email ?? ""} editable={false} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <Button label={t("ცვლილებების შენახვა", "Save changes")} onPress={() => save.mutate()} loading={save.isPending} disabled={!fullName} />
      <Text style={styles.section}>{t("ანგარიშის წაშლა", "Delete account")}</Text>
      <Text style={styles.body}>{t("მოთხოვნის შემდეგ push token-ები გამოირთვება და Hooma-ს ოპერატორი დაიწყებს მონაცემთა წაშლის პროცესს; ფინანსური/შეკვეთის ჩანაწერები კანონით საჭირო ვადით შეიძლება შენარჩუნდეს.", "After your request, push tokens are disabled and Hooma starts deletion. Financial and order records may be retained where legally required.")}</Text>
      {deletion.isError ? <Text style={styles.error}>{t("წაშლის მოთხოვნა ვერ გაიგზავნა.", "Deletion request could not be sent.")}</Text> : null}
      <Button
        label={t("ანგარიშის წაშლის მოთხოვნა", "Request account deletion")}
        variant="danger"
        loading={deletion.isPending}
        onPress={() => Alert.alert(
          t("ნამდვილად გსურს ანგარიშის წაშლა?", "Delete your account?"),
          t("ეს მოქმედება დაიწყებს ანგარიშის წაშლის პროცესს.", "This starts the account deletion process."),
          [
            { text: t("გაუქმება", "Cancel"), style: "cancel" },
            { text: t("წაშლა", "Delete"), style: "destructive", onPress: () => deletion.mutate() },
          ],
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: { color: colors.accent, fontSize: 13 },
  section: { color: colors.text, fontSize: 19, fontWeight: "900", marginTop: 16 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  error: { color: colors.danger, fontSize: 13 },
});
