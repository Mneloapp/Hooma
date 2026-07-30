import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("signup confirmation uses the dedicated token-hash route", async () => {
  const template = await read("../supabase/templates/confirmation.html");

  assert.match(
    template,
    /\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&amp;type=email&amp;next=\/account/,
  );
  assert.doesNotMatch(template, /\{\{ \.ConfirmationURL \}\}/);
});

test("email confirmation verifies the token without using the OAuth callback", async () => {
  const route = await read("../app/auth/confirm/route.ts");
  const loginPage = await read("../app/login/page.tsx");

  assert.match(route, /verifyOtp\(\{/);
  assert.match(route, /token_hash: tokenHash/);
  assert.match(route, /type: "email"/);
  assert.match(route, /\/login\?error=confirmation/);
  assert.doesNotMatch(route, /error=oauth/);
  assert.match(loginPage, /confirmation:/);
});

test("legacy signup callback failures are not labeled as Google OAuth failures", async () => {
  const actions = await read("../app/auth/actions.ts");
  const callback = await read("../app/auth/callback/route.ts");

  assert.match(actions, /callback\.searchParams\.set\("flow", "email"\)/);
  assert.match(
    callback,
    /requestUrl\.searchParams\.get\("flow"\) === "email" \? "confirmation" : "oauth"/,
  );
});
