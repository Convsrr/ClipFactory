const LOCAL_APP_URL = "http://localhost:3000";

export function resolveSiteUrl(value: string | null | undefined = process.env.NEXT_PUBLIC_APP_URL) {
  return parseSiteUrl(value) ?? LOCAL_APP_URL;
}

export function parseSiteUrl(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
