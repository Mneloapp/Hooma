import assert from "node:assert/strict";
import test from "node:test";

import { canonicalSocialConnectionTimestamp } from "./social-connection-timestamp";

test("connection timestamps normalize Postgres timestamptz without changing the instant", () => {
  assert.equal(
    canonicalSocialConnectionTimestamp("2026-08-21T06:57:00.308+00:00"),
    "2026-08-21T06:57:00.308Z",
  );
  assert.equal(
    canonicalSocialConnectionTimestamp("2026-08-21T10:57:00.308+04:00"),
    "2026-08-21T06:57:00.308Z",
  );
});

test("invalid or control-bearing connection timestamps fail closed", () => {
  assert.equal(canonicalSocialConnectionTimestamp("not-a-date"), null);
  assert.equal(canonicalSocialConnectionTimestamp("2026-08-21T06:57:00Z\nTOKEN"), null);
  assert.equal(canonicalSocialConnectionTimestamp(null), null);
});
