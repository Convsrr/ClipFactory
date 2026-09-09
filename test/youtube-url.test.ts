import assert from "node:assert/strict";
import test from "node:test";
import { canonicalYoutubeUrl } from "../shared/youtube-url";

test("canonicalizes supported YouTube links without URL mutation", () => {
  assert.equal(
    canonicalYoutubeUrl("https://www.youtube.com/watch?v=KABnrIJZYQo&t=42#start"),
    "https://www.youtube.com/watch?v=KABnrIJZYQo",
  );
  assert.equal(
    canonicalYoutubeUrl("https://youtu.be/KABnrIJZYQo?si=tracking"),
    "https://www.youtube.com/watch?v=KABnrIJZYQo",
  );
});

test("rejects malformed, credential-bearing, or non-YouTube links", () => {
  assert.throws(() => canonicalYoutubeUrl("not-a-url"), /valid YouTube URL/);
  assert.throws(() => canonicalYoutubeUrl("https://user:pass@youtube.com/watch?v=KABnrIJZYQo"), /valid YouTube URL/);
  assert.throws(() => canonicalYoutubeUrl("https://youtube.com:8443/watch?v=KABnrIJZYQo"), /valid YouTube URL/);
  assert.throws(() => canonicalYoutubeUrl("https://example.com/watch?v=KABnrIJZYQo"), /valid YouTube/);
  assert.throws(() => canonicalYoutubeUrl("https://www.youtube.com/watch?v=bad"), /valid YouTube video URL/);
});
