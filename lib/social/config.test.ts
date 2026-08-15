import assert from "node:assert/strict";
import test from "node:test";

import {
  instagramOAuthEnabled,
  instagramPublishingEnabled,
  socialPublishingEnabled,
} from "./config";

const FLAG_NAMES = [
  "HOOMA_SOCIAL_PUBLISHING_ENABLED",
  "HOOMA_INSTAGRAM_OAUTH_ENABLED",
  "HOOMA_INSTAGRAM_PUBLISHING_ENABLED",
] as const;

function withFlags(
  values: Partial<Record<(typeof FLAG_NAMES)[number], string>>,
  assertion: () => void,
) {
  const previous = Object.fromEntries(
    FLAG_NAMES.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of FLAG_NAMES) delete process.env[name];
    for (const [name, value] of Object.entries(values)) process.env[name] = value;
    assertion();
  } finally {
    for (const name of FLAG_NAMES) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("Instagram OAuth and publishing default off", () => {
  withFlags({}, () => {
    assert.equal(socialPublishingEnabled(), false);
    assert.equal(instagramOAuthEnabled(), false);
    assert.equal(instagramPublishingEnabled(), false);
  });
});

test("dedicated Instagram OAuth gate keeps refresh on while publishing is off", () => {
  withFlags({
    HOOMA_SOCIAL_PUBLISHING_ENABLED: "0",
    HOOMA_INSTAGRAM_OAUTH_ENABLED: "1",
    HOOMA_INSTAGRAM_PUBLISHING_ENABLED: "0",
  }, () => {
    assert.equal(instagramOAuthEnabled(), true);
    assert.equal(instagramPublishingEnabled(), false);
  });
});

test("legacy global gate is only a migration fallback for absent OAuth flag", () => {
  withFlags({ HOOMA_SOCIAL_PUBLISHING_ENABLED: "1" }, () => {
    assert.equal(instagramOAuthEnabled(), true);
    assert.equal(instagramPublishingEnabled(), false);
  });
  withFlags({
    HOOMA_SOCIAL_PUBLISHING_ENABLED: "1",
    HOOMA_INSTAGRAM_OAUTH_ENABLED: "0",
  }, () => {
    assert.equal(instagramOAuthEnabled(), false);
  });
  withFlags({
    HOOMA_SOCIAL_PUBLISHING_ENABLED: "1",
    HOOMA_INSTAGRAM_OAUTH_ENABLED: "",
  }, () => {
    assert.equal(instagramOAuthEnabled(), false);
  });
});

test("Instagram publishing requires both explicit publishing gates", () => {
  withFlags({
    HOOMA_SOCIAL_PUBLISHING_ENABLED: "0",
    HOOMA_INSTAGRAM_OAUTH_ENABLED: "1",
    HOOMA_INSTAGRAM_PUBLISHING_ENABLED: "1",
  }, () => {
    assert.equal(instagramOAuthEnabled(), true);
    assert.equal(instagramPublishingEnabled(), false);
  });
  withFlags({
    HOOMA_SOCIAL_PUBLISHING_ENABLED: "1",
    HOOMA_INSTAGRAM_OAUTH_ENABLED: "1",
    HOOMA_INSTAGRAM_PUBLISHING_ENABLED: "1",
  }, () => {
    assert.equal(instagramPublishingEnabled(), true);
  });
});

test("non-binary flag spellings fail closed", () => {
  withFlags({
    HOOMA_SOCIAL_PUBLISHING_ENABLED: "true",
    HOOMA_INSTAGRAM_OAUTH_ENABLED: "true",
    HOOMA_INSTAGRAM_PUBLISHING_ENABLED: "true",
  }, () => {
    assert.equal(socialPublishingEnabled(), false);
    assert.equal(instagramOAuthEnabled(), false);
    assert.equal(instagramPublishingEnabled(), false);
  });
});
