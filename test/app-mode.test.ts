import assert from "node:assert/strict";
import test from "node:test";
import { isBackendConfigured, isLocalAuthDisabled } from "../src/lib/app-mode";

test("local auth bypass switches a configured development app to preview mode", () => {
  const environment = {
    NODE_ENV: "development",
    NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
    CLIPFACTORY_AUTH_DISABLED: "true",
  } as const;

  assert.equal(isLocalAuthDisabled(environment), true);
  assert.equal(isBackendConfigured(environment), false);
});

test("production ignores the local auth bypass", () => {
  const environment = {
    NODE_ENV: "production",
    NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
    CLIPFACTORY_AUTH_DISABLED: "true",
  } as const;

  assert.equal(isLocalAuthDisabled(environment), false);
  assert.equal(isBackendConfigured(environment), true);
});

test("an unconfigured app remains in preview mode", () => {
  assert.equal(isBackendConfigured({ NODE_ENV: "development", NEXT_PUBLIC_CONVEX_URL: "" }), false);
});
