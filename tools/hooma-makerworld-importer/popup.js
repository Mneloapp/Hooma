const button = document.querySelector("#extract");
const status = document.querySelector("#status");

const show = (message, type = "") => {
  status.className = type;
  status.textContent = message;
};

button.addEventListener("click", async () => {
  button.disabled = true;
  show("მონაცემები იკითხება...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/([a-z0-9-]+\.)*makerworld\.com\//i.test(tab.url ?? "")) {
      throw new Error("გახსენი MakerWorld-ის პროდუქტის გვერდი.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "HOOMA_EXTRACT" });
    if (!response?.ok || !response.data) throw new Error(response?.error || "გვერდის მონაცემები ვერ წავიკითხე. განაახლე გვერდი და სცადე ისევ.");

    await chrome.storage.local.set({ latestHoomaMakerWorldImport: response.data });
    await navigator.clipboard.writeText(JSON.stringify(response.data));
    const data = response.data;
    const summary = [
      `Model: ${data.model_id ?? "—"}`,
      `Profile: ${data.profile_id ?? "—"}`,
      `მასალა: ${data.material ?? "—"}`,
      `წონა: ${data.material_grams ? `${data.material_grams} გ` : "—"}`,
      `დრო: ${data.print_minutes ? `${data.print_minutes} წუთი` : "—"}`,
      `ზომა: ${data.dimensions ? `${data.dimensions.x} × ${data.dimensions.y} × ${data.dimensions.z} მმ` : "—"}`,
      `ფოტოები: ${data.images.length}`,
      data.missing.length ? `აკლია: ${data.missing.join(", ")}` : "ყველა ძირითადი ველი ნაპოვნია.",
      "\nმონაცემები დაკოპირებულია. დაბრუნდი Hooma-ს Review გვერდზე და დააჭირე „იმპორტერიდან შევსება“.",
    ];
    show(summary.join("\n"), data.missing.length ? "" : "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "Importer ვერ გაეშვა.", "error");
  } finally {
    button.disabled = false;
  }
});
