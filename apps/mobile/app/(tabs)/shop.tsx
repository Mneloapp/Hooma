import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import type { ApiEnvelope, CatalogCard, CatalogCategory } from "@/types";
import { Screen } from "@/components/screen";
import { ProductCard } from "@/components/product-card";
import { LoadingView, StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type CatalogPage = {
  products: CatalogCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export default function ShopScreen() {
  const params = useLocalSearchParams<{ category?: string; subcategory?: string }>();
  const { t } = useCopy();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState(params.category ?? "");
  const [subcategory, setSubcategory] = useState(params.subcategory ?? "");
  const [sort, setSort] = useState("featured");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCategory(params.category ?? "");
      setSubcategory(params.subcategory ?? "");
    }, 0);
    return () => clearTimeout(timeout);
  }, [params.category, params.subcategory]);
  const query = useInfiniteQuery({
    queryKey: ["catalog", debouncedSearch, category, subcategory, sort],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const queryString = new URLSearchParams({
        page: String(pageParam),
        pageSize: "20",
        sort,
      });
      if (debouncedSearch) queryString.set("q", debouncedSearch);
      if (category) queryString.set("category", category);
      if (subcategory) queryString.set("subcategory", subcategory);
      return apiFetch<ApiEnvelope<CatalogPage>>(`/api/mobile/v1/catalog?${queryString}`, { signal });
    },
    getNextPageParam: (lastPage) => lastPage.data.hasMore ? lastPage.data.page + 1 : undefined,
  });
  const categoryQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiEnvelope<CatalogCategory[]>>("/api/mobile/v1/categories"),
    staleTime: 5 * 60_000,
  });
  const products = useMemo(
    () => query.data?.pages.flatMap((page) => page.data.products) ?? [],
    [query.data],
  );
  const totalCount = query.data?.pages[0]?.data.totalCount ?? 0;
  const categories = categoryQuery.data?.data ?? [];
  const selectedCategory = categories.find((item) => item.slug === category);

  return (
    <Screen
      title={t("მაღაზია", "Shop")}
      subtitle={t(`${totalCount} დამტკიცებული პროდუქტი`, `${totalCount} approved products`)}
      scroll={false}
      contentContainerStyle={styles.screen}
    >
      <View style={styles.search}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          accessibilityLabel={t("პროდუქტის ძებნა", "Search products")}
          value={search}
          onChangeText={setSearch}
          placeholder={t("მოძებნე პროდუქტი", "Search products")}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {search ? (
          <Pressable accessibilityLabel={t("ძებნის გასუფთავება", "Clear search")} onPress={() => setSearch("")} hitSlop={12}>
            <Ionicons name="close-circle" size={21} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            onPress={() => {
              setCategory("");
              setSubcategory("");
            }}
            style={[styles.chip, !category && styles.activeChip]}
          >
            <Text style={[styles.chipText, !category && styles.activeChipText]}>
              {t("ყველა", "All")}
            </Text>
          </Pressable>
          {categories.map((item) => (
            <Pressable
              key={item.slug}
              onPress={() => {
                setCategory(item.slug);
                setSubcategory("");
              }}
              style={[styles.chip, category === item.slug && styles.activeChip]}
            >
              <Text style={[
                styles.chipText,
                category === item.slug && styles.activeChipText,
              ]}>
                {t(item.nameKa, item.name)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("დალაგების შეცვლა", "Change sorting")}
          onPress={() => setSort(sort === "featured" ? "price_asc" : sort === "price_asc" ? "price_desc" : "featured")}
          style={styles.sort}
        >
          <Ionicons name="swap-vertical" size={18} color={colors.text} />
        </Pressable>
      </View>
      {selectedCategory?.subcategories.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Pressable
            onPress={() => setSubcategory("")}
            style={[styles.subcategory, !subcategory && styles.activeSubcategory]}
          >
            <Text style={styles.subcategoryText}>{t("ყველა ქვეკატეგორია", "All subcategories")}</Text>
          </Pressable>
          {selectedCategory.subcategories.map((item) => (
            <Pressable
              key={item.slug}
              onPress={() => setSubcategory(item.slug)}
              style={[
                styles.subcategory,
                subcategory === item.slug && styles.activeSubcategory,
              ]}
            >
              <Text style={styles.subcategoryText}>{t(item.nameKa, item.name)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {query.isLoading ? <LoadingView label={t("კატალოგი იტვირთება...", "Loading catalog...")} /> : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title={t("კატალოგი ვერ ჩაიტვირთა", "Catalog could not load")}
          body={t("შეამოწმე ინტერნეტი და სცადე ხელახლა.", "Check your connection and try again.")}
          action={query.refetch}
          actionLabel={t("თავიდან ცდა", "Retry")}
        />
      ) : products.length === 0 ? (
        <StateView
          icon="search-outline"
          title={t("პროდუქტი ვერ მოიძებნა", "No products found")}
          body={t("სცადე სხვა სიტყვა ან გაასუფთავე ფილტრი.", "Try another term or clear the filter.")}
          action={() => {
            setSearch("");
            setCategory("");
            setSubcategory("");
          }}
          actionLabel={t("ფილტრების გასუფთავება", "Clear filters")}
        />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <View style={styles.cell}><ProductCard product={item} /></View>}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={query.isFetchingNextPage ? <LoadingView label={t("მეტი იტვირთება...", "Loading more...")} /> : null}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 0 },
  search: { minHeight: 52, borderRadius: radii.pill, paddingHorizontal: 17, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  filtersRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  chips: { gap: 8 },
  chip: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  activeChip: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  activeChipText: { color: colors.white },
  subcategory: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.surfaceStrong },
  activeSubcategory: { borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  subcategoryText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  sort: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  list: { gap: 12, paddingBottom: 120 },
  row: { gap: 12 },
  cell: { flex: 1, marginBottom: 12 },
});
