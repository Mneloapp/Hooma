(() => {
  const SOURCE = "hooma-makerworld-capture-v1";
  const responses = [];

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || message?.source !== SOURCE || message?.type !== "json-response") return;
    if (!message.payload || typeof message.payload !== "object") return;
    responses.push({ url: String(message.url ?? "").slice(0, 2000), payload: message.payload });
    if (responses.length > 40) responses.shift();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "HOOMA_EXTRACT") return false;
    try {
      sendResponse({ ok: true, data: globalThis.HoomaMakerWorldExtractor.extract(responses) });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Extraction failed" });
    }
    return false;
  });
})();
