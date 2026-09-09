const YOUTUBE_HOSTNAMES = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{6,20}$/;

export function canonicalYoutubeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid YouTube URL");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Enter a valid YouTube URL");
  }

  const hostname = url.hostname.toLowerCase();
  const videoId = hostname === "youtu.be"
    ? url.pathname.split("/").filter(Boolean)[0]
    : YOUTUBE_HOSTNAMES.has(hostname) && url.pathname === "/watch"
      ? url.searchParams.get("v")
      : null;

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error("Enter a valid YouTube video URL");
  }

  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
