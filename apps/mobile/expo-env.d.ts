/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    EXPO_PUBLIC_EAS_PROJECT_ID?: string;
    HOOMA_IOS_BUNDLE_ID?: string;
    HOOMA_ANDROID_APPLICATION_ID?: string;
  }
}
