import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/screen";
import { useCopy } from "@/lib/i18n";
import { colors, radii } from "@/theme";

const steps = [
  ["search-outline", "აირჩიე პროდუქტი", "Choose a product", "ნახე ფასი, ზომები, მასალა, ფერი და მოვლის ინფორმაცია.", "Review price, dimensions, material, colour and care notes."],
  ["options-outline", "დააკონფიგურირე", "Configure it", "აირჩიე სასურველი ვარიანტი და დაამატე კალათაში.", "Choose a variant and add it to your cart."],
  ["card-outline", "გადაიხადე უსაფრთხოდ", "Pay securely", "BOG-ის hosted checkout-ზე გადაიხდი სრულ თანხას.", "Pay the full amount on BOG hosted checkout."],
  ["construct-outline", "აკონტროლე წარმოება", "Track production", "აპში ნახავ მიღებას, წარმოებას, ხარისხის შემოწმებასა და მიწოდებას.", "Follow receipt, production, quality check and delivery in the app."],
] as const;

export default function HowToOrderScreen() {
  const { language, t } = useCopy();
  return (
    <Screen title={t("როგორ შევუკვეთოთ?", "How to order")} subtitle={t("ოთხი მარტივი ნაბიჯი შეკვეთიდან მიწოდებამდე.", "Four simple steps from order to delivery.")}>
      {steps.map(([icon, ka, en, bodyKa, bodyEn], index) => (
        <View key={ka} style={styles.step}>
          <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
          <View style={styles.icon}><Ionicons name={icon} size={24} color={colors.accent} /></View>
          <View style={{ flex: 1 }}><Text style={styles.title}>{language === "ka" ? ka : en}</Text><Text style={styles.body}>{language === "ka" ? bodyKa : bodyEn}</Text></View>
        </View>
      ))}
      <View style={styles.promise}><Text style={styles.promiseTitle}>{t("3 სამუშაო დღე შეკვეთიდან მიწოდებამდე", "3 business days from order to delivery")}</Text><Text style={styles.body}>{t("სპეციალური ან ინდივიდუალური მოთხოვნის ვადას ოპერატორი ცალკე დაგიდასტურებს.", "An operator will confirm timelines for special or custom requests.")}</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radii.medium, backgroundColor: colors.surface },
  number: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.text, alignItems: "center", justifyContent: "center" },
  numberText: { color: colors.white, fontWeight: "900" },
  icon: { width: 48, height: 48, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 15, fontWeight: "900" },
  body: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 4 },
  promise: { padding: 20, borderRadius: radii.large, backgroundColor: colors.accentSoft, gap: 8 },
  promiseTitle: { color: colors.text, fontSize: 20, lineHeight: 27, fontWeight: "900" },
});
