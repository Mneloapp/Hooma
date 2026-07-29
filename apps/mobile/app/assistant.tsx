import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { Screen } from "@/components/screen";
import { colors, radii } from "@/theme";

type Message = { role: "user" | "assistant"; content: string };
type AssistantReply = { answer: string; suggestions: string[]; source: string };

export default function AssistantScreen() {
  const { language, t } = useCopy();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: t("გამარჯობა! დაგეხმარები პროდუქტების, შეკვეთის, მიწოდებისა და Hooma+-ის საკითხებში.", "Hello! I can help with products, ordering, delivery and Hooma+."),
  }]);
  const [suggestions, setSuggestions] = useState<string[]>([
    t("როგორ შევუკვეთო?", "How do I order?"),
    t("მიწოდება რა ღირს?", "How much is delivery?"),
  ]);
  const mutation = useMutation({
    mutationFn: (content: string) => apiFetch<{ ok: true; reply: AssistantReply }>("/api/mobile/v1/assistant", {
      method: "POST",
      body: JSON.stringify({
        language,
        currentPath: "/",
        messages: [{ role: "user", content }],
      }),
    }),
    onSuccess: ({ reply }) => {
      setMessages((current) => [...current, { role: "assistant", content: reply.answer }]);
      setSuggestions(reply.suggestions);
    },
    onError: () => setMessages((current) => [...current, {
      role: "assistant",
      content: t("ასისტენტი დროებით მიუწვდომელია. სცადე მოგვიანებით.", "The assistant is temporarily unavailable. Try again later."),
    }]),
  });
  const send = (value = input) => {
    const content = value.trim().slice(0, 800);
    if (!content || mutation.isPending) return;
    setMessages((current) => [...current, { role: "user", content }]);
    setInput("");
    mutation.mutate(content);
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen scroll={false} assistant={false} contentContainerStyle={styles.screen}>
        <View style={styles.messages}>
          {messages.slice(-8).map((message, index) => (
            <View key={`${message.role}-${index}`} style={[styles.bubble, message.role === "user" ? styles.userBubble : styles.assistantBubble]}>
              <Text style={[styles.message, message.role === "user" && styles.userMessage]}>{message.content}</Text>
            </View>
          ))}
          {mutation.isPending ? <Text style={styles.typing}>{t("Hooma პასუხობს...", "Hooma is replying...")}</Text> : null}
        </View>
        <View style={styles.suggestions}>
          {suggestions.slice(0, 3).map((suggestion) => <Pressable key={suggestion} onPress={() => send(suggestion)} style={styles.suggestion}><Text style={styles.suggestionText}>{suggestion}</Text></Pressable>)}
        </View>
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel={t("კითხვის დაწერა", "Type a question")}
            value={input}
            onChangeText={setInput}
            placeholder={t("ჰკითხე Hooma-ს...", "Ask Hooma...")}
            placeholderTextColor={colors.muted}
            multiline
            maxLength={800}
            style={styles.input}
          />
          <Pressable accessibilityLabel={t("გაგზავნა", "Send")} onPress={() => send()} style={styles.send}><Ionicons name="arrow-up" size={21} color={colors.white} /></Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 18 },
  messages: { flex: 1, justifyContent: "flex-end", gap: 10 },
  bubble: { maxWidth: "86%", padding: 14, borderRadius: radii.medium },
  assistantBubble: { alignSelf: "flex-start", backgroundColor: colors.surface },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.text },
  message: { color: colors.text, fontSize: 14, lineHeight: 21 },
  userMessage: { color: colors.white },
  typing: { color: colors.muted, fontSize: 12 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  suggestion: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.accentSoft },
  suggestionText: { color: colors.accent, fontSize: 11, fontWeight: "800" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, padding: 9, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  input: { flex: 1, minHeight: 44, maxHeight: 100, color: colors.text, fontSize: 15, paddingHorizontal: 10, paddingVertical: 10 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
