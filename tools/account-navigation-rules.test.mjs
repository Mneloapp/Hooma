import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isAccountLinkActive } from "../components/account/account-navigation.ts";

test("account overview is active only on the exact overview route", () => {
  assert.equal(isAccountLinkActive("/account", "/account"), true);
  assert.equal(isAccountLinkActive("/account/", "/account"), true);
  assert.equal(isAccountLinkActive("/account/orders", "/account"), false);
});

test("account sections remain active on nested routes without matching lookalikes", () => {
  assert.equal(isAccountLinkActive("/account/orders", "/account/orders"), true);
  assert.equal(isAccountLinkActive("/account/orders/123", "/account/orders"), true);
  assert.equal(isAccountLinkActive("/account/orders/123/", "/account/orders/"), true);
  assert.equal(isAccountLinkActive("/account/orders-old", "/account/orders"), false);
  assert.equal(isAccountLinkActive(null, "/account/orders"), false);
});

test("account navigation exposes its active item to assistive technology", () => {
  const source = readFileSync(new URL("../components/account/AccountLayout.tsx", import.meta.url), "utf8");

  assert.match(source, /usePathname\(\)/);
  assert.match(source, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(source, /aria-label=/);
});

test("global header highlights the active orders destination", () => {
  const source = readFileSync(new URL("../components/Header.tsx", import.meta.url), "utf8");

  assert.match(source, /const ordersActive = pathname === ["']\/account\/orders["']/);
  assert.match(source, /aria-current=\{ordersActive \? ["']page["'] : undefined\}/);
  assert.match(source, /ordersActive \? ["']bg-hooma-secondary font-bold text-hooma-text shadow-sm["']/);
  assert.match(source, /utilityLinks\.map[\s\S]*aria-current=\{active \? ["']page["'] : undefined\}/);
});
