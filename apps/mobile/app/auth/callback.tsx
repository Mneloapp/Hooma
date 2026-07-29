import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "react-native";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { useAuth } from "@/providers/auth-provider";
import { useCopy } from "@/lib/i18n";
import { colors } from "@/theme";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { session, updatePassword } = useAuth();
  const { t } = useCopy();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  if (params.mode !== "recovery") {
    return (
      <Screen title={t("ანგარიში დადასტურებულია", "Account confirmed")} assistant={false}>
        <Text style={{ color: colors.muted }}>{session ? t("შეგიძლია გააგრძელო Hooma-ს გამოყენება.", "You can continue using Hooma.") : t("ავტორიზაციის სესია მუშავდება...", "Finishing authentication...")}</Text>
        <Button label={t("გაგრძელება", "Continue")} onPress={() => router.replace("/(tabs)/account")} />
      </Screen>
    );
  }
  return (
    <Screen title={t("ახალი პაროლი", "New password")} assistant={false}>
      <FormField label={t("ახალი პაროლი", "New password")} value={password} onChangeText={setPassword} secureTextEntry />
      {message ? <Text style={{ color: colors.accent }}>{message}</Text> : null}
      <Button
        label={t("პაროლის შენახვა", "Save password")}
        disabled={password.length < 8}
        onPress={async () => {
          const error = await updatePassword(password);
          setMessage(error ?? t("პაროლი განახლებულია.", "Password updated."));
          if (!error) setTimeout(() => router.replace("/(tabs)/account"), 700);
        }}
      />
    </Screen>
  );
}
