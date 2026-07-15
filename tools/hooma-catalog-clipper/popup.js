const elements = {
  extract: document.querySelector("#extract"),
  status: document.querySelector("#status"),
  source: document.querySelector("#source"),
  form: document.querySelector("#draft"),
  name: document.querySelector("#name"),
  description: document.querySelector("#description"),
  material: document.querySelector("#material"),
  weight: document.querySelector("#weight"),
  time: document.querySelector("#time"),
  x: document.querySelector("#x"),
  y: document.querySelector("#y"),
  z: document.querySelector("#z"),
  images: document.querySelector("#images"),
  imageCount: document.querySelector("#image-count"),
  videoLink: document.querySelector("#video-link"),
  warnings: document.querySelector("#warnings"),
  export: document.querySelector("#export"),
  downloadMedia: document.querySelector("#download-media"),
};

let draft = null;

const show = (message, type = "") => {
  elements.status.className = type;
  elements.status.textContent = message;
};
const numeric = (element) => element.value === "" ? null : Number(element.value);
const selectedImages = () => Array.from(elements.images.querySelectorAll('input[type="checkbox"]:checked')).map((item) => item.value).slice(0, 12);
const slug = (value) => String(value || "hooma-product").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u10a0-\u10ff]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "hooma-product";

function syncDraft() {
  if (!draft) return null;
  const x = numeric(elements.x);
  const y = numeric(elements.y);
  const z = numeric(elements.z);
  draft.product.name = elements.name.value.trim() || null;
  draft.product.description = elements.description.value.trim() || null;
  draft.product.media.imageUrls = selectedImages();
  draft.product.technical.material = elements.material.value.trim() || null;
  draft.product.technical.weightGrams = numeric(elements.weight);
  draft.product.technical.printTimeMinutes = numeric(elements.time);
  draft.product.technical.dimensionsMm = x || y || z ? { x, y, z } : null;
  return draft;
}

function updateImageCount() {
  elements.imageCount.textContent = `${selectedImages().length} არჩეული`;
}

function render(data) {
  draft = data;
  const technical = data.product.technical;
  elements.source.textContent = data.source.url;
  elements.name.value = data.product.name ?? "";
  elements.description.value = data.product.description ?? "";
  elements.material.value = technical.material ?? "";
  elements.weight.value = technical.weightGrams ?? "";
  elements.time.value = technical.printTimeMinutes ?? "";
  elements.x.value = technical.dimensionsMm?.x ?? "";
  elements.y.value = technical.dimensionsMm?.y ?? "";
  elements.z.value = technical.dimensionsMm?.z ?? "";
  elements.images.replaceChildren();
  data.product.media.imageUrls.forEach((url, index) => {
    const label = document.createElement("label");
    label.className = "image-option";
    label.title = url;
    const image = document.createElement("img");
    image.src = url;
    image.alt = `Product image ${index + 1}`;
    image.loading = "lazy";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = url;
    checkbox.checked = index < 12;
    checkbox.addEventListener("change", () => {
      if (selectedImages().length > 12) {
        checkbox.checked = false;
        show("მაქსიმუმ 12 ფოტოს მონიშვნა შეიძლება.", "error");
      }
      updateImageCount();
    });
    label.append(image, checkbox);
    elements.images.append(label);
  });
  elements.videoLink.hidden = !data.product.media.videoUrl;
  if (data.product.media.videoUrl) elements.videoLink.href = data.product.media.videoUrl;
  elements.warnings.replaceChildren();
  data.warnings.forEach((message) => {
    const warning = document.createElement("div");
    warning.className = "warning";
    warning.textContent = message;
    elements.warnings.append(warning);
  });
  elements.form.hidden = false;
  updateImageCount();
}

elements.extract.addEventListener("click", async () => {
  elements.extract.disabled = true;
  show("გვერდის საჯარო მონაცემები იკითხება...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//i.test(tab.url ?? "")) throw new Error("გახსენი პროდუქტის ჩვეულებრივი HTTP/HTTPS გვერდი.");
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractor.js"] });
    const data = results?.[0]?.result;
    if (!data?.product || data.schema !== "hooma-catalog-clipper-v1") throw new Error("გვერდიდან პროდუქტის მონაცემები ვერ მომზადდა.");
    render(data);
    show(`მონაცემები მომზადდა. ნაპოვნია ${data.product.media.imageUrls.length} ფოტო; გადაამოწმე ყველა ველი.`, "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "გვერდი ვერ წავიკითხე. განაახლე და სცადე თავიდან.", "error");
  } finally {
    elements.extract.disabled = false;
  }
});

elements.export.addEventListener("click", async () => {
  const data = syncDraft();
  if (!data) return;
  const encoded = encodeURIComponent(JSON.stringify(data, null, 2));
  await chrome.downloads.download({
    url: `data:application/json;charset=utf-8,${encoded}`,
    filename: `hooma-import/${slug(data.product.name)}.hooma.json`,
    saveAs: true,
  });
  show("Hooma JSON მზადაა. ახლა შემოიტანე Admin → პროდუქტები → ახალი პროდუქტი გვერდზე.", "ok");
});

elements.downloadMedia.addEventListener("click", async () => {
  const data = syncDraft();
  if (!data) return;
  const images = data.product.media.imageUrls;
  const directVideo = data.product.media.videoUrl && /\.(?:mp4|webm)(?:$|\?)/i.test(data.product.media.videoUrl)
    ? data.product.media.videoUrl
    : null;
  if (!images.length && !directVideo) { show("ჩამოსატვირთი ფოტო ან პირდაპირი ვიდეო ვერ მოიძებნა.", "error"); return; }
  elements.downloadMedia.disabled = true;
  let failures = 0;
  for (let index = 0; index < images.length; index += 1) {
    try {
      const pathname = new URL(images[index]).pathname;
      const extension = pathname.match(/\.(jpe?g|png|webp)(?:$|\/)/i)?.[1]?.toLowerCase() ?? "jpg";
      await chrome.downloads.download({
        url: images[index],
        filename: `hooma-import/${slug(data.product.name)}/image-${String(index + 1).padStart(2, "0")}.${extension}`,
        saveAs: false,
      });
    } catch { failures += 1; }
  }
  if (directVideo) {
    try {
      const extension = new URL(directVideo).pathname.toLowerCase().endsWith(".webm") ? "webm" : "mp4";
      await chrome.downloads.download({
        url: directVideo,
        filename: `hooma-import/${slug(data.product.name)}/video.${extension}`,
        saveAs: false,
      });
    } catch { failures += 1; }
  }
  elements.downloadMedia.disabled = false;
  const total = images.length + (directVideo ? 1 : 0);
  show(failures ? `${total - failures} მედია ჩამოიტვირთა; ${failures} წყარომ დაბლოკა.` : `${total} მედია ჩამოიტვირთა.`, failures ? "" : "ok");
});
