import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildGoogleDriveDownloadUrl, canonicalGoogleDriveUrl, extractGoogleDriveFileId, parseGoogleDriveDownloadForm } from "../worker/src/google-drive";

const fileId = "1zJDibIu_TWD0FTMaVxsatXKcmkAZt5wK";

describe("Google Drive source links", () => {
  test("extracts file IDs from shared file links and canonicalizes them", () => {
    assert.equal(extractGoogleDriveFileId(`https://drive.google.com/file/d/${fileId}/view?usp=drive_link`), fileId);
    assert.equal(canonicalGoogleDriveUrl(fileId), `https://drive.google.com/file/d/${fileId}/view`);
  });

  test("accepts download-style links but rejects non-Google hosts", () => {
    assert.equal(extractGoogleDriveFileId(`https://drive.google.com/uc?export=download&id=${fileId}`), fileId);
    assert.equal(extractGoogleDriveFileId(`https://example.com/file/d/${fileId}`), null);
    assert.equal(extractGoogleDriveFileId("javascript:alert(1)"), null);
  });

  test("preserves Drive confirmation fields without trusting the form host", () => {
    const url = parseGoogleDriveDownloadForm(
      `<form action="https://drive.usercontent.google.com/download"><input type="hidden" name="id" value="${fileId}"><input type="hidden" name="uuid" value="abc123"></form>`,
      "https://drive.google.com/uc",
      fileId,
    );
    assert.notEqual(url, null);
    const parsed = new URL(url as string);
    assert.equal(parsed.hostname, "drive.usercontent.google.com");
    assert.equal(parsed.searchParams.get("id"), fileId);
    assert.equal(parsed.searchParams.get("uuid"), "abc123");
    assert.equal(parsed.searchParams.get("confirm"), "t");
    assert.equal(parseGoogleDriveDownloadForm(`<form action="https://attacker.example/download"></form>`, "https://drive.google.com/uc", fileId), null);
  });

  test("builds a confirmation URL for Drive's large-file interstitial", () => {
    const parsed = new URL(buildGoogleDriveDownloadUrl(fileId, true));
    assert.equal(parsed.hostname, "drive.google.com");
    assert.equal(parsed.searchParams.get("id"), fileId);
    assert.equal(parsed.searchParams.get("confirm"), "t");
  });
});
