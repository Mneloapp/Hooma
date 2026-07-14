(() => {
  const SOURCE = "hooma-makerworld-capture-v1";
  const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
  const relevantUrl = (value) => /\/(api|graphql)\/|design|model|profile/i.test(String(value ?? ""));

  const publishText = (url, text) => {
    if (!relevantUrl(url) || typeof text !== "string" || text.length > MAX_RESPONSE_BYTES) return;
    const trimmed = text.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return;
    try {
      const payload = JSON.parse(trimmed);
      window.postMessage({ source: SOURCE, type: "json-response", url: String(url), payload }, "*");
    } catch {
      // Only valid JSON responses are useful to the extractor.
    }
  };

  const nativeFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const url = response.url || String(args[0] ?? "");
      if (relevantUrl(url)) response.clone().text().then((text) => publishText(url, text)).catch(() => undefined);
    } catch {
      // Never interfere with MakerWorld's own network request.
    }
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__hoomaResponseUrl = String(url ?? "");
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function patchedSend(...args) {
    this.addEventListener("load", () => {
      try {
        const url = this.responseURL || this.__hoomaResponseUrl;
        if (this.responseType === "" || this.responseType === "text") publishText(url, this.responseText);
        else if (this.responseType === "json" && this.response) {
          window.postMessage({ source: SOURCE, type: "json-response", url: String(url), payload: this.response }, "*");
        }
      } catch {
        // Never interfere with MakerWorld's own network request.
      }
    }, { once: true });
    return nativeSend.apply(this, args);
  };
})();
