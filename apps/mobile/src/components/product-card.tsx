import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogCard } from "@/types";
import { colors, radii, shadows } from "@/theme";
import { useCopy } from "@/lib/i18n";
import { absoluteMediaUrl } from "@/lib/api";

export function ProductCard({ product }: { product: CatalogCard }) {
  const router = useRouter();
  const { language, money } = useCopy();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={language === "ka" ? product.nameKa : product.hoomaName}
      onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: product.slug } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image
        accessibilityLabel={language === "ka" ? product.nameKa : product.hoomaName}
        cachePolicy="memory-disk"
        contentFit="cover"
        source={absoluteMediaUrl(product.heroImage)}
        style={styles.image}
        transition={180}
      />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.category}>{product.subcategory}</Text>
        <Text numberOfLines={2} style={styles.name}>{language === "ka" ? product.nameKa : product.hoomaName}</Text>
        <Text style={styles.price}>{money(Math.round(Number(product.price) * 100))}</Text>
        <Text style={styles.delivery}>{language === "ka" ? "3 სამუშაო დღე" : "3 business days"}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: "hidden",
    borderRadius: radii.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  pressed: { opacity: 0.82 },
  image: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceStrong },
  copy: { padding: 14, gap: 6 },
  category: { color: colors.accent, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "800", minHeight: 42 },
  price: { color: colors.text, fontSize: 17, fontWeight: "800" },
  delivery: { color: colors.muted, fontSize: 11 },
});
