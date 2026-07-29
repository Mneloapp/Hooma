import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import type { ApiEnvelope, CatalogCard, CatalogCategory } from "@/types";
import { Screen } from "@/components/screen";
import { ProductCard } from "@/components/product-card";
import { LoadingView, StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type HomeData = {
  popularProducts: CatalogCard[];
  categoryProducts: Record<string, CatalogCard[]>;
};

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useCopy();
  const query = useQuery({
    queryKey: ["home"],
    queryFn: () => apiFetch<ApiEnvelope<HomeData>>("/api/mobile/v1/home"),
  });
  const categoryQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiEnvelope<CatalogCategory[]>>("/api/mobile/v1/categories"),
    staleTime: 5 * 60_000,
  });
  const popular = query.data?.data.popularProducts ?? [];
  const categories = categoryQuery.data?.data ?? [];
  return (
    <Screen
      title="hooma"
      subtitle={t("შენთვის შექმნილი ნივთები, მშვიდი ყოველდღიურობისთვის.", "Thoughtful objects made for calmer everyday living.")}
    >
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{t("მოთხოვნით დამზადებული", "MADE ON DEMAND")}</Text>
          <Text style={styles.heroTitle}>{t("სახლი იწყება ნივთებით, რომლებსაც ირჩევ.", "A home begins with the objects you choose.")}</Text>
          <Pressable onPress={() => router.push("/(tabs)/shop")} style={styles.heroButton}>
            <Text style={styles.heroButtonText}>{t("კატალოგის ნახვა", "Explore the catalog")}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </Pressable>
        </View>
        <View style={styles.heroSymbol}><Ionicons name="sparkles" size={40} color={colors.accent} /></View>
      </View>

      <View style={styles.promise}>
        <Ionicons name="time-outline" size={22} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.promiseTitle}>{t("3 სამუშაო დღე შეკვეთიდან მიწოდებამდე", "3 business days from order to delivery")}</Text>
          <Text style={styles.promiseBody}>{t("სტანდარტული კატალოგის შეკვეთებისთვის", "For standard catalog orders")}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t("კატეგორიები", "Categories")}</Text>
      <View style={styles.categoryGrid}>
        {categories.map((category) => (
          <Pressable
            key={category.slug}
            onPress={() => router.push({
              pathname: "/category/[slug]",
              params: { slug: category.slug },
            })}
            style={styles.category}
          >
            <Ionicons name="grid-outline" size={24} color={colors.accent} />
            <Text style={styles.categoryText}>
              {t(category.nameKa, category.name)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("პოპულარული", "Popular")}</Text>
        <Pressable onPress={() => router.push("/(tabs)/shop")}><Text style={styles.link}>{t("ყველა", "See all")}</Text></Pressable>
      </View>
      {query.isLoading ? <LoadingView label={t("პროდუქტები იტვირთება...", "Loading products...")} /> : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title={t("კავშირი ვერ დამყარდა", "Could not connect")}
          body={t("შეამოწმე ინტერნეტი და სცადე ხელახლა.", "Check your connection and try again.")}
          action={query.refetch}
          actionLabel={t("თავიდან ცდა", "Retry")}
        />
      ) : (
        <FlatList
          data={popular}
          horizontal
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <View style={styles.product}><ProductCard product={item} /></View>}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 14 }}
          initialNumToRender={4}
          windowSize={5}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 310,
    borderRadius: radii.large,
    backgroundColor: colors.text,
    padding: 24,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  heroCopy: { gap: 14, maxWidth: 310 },
  eyebrow: { color: "#BBC5AE", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  heroTitle: { color: colors.white, fontSize: 32, lineHeight: 39, fontWeight: "900", letterSpacing: -0.7 },
  heroButton: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start" },
  heroButtonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  heroSymbol: { position: "absolute", right: 24, bottom: 24, width: 74, height: 74, borderRadius: 37, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  promise: { flexDirection: "row", gap: 13, alignItems: "center", padding: 17, borderRadius: radii.medium, backgroundColor: colors.accentSoft },
  promiseTitle: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  promiseBody: { color: colors.muted, fontSize: 12, marginTop: 3 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  link: { color: colors.accent, fontWeight: "800" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  category: { width: "48%", minHeight: 92, padding: 16, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 10 },
  categoryText: { color: colors.text, fontWeight: "800" },
  product: { width: 232 },
});
