import { useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { absoluteMediaUrl, apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import type { ApiEnvelope, Product } from "@/types";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { LoadingView, StateView } from "@/components/state-view";
import { useCartStore } from "@/stores/cart";
import { colors, radii } from "@/theme";

export default function ProductScreen() {
  const router = useRouter();
  const { slug = "" } = useLocalSearchParams<{ slug: string }>();
  const { width } = useWindowDimensions();
  const { language, t, money } = useCopy();
  const add = useCartStore((state) => state.add);
  const query = useQuery({
    queryKey: ["product", slug],
    queryFn: () => apiFetch<ApiEnvelope<Product>>(`/api/mobile/v1/catalog/${encodeURIComponent(slug)}`),
    enabled: Boolean(slug),
  });
  const product = query.data?.data;
  const [variantId, setVariantId] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const selectedVariant = useMemo(() => {
    if (!product) return undefined;
    return product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  }, [product, variantId]);
  const selectedMaterial = selectedVariant?.availableMaterials.includes(material)
    ? material
    : selectedVariant?.availableMaterials[0] ?? "";
  const selectedColor = selectedVariant?.availableColors.includes(color)
    ? color
    : selectedVariant?.availableColors[0] ?? "";
  const gallery = product
    ? Array.from(new Set([product.heroImage, ...product.galleryImages]))
    : [];

  if (query.isLoading) return <Screen assistant={false}><LoadingView /></Screen>;
  if (query.isError || !product || !selectedVariant) {
    return (
      <Screen assistant={false}>
        <StateView
          title={t("პროდუქტი ვერ ჩაიტვირთა", "Product could not load")}
          body={t("სცადე ხელახლა ან დაბრუნდი კატალოგში.", "Try again or return to the catalog.")}
          action={query.refetch}
          actionLabel={t("თავიდან ცდა", "Retry")}
        />
      </Screen>
    );
  }
  const priceMinor = Math.round(Number(selectedVariant.price ?? product.price) * 100);
  return (
    <Screen title={language === "ka" ? product.nameKa : product.hoomaName}>
      <FlatList
        data={gallery}
        horizontal
        pagingEnabled
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Image
            accessibilityLabel={language === "ka" ? product.nameKa : product.hoomaName}
            cachePolicy="memory-disk"
            contentFit="cover"
            source={absoluteMediaUrl(item)}
            style={[styles.galleryImage, { width: width - 40 }]}
            transition={200}
          />
        )}
      />
      <View style={styles.priceRow}>
        <Text style={styles.price}>{money(priceMinor)}</Text>
        <View style={styles.deliveryBadge}><Ionicons name="time-outline" size={16} color={colors.accent} /><Text style={styles.deliveryText}>{t("3 სამუშაო დღე", "3 business days")}</Text></View>
      </View>
      <Text style={styles.description}>{language === "ka" ? product.shortDescriptionKa : product.shortDescription}</Text>

      <OptionGroup
        title={t("ზომა / ვარიანტი", "Size / variant")}
        options={product.variants.map((item) => ({ key: item.id, label: item.sizeLabel }))}
        selected={selectedVariant.id}
        onSelect={setVariantId}
      />
      <OptionGroup
        title={t("მასალა", "Material")}
        options={selectedVariant.availableMaterials.map((item) => ({ key: item, label: item }))}
        selected={selectedMaterial}
        onSelect={setMaterial}
      />
      <OptionGroup
        title={t("ფერი", "Colour")}
        options={selectedVariant.availableColors.map((item) => ({ key: item, label: item }))}
        selected={selectedColor}
        onSelect={setColor}
      />

      <View style={styles.infoGrid}>
        <Info label={t("ზომები", "Dimensions")} value={selectedVariant.productDimensionsCm} />
        <Info label={t("მასალა", "Material")} value={selectedMaterial} />
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{t("აღწერა", "Description")}</Text>
        <Text style={styles.panelBody}>{product.longDescription || product.shortDescription}</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{t("მოვლა და უსაფრთხოება", "Care and safety")}</Text>
        <Text style={styles.panelBody}>{product.safetyNotes ?? t("გამოიყენე მხოლოდ დანიშნულებისამებრ. მოარიდე მაღალ ტემპერატურას და ღია ცეცხლს.", "Use only as intended. Keep away from high heat and open flame.")}</Text>
      </View>
      <Button
        label={t(`${money(priceMinor)} — კალათაში დამატება`, `Add to cart — ${money(priceMinor)}`)}
        onPress={() => {
          add({
            productId: product.id,
            variantId: selectedVariant.id,
            slug: product.slug,
            nameKa: product.nameKa,
            nameEn: product.hoomaName,
            image: selectedVariant.image || product.heroImage,
            sizeLabel: selectedVariant.sizeLabel,
            material: selectedMaterial,
            color: selectedColor,
            quantity: 1,
            unitPriceMinor: priceMinor,
          });
          router.push("/(tabs)/cart");
        }}
      />
    </Screen>
  );
}

function OptionGroup({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.optionTitle}>{title}</Text>
      <View style={styles.options}>
        {options.map((option) => (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.key === selected }}
            onPress={() => onSelect(option.key)}
            style={[styles.option, option.key === selected && styles.selectedOption]}
          >
            <Text style={[styles.optionText, option.key === selected && styles.selectedOptionText]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  galleryImage: { aspectRatio: 1, borderRadius: radii.large, backgroundColor: colors.surfaceStrong },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  price: { color: colors.text, fontSize: 29, fontWeight: "900" },
  deliveryBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: radii.pill, backgroundColor: colors.accentSoft },
  deliveryText: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  description: { color: colors.muted, fontSize: 16, lineHeight: 25 },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  selectedOption: { backgroundColor: colors.text, borderColor: colors.text },
  optionText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  selectedOptionText: { color: colors.white },
  infoGrid: { flexDirection: "row", gap: 10 },
  info: { flex: 1, padding: 16, borderRadius: radii.medium, backgroundColor: colors.surfaceStrong, gap: 6 },
  infoLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: "800" },
  panel: { padding: 18, borderRadius: radii.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, gap: 9 },
  panelTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  panelBody: { color: colors.muted, fontSize: 14, lineHeight: 23 },
});
