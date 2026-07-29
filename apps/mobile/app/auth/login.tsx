import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { useAuth } from "@/providers/auth-provider";
import { useCopy } from "@/lib/i18n";
import { colors } from "@/theme";

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();
  const { t } = useCopy();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const finish = () => {
    const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/(tabs)/account";
    router.replace(next as never);
  };
  const submit = async () => {
    setLoading(true);
    setMessage("");
    const error = await signIn(email, password);
    setLoading(false);
    if (error) setMessage(error);
    else finish();
  };
  const oauth = async (provider: "google" | "apple") => {
    setLoading(true);
    const error = provider === "google" ? await signInWithGoogle() : await signInWithApple();
    setLoading(false);
    if (error) setMessage(error);
    else finish();
  };
  return (
    <Screen
      title={t("შესვლა", "Sign in")}
      subtitle={t("შენი შეკვეთები, მისამართები და Hooma+ ერთ უსაფრთხო ანგარიშში.", "Orders, addresses and Hooma+ in one secure account.")}
      assistant={false}
    >
      <FormField label={t("ელფოსტა", "Email")} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <FormField label={t("პაროლი", "Password")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      {message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null}
      <Button label={t("შესვლა", "Sign in")} onPress={submit} loading={loading} disabled={!email || !password} />
      <Pressable onPress={() => router.push("/auth/forgot-password")} style={styles.linkButton}><Text style={styles.link}>{t("პაროლი დაგავიწყდა?", "Forgot password?")}</Text></Pressable>
      <Text style={styles.or}>{t("ან", "or")}</Text>
      <Button label={t("Google-ით შესვლა", "Continue with Google")} variant="secondary" onPress={() => oauth("google")} disabled={loading} />
      {Platform.OS === "ios" ? <Button label={t("Apple-ით შესვლა", "Continue with Apple")} variant="secondary" onPress={() => oauth("apple")} disabled={loading} /> : null}
      <Pressable onPress={() => router.push("/auth/signup")} style={styles.linkButton}><Text style={styles.link}>{t("არ გაქვს ანგარიში? რეგისტრაცია", "New to Hooma? Create account")}</Text></Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  linkButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  link: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  or: { color: colors.muted, textAlign: "center", fontSize: 12 },
});
