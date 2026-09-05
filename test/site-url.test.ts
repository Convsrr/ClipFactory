import assert from "node:assert/strict";
import test from "node:test";
import { resolveSiteUrl } from "../src/lib/site-url";

test("empty site URL falls back to a build-safe local origin", () => {
  assert.equal(resolveSiteUrl(""), "http://localhost:3000");
  assert.equal(resolveSiteUrl("   "), "http://localhost:3000");
});

test("malformed and non-web site URLs fall back safely", () => {
  assert.equal(resolveSiteUrl("not-a-url"), "http://localhost:3000");
  assert.equal(resolveSiteUrl("ftp://example.com"), "http://localhost:3000");
});

test("valid site URLs are trimmed and normalized to their origin", () => {
  assert.equal(resolveSiteUrl("  https://clipfactory.example/app/  "), "https://clipfactory.example");
});
