import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { LoadingView, StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type Notification = {
  id: string;
  title_ka: string;
  title_en: string;
  body_ka: string;
  body_en: string;
  href: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const { session, loading } = useAuth();
  const { language, t } = useCopy();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<{ ok: true; data: Notification[] }>("/api/mobile/v1/notifications", { authenticated: true }),
    enabled: Boolean(session),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (input: { id?: string; all?: boolean }) => apiFetch("/api/mobile/v1/notifications", {
      method: "PATCH",
      authenticated: true,
      body: JSON.stringify(input),
    }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  if (loading) return <Screen><LoadingView /></Screen>;
  if (!session) return <Redirect href={{ pathname: "/auth/login", params: { next: "/notifications" } }} />;
  const notifications = query.data?.data ?? [];
  const unread = notifications.filter((item) => !item.read_at).length;
  return (
    <Screen
      title={t("შეტყობინებები", "Notifications")}
      subtitle={t(`წაუკითხავი: ${unread}`, `Unread: ${unread}`)}
      assistant={false}
      headerRight={unread ? <Button label={t("ყველას წაკითხვა", "Read all")} variant="secondary" onPress={() => markRead.mutate({ all: true })} style={{ minHeight: 44, paddingHorizontal: 13 }} /> : undefined}
    >
      {query.isLoading ? <LoadingView /> : query.isError ? <StateView title={t("შეტყობინებები ვერ ჩაიტვირთა", "Notifications could not load")} body={t("სცადე ხელახლა.", "Try again.")} action={query.refetch} actionLabel={t("თავიდან ცდა", "Retry")} /> : notifications.length === 0 ? (
        <StateView icon="notifications-outline" title={t("შეტყობინებები ჯერ არ გაქვს", "No notifications yet")} body={t("შეკვეთისა და Hooma+ სტატუსები აქ გამოჩნდება.", "Order and Hooma+ updates will appear here.")} />
      ) : notifications.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => {
            markRead.mutate({ id: item.id });
            const orderId = item.metadata?.order_id;
            if (typeof orderId === "string") router.push({ pathname: "/order/[id]", params: { id: orderId } });
            else if (item.href === "/account/hooma-plus") router.push("/hooma-plus");
            else router.push("/(tabs)/orders");
          }}
          style={[styles.card, !item.read_at && styles.unread]}
        >
          <View style={[styles.dot, item.read_at && styles.readDot]} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.title}>{language === "ka" ? item.title_ka : item.title_en}</Text>
            <Text style={styles.body}>{language === "ka" ? item.body_ka : item.body_en}</Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString(language === "ka" ? "ka-GE" : "en-GB")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 17, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  unread: { backgroundColor: "#FFF3E8", borderColor: "#EAD3BA" },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#E47B37", marginTop: 5 },
  readDot: { backgroundColor: colors.surfaceStrong },
  title: { color: colors.text, fontSize: 15, fontWeight: "900" },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  date: { color: colors.muted, fontSize: 10 },
});
