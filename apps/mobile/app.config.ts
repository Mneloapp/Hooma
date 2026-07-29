import type { ConfigContext, ExpoConfig } from "expo/config";

const bundleIdentifier = process.env.HOOMA_IOS_BUNDLE_ID ?? "ge.hooma.app";
const androidPackage = process.env.HOOMA_ANDROID_APPLICATION_ID ?? "ge.hooma.app";
const appVariant = process.env.APP_VARIANT ?? "production";
const isDevelopment = appVariant === "development";
const name = isDevelopment ? "Hooma Dev" : "Hooma";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name,
  slug: "hooma",
  owner: process.env.EXPO_OWNER,
  version: "0.1.0",
  orientation: "portrait",
  scheme: "hooma",
  userInterfaceStyle: "light",
  icon: "../../public/brand/hooma-symbol.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: isDevelopment ? `${bundleIdentifier}.dev` : bundleIdentifier,
    buildNumber: "1",
    associatedDomains: ["applinks:hooma.ge"],
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: "Hooma კამერას იყენებს მხოლოდ ინდივიდუალური შეკვეთის ფოტოს ასატვირთად.",
      NSPhotoLibraryUsageDescription: "Hooma ფოტოებზე წვდომას იყენებს მხოლოდ თქვენ მიერ არჩეული ფაილის ასატვირთად.",
      NSFaceIDUsageDescription: "Hooma Face ID-ს იყენებს მოწყობილობაზე დაცული სესიის გასახსნელად.",
      UIBackgroundModes: ["remote-notification"]
    }
  },
  android: {
    package: isDevelopment ? `${androidPackage}.dev` : androidPackage,
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "../../public/brand/hooma-symbol.png",
      backgroundColor: "#F8F4EE"
    },
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "hooma.ge", pathPrefix: "/mobile" },
          { scheme: "https", host: "www.hooma.ge", pathPrefix: "/mobile" }
        ],
        category: ["BROWSABLE", "DEFAULT"]
      },
      {
        action: "VIEW",
        data: [{ scheme: "hooma" }],
        category: ["BROWSABLE", "DEFAULT"]
      }
    ]
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        "image": "../../public/brand/hooma-logo.png",
        "imageWidth": 220,
        "resizeMode": "contain",
        "backgroundColor": "#F8F4EE"
      }
    ],
    "expo-secure-store",
    "expo-apple-authentication",
    [
      "expo-notifications",
      {
        "icon": "../../public/brand/hooma-symbol.png",
        "color": "#6B765D",
        "defaultChannel": "orders"
      }
    ],
    [
      "expo-document-picker",
      {
        "iCloudContainerEnvironment": "Production"
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    },
    build: {
      variant: appVariant,
      bundleIdentifier,
      androidPackage
    }
  }
});
