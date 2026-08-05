import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("account credential changes stay session-scoped and reauthenticate password users", async () => {
  const actions = await read("../app/account/settings/actions.ts");

  assert.match(actions, /supabase\.auth\.getUser\(\)/);
  assert.match(actions, /supabase\.auth\.signInWithPassword\(\{/);
  assert.match(actions, /email: user\.email,[\s\S]*password: currentPassword/);
  assert.match(actions, /auth\.updateUser\([\s\S]*email: nextEmail/);
  assert.match(actions, /auth\.updateUser\(\{ password: nextPassword \}\)/);
  assert.doesNotMatch(actions, /updateUserById/);
  assert.doesNotMatch(actions, /createAdminClient/);
  assert.doesNotMatch(actions, /formData[^\n]*["'](?:user_id|role|is_active)["']/);
});

test("password values are not silently trimmed and are length bounded", async () => {
  const actions = await read("../app/account/settings/actions.ts");

  assert.match(actions, /getRawString\(formData, "current_password"\)/);
  assert.match(actions, /getRawString\(formData, "new_password"\)/);
  assert.match(actions, /getRawString\(formData, "confirm_password"\)/);
  assert.doesNotMatch(actions, /getString\(formData, "(?:current_password|new_password|confirm_password)"\)/);
  assert.match(actions, /nextPassword\.length < 8 \|\| nextPassword\.length > 128/);
});

test("confirmed auth email is synchronized from the trusted callback user", async () => {
  const emailChange = await read("../app/auth/email-change/confirm/route.ts");
  const emailTemplate = await read("../supabase/templates/email-change.html");
  const actions = await read("../app/account/settings/actions.ts");

  assert.match(actions, /new URL\("\/auth\/email-change\/confirm", await siteOrigin\(\)\)/);
  assert.match(emailTemplate, /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&amp;type=email_change/);
  assert.match(emailChange, /type !== "email_change"/);
  assert.match(emailChange, /verifyOtp\(\{[\s\S]*type: "email_change"/);
  assert.match(emailChange, /else if \(code\)[\s\S]*exchangeCodeForSession\(code\)[\s\S]*auth\.getUser\(\)/);
  assert.match(emailChange, /update\(\{ email: user\.email, last_login_at:/);
  assert.match(emailChange, /update\(\{ email: user\.email \}\)[\s\S]*eq\("profile_id", user\.id\)/);
  assert.match(emailChange, /user\.new_email \? "pending" : "confirmed"/);
});

test("settings UI is provider-aware and does not show local password controls to OAuth-only users", async () => {
  const page = await read("../app/account/settings/page.tsx");
  const panel = await read("../components/account/AccountSettingsPanel.tsx");

  assert.match(page, /user\.identities\?\.forEach/);
  assert.match(page, /const passwordIdentity = providers\.has\("email"\)/);
  assert.match(panel, /\{passwordIdentity \? \(/);
  assert.match(panel, /<EmailSettings currentEmail=\{currentEmail\} \/>/);
  assert.match(panel, /<PasswordSettings \/>/);
  assert.match(panel, /no separate Hooma password/);
  assert.match(panel, /autoComplete="current-password"/);
  assert.match(panel, /autoComplete="new-password"/);
  assert.match(panel, /emailChangeStatus === "confirmed"/);
  assert.match(panel, /One confirmation was received/);
});

test("settings expose real local language and session controls plus existing profile destinations", async () => {
  const panel = await read("../components/account/AccountSettingsPanel.tsx");
  const actions = await read("../app/account/settings/actions.ts");

  assert.match(panel, /setLanguage\(item\)/);
  assert.match(panel, /href="\/account"/);
  assert.match(panel, /href="\/account\/addresses"/);
  assert.match(panel, /<SessionSettings \/>/);
  assert.match(actions, /auth\.signOut\(\{ scope: "others" \}\)/);
});
