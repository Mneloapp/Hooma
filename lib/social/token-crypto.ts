import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { SocialProvider } from "./config";

export type SocialSecretKind = "access_token" | "refresh_token" | "pkce_verifier";

export type EncryptedTokenEnvelope = {
  algorithm: "AES-256-GCM";
  key_id: string;
  key_version: number;
  nonce_b64: string;
  ciphertext_b64: string;
  tag_b64: string;
  aad_sha256: string;
};

type KeyringEntry = string | Record<string, string>;
type Keyring = Record<string, KeyringEntry>;

const ENVELOPE_KEYS = new Set([
  "algorithm",
  "key_id",
  "key_version",
  "nonce_b64",
  "ciphertext_b64",
  "tag_b64",
  "aad_sha256",
]);
const STANDARD_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const LOWER_HEX_64 = /^[a-f0-9]{64}$/;

function positiveKeyVersion(value: string | undefined) {
  if (!value || !/^[1-9][0-9]{0,8}$/.test(value)) {
    throw new Error("SOCIAL_TOKEN_ACTIVE_KEY_VERSION_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("SOCIAL_TOKEN_ACTIVE_KEY_VERSION_INVALID");
  }
  return parsed;
}

function parseKeyring(): Keyring {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEYS_JSON;
  if (!raw) throw new Error("SOCIAL_TOKEN_KEYRING_NOT_CONFIGURED");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("SOCIAL_TOKEN_KEYRING_INVALID_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SOCIAL_TOKEN_KEYRING_INVALID_JSON");
  }
  return parsed as Keyring;
}

function validKeyId(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length >= 3
    && value.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function decodeStandardBase64(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "string" || !STANDARD_BASE64.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.length < minimum
    || decoded.length > maximum
    || decoded.toString("base64") !== value
  ) return null;
  return decoded;
}

function keyFor(keyring: Keyring, keyId: string, keyVersion: number) {
  const entry = keyring[keyId];
  const encoded = typeof entry === "string"
    ? (keyVersion === 1 ? entry : null)
    : entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry[String(keyVersion)]
      : null;
  const key = decodeStandardBase64(encoded, 32, 32);
  if (!key) throw new Error("SOCIAL_TOKEN_ENVELOPE_KEY_UNAVAILABLE");
  return key;
}

function activeKey() {
  const keyId = process.env.SOCIAL_TOKEN_ENCRYPTION_ACTIVE_KID?.trim();
  if (!validKeyId(keyId)) throw new Error("SOCIAL_TOKEN_ACTIVE_KEY_ID_INVALID");
  const keyVersion = positiveKeyVersion(
    process.env.SOCIAL_TOKEN_ENCRYPTION_ACTIVE_KEY_VERSION?.trim(),
  );
  const keyring = parseKeyring();
  return { keyId, keyVersion, key: keyFor(keyring, keyId, keyVersion) };
}

function secretAad(
  provider: SocialProvider,
  kind: SocialSecretKind,
  contextId: string,
  keyId: string,
  keyVersion: number,
) {
  if (
    !contextId
    || contextId.length > 512
    || contextId.includes("\x1f")
    || keyId.includes("\x1f")
  ) throw new Error("SOCIAL_TOKEN_AAD_CONTEXT_INVALID");
  return Buffer.from(
    `hooma-social-secret-v1\x1f${provider}\x1f${kind}\x1f${contextId}\x1f${keyId}\x1f${keyVersion}`,
    "utf8",
  );
}

function aadSha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function isEncryptedSocialSecretEnvelope(
  value: unknown,
): value is EncryptedTokenEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== ENVELOPE_KEYS.size
    || Object.keys(record).some((key) => !ENVELOPE_KEYS.has(key))
    || record.algorithm !== "AES-256-GCM"
    || !validKeyId(record.key_id)
    || !Number.isInteger(record.key_version)
    || Number(record.key_version) <= 0
    || !decodeStandardBase64(record.nonce_b64, 12, 12)
    || !decodeStandardBase64(record.ciphertext_b64, 1, 65_536)
    || !decodeStandardBase64(record.tag_b64, 16, 16)
    || typeof record.aad_sha256 !== "string"
    || !LOWER_HEX_64.test(record.aad_sha256)
  ) return false;
  return true;
}

export function encryptSocialToken(
  token: string,
  provider: SocialProvider,
  contextId: string,
  kind: SocialSecretKind,
): EncryptedTokenEnvelope {
  if (!token) throw new Error("SOCIAL_TOKEN_EMPTY");
  const plaintext = Buffer.from(token, "utf8");
  if (plaintext.length > 65_536) throw new Error("SOCIAL_TOKEN_TOO_LARGE");
  const { keyId, keyVersion, key } = activeKey();
  const nonce = randomBytes(12);
  const aad = secretAad(provider, kind, contextId, keyId, keyVersion);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    algorithm: "AES-256-GCM",
    key_id: keyId,
    key_version: keyVersion,
    nonce_b64: nonce.toString("base64"),
    ciphertext_b64: ciphertext.toString("base64"),
    tag_b64: cipher.getAuthTag().toString("base64"),
    aad_sha256: aadSha256(aad),
  };
}

export function decryptSocialToken(
  envelope: EncryptedTokenEnvelope,
  provider: SocialProvider,
  contextId: string,
  kind: SocialSecretKind,
) {
  if (!isEncryptedSocialSecretEnvelope(envelope)) {
    throw new Error("SOCIAL_TOKEN_ENVELOPE_INVALID");
  }
  const key = keyFor(parseKeyring(), envelope.key_id, envelope.key_version);
  const aad = secretAad(
    provider,
    kind,
    contextId,
    envelope.key_id,
    envelope.key_version,
  );
  const expectedAadHash = Buffer.from(aadSha256(aad), "hex");
  const suppliedAadHash = Buffer.from(envelope.aad_sha256, "hex");
  if (!timingSafeEqual(expectedAadHash, suppliedAadHash)) {
    throw new Error("SOCIAL_TOKEN_AAD_MISMATCH");
  }
  const nonce = decodeStandardBase64(envelope.nonce_b64, 12, 12);
  const tag = decodeStandardBase64(envelope.tag_b64, 16, 16);
  const ciphertext = decodeStandardBase64(envelope.ciphertext_b64, 1, 65_536);
  if (!nonce || !tag || !ciphertext) throw new Error("SOCIAL_TOKEN_ENVELOPE_INVALID");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("SOCIAL_TOKEN_DECRYPT_FAILED");
  }
}
