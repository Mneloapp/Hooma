import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProviders } from "@/providers/app-providers";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function NavigationEvents() {
  const router = useRouter();
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data && typeof data.order_id === "string") {
        router.push({ pathname: "/order/[id]", params: { id: data.order_id } });
      } else if (data?.href === "/account/hooma-plus") {
        router.push("/hooma-plus");
      } else {
        router.push("/notifications");
      }
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const orderId = response?.notification.request.content.data?.order_id;
      if (typeof orderId === "string") {
        router.push({ pathname: "/order/[id]", params: { id: orderId } });
      } else if (response?.notification.request.content.data?.href === "/account/hooma-plus") {
        router.push("/hooma-plus");
      }
    }).catch(() => undefined);
    return () => subscription.remove();
  }, [router]);
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <StatusBar style="dark" />
          <NavigationEvents />
          <Stack screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
            animation: "slide_from_right",
          }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[slug]" options={{ title: "" }} />
            <Stack.Screen name="auth/login" options={{ title: "" }} />
            <Stack.Screen name="auth/signup" options={{ title: "" }} />
            <Stack.Screen name="checkout/index" options={{ title: "" }} />
            <Stack.Screen name="assistant" options={{ title: "Hooma Assistant", presentation: "modal" }} />
          </Stack>
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
