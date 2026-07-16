"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileImage, LoaderCircle, Plus, Star, Trash2, Video } from "lucide-react";
import {
  discardProductMediaEditUploadsAction,
  prepareProductMediaEditUploadAction,
  updateProductMediaAction,
} from "@/app/admin/products/media-actions";
import { createClient } from "@/lib/supabase/client";

type NewMedia = { id: string; file: File; preview: string };
type UploadedMedia = { path: string; originalName: string; size: number; mimeType: string; kind: "image" | "video" };

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const videoExtensions = new Set(["mp4", "webm"]);
const imageLimit = 10 * 1024 * 1024;
const videoLimit = 50 * 1024 * 1024;

const extensionOf = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";
const contentType = (file: File) => file.type || ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" }[extensionOf(file)] ?? "application/octet-stream");
const existingKey = (url: string) => `existing:${url}`;
const newKey = (id: string) => `new:${id}`;

export function ProductMediaEditor({
  productId,
  initialImages,
  initialVideo,
}: {
  productId: string;
  initialImages: string[];
  initialVideo: string | null;
}) {
  const router = useRouter();
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [existingImages, setExistingImages] = useState(initialImages);
  const [newImages, setNewImages] = useState<NewMedia[]>([]);
  const [retainedVideo, setRetainedVideo] = useState(initialVideo);
  const [newVideo, setNewVideo] = useState<NewMedia | null>(null);
  const [heroKey, setHeroKey] = useState(initialImages[0] ? existingKey(initialImages[0]) : "");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  const imageCards = useMemo(() => [
    ...existingImages.map((url) => ({ key: existingKey(url), url, existing: true, id: url })),
    ...newImages.map((item) => ({ key: newKey(item.id), url: item.preview, existing: false, id: item.id })),
  ], [existingImages, newImages]);

  const chooseFallbackHero = (excludedKey: string) => {
    const next = imageCards.find((item) => item.key !== excludedKey);
    setHeroKey(next?.key ?? "");
  };

  const removeExistingImage = (url: string) => {
    const key = existingKey(url);
    setExistingImages((items) => items.filter((item) => item !== url));
    if (heroKey === key) chooseFallbackHero(key);
    setMessage("");
  };

  const removeNewImage = (id: string) => {
    const key = newKey(id);
    setNewImages((items) => {
      const removed = items.find((item) => item.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.preview);
        previewUrls.current.delete(removed.preview);
      }
      return items.filter((item) => item.id !== id);
    });
    if (heroKey === key) chooseFallbackHero(key);
    setMessage("");
  };

  const selectImages = (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const remaining = 12 - imageCards.length;
    if (selected.length > remaining) {
      setMessage(`პროდუქტზე მაქსიმუმ 12 ფოტო შეიძლება. ახლა კიდევ ${Math.max(0, remaining)} ფოტოს დამატება შეგიძლია.`);
      if (imageInput.current) imageInput.current.value = "";
      return;
    }
    const invalid = selected.find((file) => !imageExtensions.has(extensionOf(file)) || file.size < 1 || file.size > imageLimit);
    if (invalid) {
      setMessage(`ფოტო “${invalid.name}” უნდა იყოს JPG/PNG/WebP და მაქსიმუმ 10MB.`);
      if (imageInput.current) imageInput.current.value = "";
      return;
    }
    const additions = selected.map((file) => {
      const preview = URL.createObjectURL(file);
      previewUrls.current.add(preview);
      return { id: crypto.randomUUID(), file, preview };
    });
    setNewImages((items) => [...items, ...additions]);
    if (!heroKey && additions[0]) setHeroKey(newKey(additions[0].id));
    setMessage("");
    setSuccess(false);
    if (imageInput.current) imageInput.current.value = "";
  };

  const selectVideo = (files: FileList | null) => {
    const file = files?.[0] ?? null;
    if (!file) return;
    if (!videoExtensions.has(extensionOf(file)) || file.size < 1 || file.size > videoLimit) {
      setMessage(`ვიდეო “${file.name}” უნდა იყოს MP4/WebM და მაქსიმუმ 50MB.`);
      if (videoInput.current) videoInput.current.value = "";
      return;
    }
    if (newVideo) {
      URL.revokeObjectURL(newVideo.preview);
      previewUrls.current.delete(newVideo.preview);
    }
    const preview = URL.createObjectURL(file);
    previewUrls.current.add(preview);
    setRetainedVideo(null);
    setNewVideo({ id: crypto.randomUUID(), file, preview });
    setMessage("");
    setSuccess(false);
    if (videoInput.current) videoInput.current.value = "";
  };

  const removeNewVideo = () => {
    if (newVideo) {
      URL.revokeObjectURL(newVideo.preview);
      previewUrls.current.delete(newVideo.preview);
    }
    setNewVideo(null);
  };

  const discardUploaded = async (requestId: string, uploaded: UploadedMedia[]) => {
    if (!uploaded.length) return;
    const cleanup = new FormData();
    cleanup.set("product_id", productId);
    cleanup.set("media_request_id", requestId);
    cleanup.set("media_manifest", JSON.stringify(uploaded));
    await discardProductMediaEditUploadsAction(cleanup);
  };

  const save = async () => {
    if (!imageCards.length) { setMessage("პროდუქტს მინიმუმ ერთი ფოტო სჭირდება."); return; }
    const heroIndex = imageCards.findIndex((item) => item.key === heroKey);
    if (heroIndex < 0) { setMessage("აირჩიე პროდუქტის მთავარი ფოტო."); return; }

    setBusy(true);
    setSuccess(false);
    setMessage("");
    const files = [
      ...newImages.map((item) => ({ file: item.file, kind: "image" as const })),
      ...(newVideo ? [{ file: newVideo.file, kind: "video" as const }] : []),
    ];
    let requestId = "";
    const uploaded: UploadedMedia[] = [];

    if (files.length) {
      const supabase = createClient() as any;
      if (!supabase) { setBusy(false); setMessage("Supabase ჯერ არ არის დაკავშირებული."); return; }
      setProgress("მედიის უსაფრთხო ატვირთვა მზადდება...");
      const prepareData = new FormData();
      prepareData.set("product_id", productId);
      prepareData.set("files", JSON.stringify(files.map(({ file, kind }) => ({ name: file.name, size: file.size, mimeType: contentType(file), kind }))));
      const prepared = await prepareProductMediaEditUploadAction(prepareData);
      if (!prepared.ok || !prepared.requestId || prepared.uploads?.length !== files.length) {
        setBusy(false);
        setProgress("");
        setMessage(prepared.message);
        return;
      }
      requestId = prepared.requestId;
      for (let index = 0; index < files.length; index += 1) {
        const { file, kind } = files[index];
        const upload = prepared.uploads[index];
        const mimeType = contentType(file);
        setProgress(`იტვირთება ${index + 1}/${files.length}: ${file.name}`);
        const { error } = await supabase.storage.from("product-media").uploadToSignedUrl(upload.path, upload.token, file, {
          cacheControl: "31536000",
          contentType: mimeType,
        });
        if (error) {
          await discardUploaded(requestId, uploaded);
          setBusy(false);
          setProgress("");
          setMessage(`მედია ვერ აიტვირთა: ${error.message}`);
          return;
        }
        uploaded.push({ path: upload.path, originalName: file.name, size: file.size, mimeType, kind });
      }
    }

    setProgress("პროდუქტის მედია ახლდება...");
    const updateData = new FormData();
    updateData.set("product_id", productId);
    updateData.set("retained_images", JSON.stringify(existingImages));
    updateData.set("retained_video", retainedVideo ?? "");
    updateData.set("media_request_id", requestId);
    updateData.set("media_manifest", JSON.stringify(uploaded));
    updateData.set("hero_index", String(heroIndex));
    const result = await updateProductMediaAction(updateData);
    if (!result.ok) await discardUploaded(requestId, uploaded);
    setBusy(false);
    setProgress("");
    setMessage(result.message);
    setSuccess(result.ok);
    if (result.ok) router.refresh();
  };

  return (
    <section className="rounded-[1.75rem] bg-white/75 p-6 shadow-soft">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Media editor</p><h2 className="mt-2 text-xl font-semibold">ფოტოებისა და ვიდეოს რედაქტირება</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-hooma-muted">ამოიღე არასასურველი მედია, დაამატე ახალი ფაილები და ვარსკვლავით აირჩიე მთავარი ფოტო. პროდუქტის ფასი და სტატუსი არ შეიცვლება.</p></div><button type="button" disabled={busy} onClick={() => void save()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-hooma-text px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />}{busy ? "ინახება..." : "მედიის შენახვა"}</button></div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {imageCards.map((item, index) => <article key={item.key} className={`overflow-hidden rounded-2xl border bg-white ${heroKey === item.key ? "border-hooma-accent ring-2 ring-hooma-accent/20" : "border-hooma-text/10"}`}><div className="relative aspect-[4/3] bg-hooma-panel"><img src={item.url} alt={`პროდუქტის ფოტო ${index + 1}`} className="h-full w-full object-cover" />{!item.existing ? <span className="absolute left-2 top-2 rounded-full bg-blue-950 px-2.5 py-1 text-[10px] font-semibold text-white">ახალი</span> : null}</div><div className="flex items-center justify-between gap-3 p-3"><label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold"><input type="radio" name={`hero-${productId}`} checked={heroKey === item.key} onChange={() => setHeroKey(item.key)} className="sr-only" /><Star size={16} className={heroKey === item.key ? "fill-hooma-accent text-hooma-accent" : "text-hooma-muted"} />{heroKey === item.key ? "მთავარი ფოტო" : "მთავარად არჩევა"}</label><button type="button" disabled={busy} onClick={() => item.existing ? removeExistingImage(item.id) : removeNewImage(item.id)} title="ფოტოს ამოღება" className="rounded-full p-2 text-red-700 hover:bg-red-50 disabled:opacity-40"><Trash2 size={16} /></button></div></article>)}
        {imageCards.length < 12 ? <label className="grid min-h-56 cursor-pointer place-items-center rounded-2xl border border-dashed border-hooma-text/20 bg-hooma-panel/60 p-5 text-center transition hover:border-hooma-accent"><span><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-hooma-accent"><Plus size={21} /></span><span className="mt-3 block text-sm font-semibold">ფოტოების დამატება</span><span className="mt-1 block text-xs text-hooma-muted">JPG, PNG ან WebP · 10MB-მდე</span></span><input ref={imageInput} type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={(event) => selectImages(event.target.files)} className="sr-only" /></label> : null}
      </div>

      <div className="mt-7 border-t border-hooma-text/10 pt-6"><div className="flex items-center gap-2"><Video size={18} className="text-hooma-accent" /><h3 className="font-semibold">პროდუქტის ვიდეო</h3></div>{retainedVideo || newVideo ? <div className="mt-4 max-w-2xl overflow-hidden rounded-2xl border border-hooma-text/10 bg-hooma-text"><video src={newVideo?.preview ?? retainedVideo ?? undefined} controls preload="metadata" playsInline className="aspect-video w-full object-contain" /><div className="flex items-center justify-between bg-white p-3"><span className="text-xs text-hooma-muted">{newVideo ? `ახალი · ${newVideo.file.name}` : "არსებული ვიდეო"}</span><button type="button" disabled={busy} onClick={() => newVideo ? removeNewVideo() : setRetainedVideo(null)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700"><Trash2 size={14} />ვიდეოს ამოღება</button></div></div> : <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full border border-hooma-text/10 bg-white px-5 py-3 text-sm font-semibold"><FileImage size={16} />ვიდეოს დამატება<input ref={videoInput} type="file" accept="video/mp4,video/webm,.mp4,.webm" disabled={busy} onChange={(event) => selectVideo(event.target.files)} className="sr-only" /></label>}</div>

      {progress ? <p className="mt-5 text-sm text-hooma-muted">{progress}</p> : null}
      {message ? <p aria-live="polite" className={`mt-4 rounded-2xl p-4 text-sm ${success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message}</p> : null}
    </section>
  );
}

