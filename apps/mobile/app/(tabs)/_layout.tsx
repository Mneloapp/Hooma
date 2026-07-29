import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import { useCopy } from "@/lib/i18n";
import { useCartStore } from "@/stores/cart";

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  shop: "grid-outline",
  cart: "bag-outline",
  orders: "cube-outline",
  account: "person-outline",
};

export default function TabsLayout() {
  const { t } = useCopy();
  const cartCount = useCartStore((state) => state.lines.reduce((sum, line) => sum + line.quantity, 0));
  const labels: Record<string, string> = {
    index: t("მთავარი", "Home"),
    shop: t("მაღაზია", "Shop"),
    cart: t("კალათა", "Cart"),
    orders: t("შეკვეთები", "Orders"),
    account: t("ანგარიში", "Account"),
  };
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: {
        height: 78,
        paddingTop: 8,
        backgroundColor: colors.surface,
        borderTopColor: colors.line,
      },
      tabBarLabelStyle: { fontSize: 10, fontWeight: "700", paddingBottom: 8 },
      tabBarIcon: ({ color, size }) => <Ionicons name={icons[route.name] ?? "ellipse-outline"} color={color} size={size} />,
      tabBarLabel: labels[route.name] ?? route.name,
    })}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="shop" />
      <Tabs.Screen name="cart" options={{ tabBarBadge: cartCount || undefined }} />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
