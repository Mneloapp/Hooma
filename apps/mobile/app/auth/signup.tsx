import { useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { useAuth } from "@/providers/auth-provider";
import { useCopy } from "@/lib/i18n";
import { colors } from "@/theme";

export default function SignupScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { t } = useCopy();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    const error = await signUp({ email, password, fullName, phone });
    setLoading(false);
    if (error) setMessage(error);
    else setMessage(t("ანგარიში შეიქმნა. შეამოწმე ელფოსტა დასადასტურებლად.", "Account created. Check your email to confirm it."));
  };
  return (
    <Screen title={t("ანგარიშის შექმნა", "Create account")} assistant={false}>
      <FormField label={t("სახელი და გვარი", "Full name")} value={fullName} onChangeText={setFullName} autoComplete="name" />
      <FormField label={t("ტელეფონი", "Phone")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <FormField label={t("ელფოსტა", "Email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <FormField label={t("პაროლი", "Password")} hint={t("მინიმუმ 8 სიმბოლო.", "At least 8 characters.")} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      {message ? <Text accessibilityLiveRegion="polite" style={message.includes("შეიქმნა") || message.includes("created") ? styles.success : styles.error}>{message}</Text> : null}
      <Button label={t("რეგისტრაცია", "Create account")} onPress={submit} loading={loading} disabled={!fullName || !phone || !email || password.length < 8} />
      <Button label={t("უკვე მაქვს ანგარიში", "I already have an account")} variant="secondary" onPress={() => router.replace("/auth/login")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  success: { color: colors.success, fontSize: 13, lineHeight: 20 },
});
