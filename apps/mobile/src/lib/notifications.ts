import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { apiFetch } from "./api";
import type { Language } from "@/types";

const installationKey = "hooma-mobile-installation-id";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function installationId() {
  const existing = await SecureStore.getItemAsync(installationKey);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(installationKey, created);
  return created;
}

export async function unregisterPushNotifications() {
  const deviceId = await SecureStore.getItemAsync(installationKey);
  if (!deviceId) return;
  await apiFetch(
    `/api/mobile/v1/push-token?deviceId=${encodeURIComponent(deviceId)}`,
    { method: "DELETE", authenticated: true },
  );
}

export async function registerForPushNotifications(language: Language) {
  if (!Device.isDevice || (Platform.OS !== "ios" && Platform.OS !== "android")) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", {
      name: "შეკვეთები / Orders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#6B765D",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted"
    ? current
    : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await apiFetch("/api/mobile/v1/push-token", {
    method: "POST",
    authenticated: true,
    body: JSON.stringify({
      expoPushToken: token,
      deviceId: await installationId(),
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? null,
      locale: language,
    }),
  });
}
