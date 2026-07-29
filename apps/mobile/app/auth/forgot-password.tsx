import { useState } from "react";
import { Text } from "react-native";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { useAuth } from "@/providers/auth-provider";
import { useCopy } from "@/lib/i18n";
import { colors } from "@/theme";

export default function ForgotPasswordScreen() {
  const { resetPassword } = useAuth();
  const { t } = useCopy();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <Screen title={t("პაროლის აღდგენა", "Reset password")} assistant={false}>
      <Text style={{ color: colors.muted, lineHeight: 23 }}>{t("შეიყვანე ანგარიშის ელფოსტა. უსაფრთხო აღდგენის ბმულს გამოგიგზავნით.", "Enter your account email and we will send a secure recovery link.")}</Text>
      <FormField label={t("ელფოსტა", "Email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {message ? <Text style={{ color: colors.accent }}>{message}</Text> : null}
      <Button
        label={t("ბმულის გაგზავნა", "Send recovery link")}
        loading={loading}
        disabled={!email}
        onPress={async () => {
          setLoading(true);
          const error = await resetPassword(email);
          setLoading(false);
          setMessage(error ?? t("ბმული გაგზავნილია. შეამოწმე ელფოსტა.", "Recovery link sent. Check your email."));
        }}
      />
    </Screen>
  );
}
