const PRODUCT_COLORS = [
  { name: "თეთრი", hex: "#EEEAE1" },
  { name: "შავი", hex: "#292929" },
  { name: "ნაცრისფერი", hex: "#7C7F82" },
  { name: "ბეჟი", hex: "#D8C7AD" },
  { name: "წითელი", hex: "#C74943" },
  { name: "ლურჯი", hex: "#3E6F9E" },
  { name: "მწვანე", hex: "#6E8263" },
  { name: "ყვითელი", hex: "#E2B84C" },
  { name: "ნარინჯისფერი", hex: "#D77A3D" },
  { name: "იისფერი", hex: "#785C8E" },
  { name: "ვარდისფერი", hex: "#D491A6" },
  { name: "ყავისფერი", hex: "#795548" },
];

const elements = {
  extract: document.querySelector("#extract"),
  status: document.querySelector("#status"),
  source: document.querySelector("#source"),
  form: document.querySelector("#draft"),
  name: document.querySelector("#name"),
  description: document.querySelector("#description"),
  material: document.querySelector("#material"),
  weight: document.querySelector("#weight"),
  timeHours: document.querySelector("#time-hours"),
  timeMinutes: document.querySelector("#time-minutes"),
  colors: document.querySelector("#colors"),
  colorHint: document.querySelector("#color-hint"),
  images: document.querySelector("#images"),
  imageCount: document.querySelector("#image-count"),
  videoLink: document.querySelector("#video-link"),
  warnings: document.querySelector("#warnings"),
  export: document.querySelector("#export"),
  downloadPackage: document.querySelector("#download-package"),
};

let draft = null;

const show = (message, type = "") => {
  elements.status.className = type;
  elements.status.textContent = message;
};
const numeric = (element) => element.value === "" ? null : Number(element.value);
const selectedImages = () => Array.from(elements.images.querySelectorAll('input[type="checkbox"]:checked')).map((item) => item.value).slice(0, 12);
const selectedColors = () => Array.from(elements.colors.querySelectorAll('input[type="checkbox"]:checked')).map((item) => item.value);
const selectedColorMode = () => document.querySelector('input[name="color-mode"]:checked')?.value === "fixed_multicolor" ? "fixed_multicolor" : "customer_choice";
const slug = (value) => String(value || "hooma-product").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u10a0-\u10ff]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "hooma-product";

function printTimeInMinutes() {
  const hours = numeric(elements.timeHours);
  const minutes = numeric(elements.timeMinutes);
  if (hours === null && minutes === null) return null;
  if (!Number.isInteger(hours ?? 0) || !Number.isInteger(minutes ?? 0) || (hours ?? 0) < 0 || (minutes ?? 0) < 0 || (minutes ?? 0) > 59) {
    show("ბეჭდვის დრო სწორად შეავსე: საათი უნდა იყოს მთელი რიცხვი, წუთი კი 0-დან 59-მდე.", "error");
    return undefined;
  }
  const total = (hours ?? 0) * 60 + (minutes ?? 0);
  return total > 0 ? total : null;
}

function syncDraft() {
  if (!draft) return null;
  const colorMode = selectedColorMode();
  const colors = selectedColors();
  const minimumColors = colorMode === "fixed_multicolor" ? 2 : 1;
  if (colors.length < minimumColors) {
    show(colorMode === "fixed_multicolor" ? "AMS პროდუქტისთვის მონიშნე მინიმუმ ორი ფერი." : "მონიშნე მინიმუმ ერთი ფერი.", "error");
    return null;
  }
  const printTimeMinutes = printTimeInMinutes();
  if (printTimeMinutes === undefined) return null;
  draft.product.name = elements.name.value.trim() || null;
  draft.product.description = elements.description.value.trim() || null;
  draft.product.media.imageUrls = selectedImages();
  draft.product.technical.material = elements.material.value.trim() || null;
  draft.product.technical.weightGrams = numeric(elements.weight);
  draft.product.technical.printTimeMinutes = printTimeMinutes;
  draft.product.technical.colorMode = colorMode;
  draft.product.technical.colors = colors;
  return draft;
}

function updateImageCount() {
  elements.imageCount.textContent = `${selectedImages().length} არჩეული`;
}

function updateColorHint() {
  elements.colorHint.textContent = selectedColorMode() === "fixed_multicolor"
    ? "მონიშნე AMS-ის ფიქსირებულ კომბინაციაში შემავალი მინიმუმ ორი ფერი."
    : "მონიშნე მომხმარებლისთვის ხელმისაწვდომი მინიმუმ ერთი ფერი.";
}

function renderColorOptions() {
  elements.colors.replaceChildren();
  PRODUCT_COLORS.forEach((color) => {
    const label = document.createElement("label");
    label.className = "color-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = color.name;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = color.hex;
    const name = document.createElement("span");
    name.className = "color-name";
    name.textContent = color.name;
    label.append(checkbox, swatch, name);
    elements.colors.append(label);
  });
}

async function downloadJson(data, saveAs, folderName = slug(data.product.name)) {
  const encoded = encodeURIComponent(JSON.stringify(data, null, 2));
  return chrome.downloads.download({
    url: `data:application/json;charset=utf-8,${encoded}`,
    filename: `hooma-import/${folderName}/product.hooma.json`,
    saveAs,
  });
}

function render(data) {
  draft = data;
  const technical = data.product.technical;
  elements.source.textContent = data.source.url;
  elements.name.value = data.product.name ?? "";
  elements.description.value = data.product.description ?? "";
  elements.material.value = technical.material ?? "";
  elements.weight.value = technical.weightGrams ?? "";
  elements.timeHours.value = technical.printTimeMinutes === null ? "" : Math.floor(technical.printTimeMinutes / 60);
  elements.timeMinutes.value = technical.printTimeMinutes === null ? "" : Math.round(technical.printTimeMinutes % 60);
  const colorMode = technical.colorMode === "fixed_multicolor" ? "fixed_multicolor" : "customer_choice";
  const modeInput = document.querySelector(`input[name="color-mode"][value="${colorMode}"]`);
  if (modeInput) modeInput.checked = true;
  const importedColors = new Set(Array.isArray(technical.colors) ? technical.colors : []);
  elements.colors.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => { checkbox.checked = importedColors.has(checkbox.value); });
  updateColorHint();
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

renderColorOptions();
document.querySelectorAll('input[name="color-mode"]').forEach((input) => input.addEventListener("change", updateColorHint));

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
  await downloadJson(data, true);
  show("Hooma JSON მზადაა. ახლა შემოიტანე Admin → პროდუქტები → ახალი პროდუქტი გვერდზე.", "ok");
});

elements.downloadPackage.addEventListener("click", async () => {
  const data = syncDraft();
  if (!data) return;
  const images = data.product.media.imageUrls;
  const directVideo = data.product.media.videoUrl && /\.(?:mp4|webm)(?:$|\?)/i.test(data.product.media.videoUrl)
    ? data.product.media.videoUrl
    : null;
  if (!images.length) { show("სრულ პაკეტს მინიმუმ ერთი ფოტო სჭირდება.", "error"); return; }
  elements.downloadPackage.disabled = true;
  const packageFolder = `${slug(data.product.name)}-${Date.now()}`;
  let failures = 0;
  try {
    await downloadJson(data, false, packageFolder);
  } catch { failures += 1; }
  for (let index = 0; index < images.length; index += 1) {
    try {
      const pathname = new URL(images[index]).pathname;
      const extension = pathname.match(/\.(jpe?g|png|webp)(?:$|\/)/i)?.[1]?.toLowerCase() ?? "jpg";
      await chrome.downloads.download({
        url: images[index],
        filename: `hooma-import/${packageFolder}/image-${String(index + 1).padStart(2, "0")}.${extension}`,
        saveAs: false,
      });
    } catch { failures += 1; }
  }
  if (directVideo) {
    try {
      const extension = new URL(directVideo).pathname.toLowerCase().endsWith(".webm") ? "webm" : "mp4";
      await chrome.downloads.download({
        url: directVideo,
        filename: `hooma-import/${packageFolder}/video.${extension}`,
        saveAs: false,
      });
    } catch { failures += 1; }
  }
  elements.downloadPackage.disabled = false;
  const total = 1 + images.length + (directVideo ? 1 : 0);
  show(
    failures
      ? `პაკეტის ${total - failures}/${total} ფაილი ჩამოიტვირთა; ${failures} ფაილი წყარომ დაბლოკა.`
      : `სრული პაკეტი ჩამოიტვირთა: JSON და ${images.length} ფოტო${directVideo ? ", ვიდეო" : ""}.`,
    failures ? "" : "ok",
  );
});
