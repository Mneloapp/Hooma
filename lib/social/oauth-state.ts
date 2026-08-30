import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerConfig, type SocialProvider } from "./config";
import {
  decryptSocialToken,
  encryptSocialToken,
  isEncryptedSocialSecretEnvelope,
} from "./token-crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

function cookieName(provider: SocialProvider) {
  return `hooma_social_${provider}_state`;
}

function stateHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function issueOAuthStateRecord(
  provider: SocialProvider,
  actorId: string,
  redirectUri: string,
) {
  const admin = createAdminClient() as any;
  if (!admin) throw new Error("SOCIAL_DATABASE_UNAVAILABLE");
  const state = randomBytes(32).toString("base64url");
  const hashedState = stateHash(state);
  const verifier = randomBytes(32).toString("base64url");
  const requestedScopes = providerConfig(provider).requiredScopes;
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
  const { error } = await admin.from("social_oauth_states").insert({
    state_hash: hashedState,
    provider,
    actor_id: actorId,
    redirect_uri: redirectUri,
    pkce_verifier_enc: encryptSocialToken(
      verifier,
      provider,
      hashedState,
      "pkce_verifier",
    ),
    requested_scopes: requestedScopes,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`SOCIAL_STATE_STORE_FAILED:${error.code ?? "UNKNOWN"}`);

  const { error: auditError } = await admin.from("audit_log").insert({
    actor_id: actorId,
    action: "social_oauth_started",
    entity_type: "social_connection",
    entity_id: provider,
    metadata: {
      provider,
      scope_count: requestedScopes.length,
      state_expires_at: expiresAt,
    },
  });
  if (auditError) {
    await admin.from("social_oauth_states").delete().eq("state_hash", hashedState);
    throw new Error(`SOCIAL_AUDIT_FAILED:${auditError.code ?? "UNKNOWN"}`);
  }

  const store = await cookies();
  store.set(cookieName(provider), state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_MS / 1000,
  });
  return { state, verifier };
}

export async function issueOAuthState(
  provider: SocialProvider,
  actorId: string,
  redirectUri: string,
) {
  const issued = await issueOAuthStateRecord(provider, actorId, redirectUri);
  return issued.state;
}

export async function issueOAuthStateWithPkce(
  provider: "youtube",
  actorId: string,
  redirectUri: string,
) {
  const issued = await issueOAuthStateRecord(provider, actorId, redirectUri);
  return {
    state: issued.state,
    codeChallenge: createHash("sha256")
      .update(issued.verifier, "utf8")
      .digest("base64url"),
  };
}

async function consumeBrowserState(provider: SocialProvider, queryState: string) {
  const store = await cookies();
  const cookieState = store.get(cookieName(provider))?.value ?? "";
  store.delete(cookieName(provider));
  const left = Buffer.from(cookieState);
  const right = Buffer.from(queryState);
  return Boolean(
    cookieState
    && queryState
    && left.length === right.length
    && timingSafeEqual(left, right),
  );
}

export async function consumeOAuthState(
  provider: SocialProvider,
  actorId: string,
  queryState: string,
) {
  if (!(await consumeBrowserState(provider, queryState))) {
    return false;
  }

  const admin = createAdminClient() as any;
  if (!admin) throw new Error("SOCIAL_DATABASE_UNAVAILABLE");
  const { data, error } = await admin.rpc("consume_social_oauth_state", {
    requested_provider: provider,
    requested_state_hash: stateHash(queryState),
    requested_actor_id: actorId,
  });
  if (error) throw new Error(`SOCIAL_STATE_CONSUME_FAILED:${error.code ?? "UNKNOWN"}`);
  return data === true;
}

export async function consumeExternalOAuthState(
  provider: "facebook",
  actorId: string,
  queryState: string,
) {
  if (!(await consumeBrowserState(provider, queryState))) return false;
  const admin = createAdminClient() as any;
  if (!admin) throw new Error("SOCIAL_DATABASE_UNAVAILABLE");
  const { data, error } = await admin.rpc("consume_external_social_oauth_state_v1", {
    requested_provider: provider,
    requested_state_hash: stateHash(queryState),
    requested_actor_id: actorId,
  });
  if (error) throw new Error(`SOCIAL_STATE_CONSUME_FAILED:${error.code ?? "UNKNOWN"}`);
  return data === true;
}

export async function consumeYouTubeOAuthState(
  actorId: string,
  queryState: string,
) {
  if (!(await consumeBrowserState("youtube", queryState))) return null;
  const admin = createAdminClient() as any;
  if (!admin) throw new Error("SOCIAL_DATABASE_UNAVAILABLE");
  const hashedState = stateHash(queryState);
  const { data, error } = await admin.rpc("consume_youtube_social_oauth_state_v1", {
    requested_state_hash: hashedState,
    requested_actor_id: actorId,
  });
  if (error) throw new Error(`SOCIAL_STATE_CONSUME_FAILED:${error.code ?? "UNKNOWN"}`);
  const record = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : null;
  if (record?.consumed !== true || !isEncryptedSocialSecretEnvelope(record.pkce_verifier_enc)) {
    return null;
  }
  return {
    verifier: decryptSocialToken(
      record.pkce_verifier_enc,
      "youtube",
      hashedState,
      "pkce_verifier",
    ),
  };
}
