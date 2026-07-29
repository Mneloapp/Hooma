import { useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { colors, radii } from "@/theme";
import { useSettingsStore } from "@/stores/settings";

const slides = [
  {
    icon: "home-outline" as const,
    title: "სახლი, რომელიც შენს ხასიათს ჰგავს",
    body: "აღმოაჩინე Hooma-ს მიერ შერჩეული და მოთხოვნით დამზადებული ნივთები.",
    titleEn: "Objects that feel at home",
    bodyEn: "Discover calm, useful objects curated and made on demand by Hooma.",
  },
  {
    icon: "color-palette-outline" as const,
    title: "აირჩიე ზომა, მასალა და ფერი",
    body: "პროდუქტის თითოეული ვარიანტი მზადდება ზუსტად შენი შეკვეთისთვის.",
    titleEn: "Choose size, material and colour",
    bodyEn: "Each product variant is made specifically for your order.",
  },
  {
    icon: "cube-outline" as const,
    title: "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე",
    body: "გადახდა უსაფრთხოდ სრულდება BOG-ის გვერდზე, სტატუსს კი აპში აკონტროლებ.",
    titleEn: "3 business days from order to delivery",
    bodyEn: "Pay securely on BOG and track progress inside the app.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const finish = useSettingsStore((state) => state.finishOnboarding);
  const slide = slides[index]!;
  const complete = () => {
    finish();
    router.replace("/(tabs)");
  };
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Text style={styles.logo}>hooma</Text>
        <Button
          label={language === "ka" ? "EN" : "ქარ"}
          onPress={() => setLanguage(language === "ka" ? "en" : "ka")}
          variant="secondary"
          style={styles.language}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Ionicons name={slide.icon} size={58} color={colors.accent} />
        </View>
        <View style={styles.dots}>
          {slides.map((_, itemIndex) => <View key={itemIndex} style={[styles.dot, index === itemIndex && styles.activeDot]} />)}
        </View>
        <Text style={styles.title}>{language === "ka" ? slide.title : slide.titleEn}</Text>
        <Text style={styles.copy}>{language === "ka" ? slide.body : slide.bodyEn}</Text>
      </View>
      <Button
        label={index === slides.length - 1
          ? language === "ka" ? "დაწყება" : "Get started"
          : language === "ka" ? "შემდეგი" : "Continue"}
        onPress={() => index === slides.length - 1 ? complete() : setIndex(index + 1)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: 24 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { color: colors.text, fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  language: { minHeight: 44, paddingHorizontal: 16 },
  body: { flex: 1, justifyContent: "center", gap: 20 },
  icon: {
    height: 220,
    borderRadius: radii.large,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  dots: { flexDirection: "row", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surfaceStrong },
  activeDot: { width: 28, backgroundColor: colors.accent },
  title: { color: colors.text, fontSize: 34, lineHeight: 42, fontWeight: "900", letterSpacing: -0.9 },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 26 },
});
