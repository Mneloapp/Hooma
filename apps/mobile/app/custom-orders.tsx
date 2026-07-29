import { useState } from "react";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { apiFetch } from "@/lib/api";
import { useCopy } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { Screen } from "@/components/screen";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/button";
import { LoadingView, StateView } from "@/components/state-view";
import { colors, radii } from "@/theme";

type RequestRow = {
  id: string;
  title: string;
  description: string;
  quantity: number;
  status: string;
  quoted_price: number | string | null;
  quoted_lead_days: number | null;
  created_at: string;
};

type SelectedFile = DocumentPicker.DocumentPickerAsset;

export default function CustomOrdersScreen() {
  const { session, loading } = useAuth();
  const { language, t, money } = useCopy();
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [dimensions, setDimensions] = useState("");
  const [material, setMaterial] = useState("");
  const [color, setColor] = useState("");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["custom-orders"],
    queryFn: () => apiFetch<{ ok: true; data: RequestRow[] }>("/api/mobile/v1/custom-orders", { authenticated: true }),
    enabled: Boolean(session),
  });
  const submit = useMutation({
    mutationFn: async () => {
      const prepared = await apiFetch<{ ok: true; data: { requestId: string; uploads: { path: string; token: string }[] } }>("/api/mobile/v1/custom-orders/upload", {
        method: "POST",
        authenticated: true,
        body: JSON.stringify({ files: files.map((file) => ({ name: file.name, size: file.size })) }),
      });
      const uploaded = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        const target = prepared.data.uploads[index]!;
        const contents = await (await fetch(file.uri)).arrayBuffer();
        const { error } = await supabase.storage
          .from("custom-quote-files")
          .uploadToSignedUrl(target.path, target.token, contents, {
            contentType: file.mimeType ?? "application/octet-stream",
          });
        if (error) throw error;
        uploaded.push({
          path: target.path,
          originalName: file.name,
          mimeType: file.mimeType,
          size: file.size,
        });
      }
      return apiFetch("/api/mobile/v1/custom-orders", {
        method: "POST",
        authenticated: true,
        body: JSON.stringify({
          requestId: prepared.data.requestId,
          title,
          description,
          quantity: Number(quantity),
          dimensions,
          materialPreference: material,
          colorPreference: color,
          files: uploaded,
        }),
      });
    },
    onSuccess: async () => {
      setTitle(""); setDescription(""); setQuantity("1"); setDimensions(""); setMaterial(""); setColor(""); setFiles([]);
      setMessage(t("მოთხოვნა მიღებულია.", "Request submitted."));
      await client.invalidateQueries({ queryKey: ["custom-orders"] });
    },
    onError: () => setMessage(t("მოთხოვნის გაგზავნა ვერ მოხერხდა.", "The request could not be submitted.")),
  });
  const accept = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/mobile/v1/custom-orders/${id}/accept`, { method: "POST", authenticated: true }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["custom-orders"] }),
  });
  if (loading) return <Screen><LoadingView /></Screen>;
  if (!session) return <Redirect href={{ pathname: "/auth/login", params: { next: "/custom-orders" } }} />;
  return (
    <Screen title={t("ინდივიდუალური შეკვეთა", "Custom order")} subtitle={t("ატვირთე მოდელი, ფოტო ან ნახაზი და მიიღე ინდივიდუალური შეფასება.", "Upload a model, photo or drawing and receive a custom quote.")}>
      <View style={styles.form}>
        <FormField label={t("სათაური", "Title")} value={title} onChangeText={setTitle} />
        <FormField label={t("აღწერა", "Description")} value={description} onChangeText={setDescription} multiline />
        <FormField label={t("რაოდენობა", "Quantity")} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        <FormField label={t("ზომები", "Dimensions")} value={dimensions} onChangeText={setDimensions} />
        <FormField label={t("სასურველი მასალა", "Preferred material")} value={material} onChangeText={setMaterial} />
        <FormField label={t("სასურველი ფერი", "Preferred colour")} value={color} onChangeText={setColor} />
        <Pressable
          onPress={async () => {
            const result = await DocumentPicker.getDocumentAsync({
              multiple: true,
              copyToCacheDirectory: true,
              type: ["model/*", "application/zip", "application/pdf", "image/*"],
            });
            if (!result.canceled) setFiles(result.assets.slice(0, 5));
          }}
          style={styles.picker}
        >
          <Ionicons name="cloud-upload-outline" size={27} color={colors.accent} />
          <Text style={styles.pickerTitle}>{t("ფაილების არჩევა", "Choose files")}</Text>
          <Text style={styles.pickerBody}>{t("მაქს. 5 ფაილი · თითოეული 100MB-მდე", "Up to 5 files · 100MB each")}</Text>
        </Pressable>
        {files.map((file) => <Text key={file.uri} numberOfLines={1} style={styles.file}>• {file.name} ({Math.round((file.size ?? 0) / 1024)} KB)</Text>)}
        {message ? <Text style={{ color: colors.accent }}>{message}</Text> : null}
        <Button label={t("მოთხოვნის გაგზავნა", "Submit request")} loading={submit.isPending} disabled={title.length < 3 || description.length < 10 || !files.length} onPress={() => submit.mutate()} />
      </View>
      <Text style={styles.sectionTitle}>{t("მოთხოვნების ისტორია", "Request history")}</Text>
      {query.isLoading ? <LoadingView /> : (query.data?.data.length ?? 0) === 0 ? <StateView icon="document-attach-outline" title={t("მოთხოვნები ჯერ არ გაქვს", "No requests yet")} body={t("პირველი მოთხოვნის სტატუსი აქ გამოჩნდება.", "Your first request will appear here.")} /> : query.data?.data.map((request) => (
        <View key={request.id} style={styles.request}>
          <View style={styles.requestTop}><Text style={styles.requestTitle}>{request.title}</Text><Text style={styles.status}>{request.status}</Text></View>
          <Text style={styles.requestBody} numberOfLines={2}>{request.description}</Text>
          <Text style={styles.requestMeta}>{new Date(request.created_at).toLocaleDateString(language === "ka" ? "ka-GE" : "en-GB")} · ×{request.quantity}</Text>
          {request.quoted_price !== null ? <Text style={styles.quote}>{money(Math.round(Number(request.quoted_price) * 100))} / {t("ერთეული", "unit")}</Text> : null}
          {request.status === "quoted" ? <Button label={t("შეთავაზების მიღება", "Accept quote")} onPress={() => accept.mutate(request.id)} loading={accept.isPending} /> : null}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { padding: 18, borderRadius: radii.large, backgroundColor: colors.surface, gap: 14 },
  picker: { minHeight: 130, borderRadius: radii.medium, borderWidth: 1, borderStyle: "dashed", borderColor: colors.accent, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", gap: 6 },
  pickerTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  pickerBody: { color: colors.muted, fontSize: 11 },
  file: { color: colors.muted, fontSize: 11 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "900" },
  request: { padding: 18, borderRadius: radii.medium, backgroundColor: colors.surface, gap: 9 },
  requestTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  requestTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "900" },
  status: { color: colors.accent, fontSize: 11, fontWeight: "900" },
  requestBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  requestMeta: { color: colors.muted, fontSize: 10 },
  quote: { color: colors.text, fontSize: 19, fontWeight: "900" },
});
