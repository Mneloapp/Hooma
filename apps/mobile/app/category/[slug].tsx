import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import type { ApiEnvelope, CatalogCategory } from "@/types";
import { Screen } from "@/components/screen";
import { LoadingView, StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

export default function CategoryScreen() {
  const router = useRouter();
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const { t } = useCopy();
  const query = useQuery({
    queryKey: ["categories"],
    queryFn: () =>
      apiFetch<ApiEnvelope<CatalogCategory[]>>("/api/mobile/v1/categories"),
    staleTime: 5 * 60_000,
  });
  const category = query.data?.data.find((item) => item.slug === slug);

  if (query.isLoading) return <Screen><LoadingView /></Screen>;
  if (query.isError || !category) {
    return (
      <Screen>
        <StateView
          icon="grid-outline"
          title={t("კატეგორია ვერ მოიძებნა", "Category not found")}
          body={t("დაბრუნდი მაღაზიაში და სცადე სხვა კატეგორია.", "Return to the shop and choose another category.")}
          action={() => router.replace("/(tabs)/shop")}
          actionLabel={t("მაღაზია", "Shop")}
        />
      </Screen>
    );
  }

  const openShop = (subcategory?: string) => router.push({
    pathname: "/(tabs)/shop",
    params: {
      category: category.slug,
      ...(subcategory ? { subcategory } : {}),
    },
  });

  return (
    <Screen
      title={t(category.nameKa, category.name)}
      subtitle={t("აირჩიე ქვეკატეგორია ან ნახე ყველა პროდუქტი.", "Choose a subcategory or browse all products.")}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => openShop()}
        style={[styles.row, styles.all]}
      >
        <Ionicons name="apps-outline" size={23} color={colors.accent} />
        <Text style={styles.title}>{t("ყველა პროდუქტი", "All products")}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>
      {category.subcategories.map((subcategory) => (
        <Pressable
          key={subcategory.slug}
          accessibilityRole="button"
          onPress={() => openShop(subcategory.slug)}
          style={styles.row}
        >
          <Ionicons name="cube-outline" size={22} color={colors.accent} />
          <Text style={styles.title}>
            {t(subcategory.nameKa, subcategory.name)}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingHorizontal: 17,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  all: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
});
