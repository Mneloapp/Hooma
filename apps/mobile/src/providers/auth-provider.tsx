import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import { unregisterPushNotifications } from "@/lib/notifications";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (input: { email: string; password: string; fullName: string; phone: string }) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signInWithApple: () => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function completeAuthFromUrl(url: string) {
  const params = QueryParams.getQueryParams(url).params;
  if (typeof params.code === "string") {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return;
  }
  if (typeof params.access_token === "string" && typeof params.refresh_token === "string") {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const authSubscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      completeAuthFromUrl(url).catch(() => {
        Alert.alert("Hooma", "ავტორიზაციის ბმული ვერ დამუშავდა.");
      });
    });
    Linking.getInitialURL().then((url) => {
      if (url) return completeAuthFromUrl(url);
    }).catch(() => undefined);
    return () => {
      mounted = false;
      authSubscription.data.subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  const guardConfig = useCallback(() => {
    if (!isSupabaseConfigured) return "Supabase mobile configuration is missing.";
    return null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const configError = guardConfig();
    if (configError) return configError;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error?.message ?? null;
  }, [guardConfig]);

  const signUp = useCallback(async (input: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
  }) => {
    const configError = guardConfig();
    if (configError) return configError;
    const redirectTo = Linking.createURL("auth/callback");
    const { error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: input.fullName.trim(), phone: input.phone.trim() },
      },
    });
    return error?.message ?? null;
  }, [guardConfig]);

  const signInWithGoogle = useCallback(async () => {
    const configError = guardConfig();
    if (configError) return configError;
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return error?.message ?? "OAuth URL was not created.";
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type === "success") {
      try {
        await completeAuthFromUrl(result.url);
      } catch (authError) {
        return authError instanceof Error ? authError.message : "Google sign-in failed.";
      }
    }
    return null;
  }, [guardConfig]);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== "ios") return "Sign in with Apple is available on iOS.";
    const configError = guardConfig();
    if (configError) return configError;
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) return "Apple identity token was not returned.";
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });
      return error?.message ?? null;
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
      return error instanceof Error ? error.message : "Apple sign-in failed.";
    }
  }, [guardConfig]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL("auth/callback", { queryParams: { mode: "recovery" } }),
    });
    return error?.message ?? null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await unregisterPushNotifications().catch(() => undefined);
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithApple,
    resetPassword,
    updatePassword,
    signOut,
  }), [
    session,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithApple,
    resetPassword,
    updatePassword,
    signOut,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
