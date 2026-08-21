export function canonicalSocialConnectionTimestamp(value: unknown) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 256
    || /[\u0000-\u001f\u007f]/.test(value)
  ) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}
