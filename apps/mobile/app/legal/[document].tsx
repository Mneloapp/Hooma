import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { StyleSheet, Text, View } from "react-native";
import { useCopy } from "@/lib/i18n";
import { Screen } from "@/components/screen";
import { Button } from "@/components/button";
import { colors, radii } from "@/theme";

export default function LegalScreen() {
  const { document } = useLocalSearchParams<{ document: "privacy" | "terms" }>();
  const { t } = useCopy();
  const privacy = document !== "terms";
  return (
    <Screen title={privacy ? t("კონფიდენციალურობა", "Privacy Policy") : t("წესები და პირობები", "Terms and Conditions")} assistant={false}>
      <View style={styles.panel}>
        <Text style={styles.updated}>{t("ოფიციალური დოკუმენტი: hooma.ge", "Official document: hooma.ge")}</Text>
        <Text style={styles.body}>{privacy
          ? t("Hooma ამუშავებს ანგარიშის, მისამართის, შეკვეთისა და მხარდაჭერისთვის აუცილებელ მონაცემებს. ბარათის სრული მონაცემები Hooma-ში არ შედის და BOG-ის დაცულ გარემოში მუშავდება. აპის სესია მოწყობილობაზე დაცულ საცავში ინახება.", "Hooma processes account, address, order and support data needed to provide the service. Full card details never enter Hooma and are handled by BOG. The app session is stored in secure device storage.")
          : t("პროდუქტი მზადდება მოთხოვნით. ფასი, მიწოდება და ხელმისაწვდომობა საბოლოოდ server-ზე დასტურდება. ონლაინ გადახდა სრულდება BOG-ის hosted checkout-ზე; მხოლოდ ბანკის დადასტურებული callback ნიშნავს წარმატებულ გადახდას.", "Products are made on demand. Price, delivery and availability are confirmed by the server. Online payment uses BOG hosted checkout; only a verified bank callback confirms payment.")}</Text>
      </View>
      <Button label={t("სრული დოკუმენტის ნახვა", "View full document")} onPress={() => WebBrowser.openBrowserAsync(`https://hooma.ge/${privacy ? "privacy" : "terms"}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 20, borderRadius: radii.large, backgroundColor: colors.surface, gap: 12 },
  updated: { color: colors.accent, fontSize: 12, fontWeight: "900" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 25 },
});
