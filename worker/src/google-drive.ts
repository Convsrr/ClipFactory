import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { WorkerError } from "./errors.js";

const MAX_INTERSTITIAL_BYTES = 2 * 1024 * 1024;
const DRIVE_HOSTS = new Set(["drive.google.com", "www.drive.google.com", "drive.usercontent.google.com"]);
const DRIVE_FILE_ID = /^[a-zA-Z0-9_-]{3,200}$/;

export type DownloadProgress = (downloadedBytes: number, totalBytes: number | null) => void;

export function extractGoogleDriveFileId(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !DRIVE_HOSTS.has(url.hostname.toLowerCase())) return null;

  const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/i);
  const candidate = pathMatch?.[1] ?? url.searchParams.get("id");
  return candidate && DRIVE_FILE_ID.test(candidate) ? candidate : null;
}

export function canonicalGoogleDriveUrl(fileId: string) {
  if (!DRIVE_FILE_ID.test(fileId)) throw new Error("Invalid Google Drive file ID");
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function buildGoogleDriveDownloadUrl(fileId: string, confirmed = false) {
  if (!DRIVE_FILE_ID.test(fileId)) throw new Error("Invalid Google Drive file ID");
  const url = new URL("https://drive.google.com/uc");
  url.searchParams.set("export", "download");
  url.searchParams.set("id", fileId);
  if (confirmed) url.searchParams.set("confirm", "t");
  return url.toString();
}

export async function downloadGoogleDrive(
  sourceUrl: string,
  destination: string,
  maxBytes: number,
  onProgress: DownloadProgress = () => undefined,
) {
  const fileId = extractGoogleDriveFileId(sourceUrl);
  if (!fileId) throw new WorkerError("INVALID_MEDIA", "Google Drive link is invalid", false);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new WorkerError("CONFIGURATION_ERROR", "Google Drive size limit is invalid", false);

  let cookie = "";
  let response = await requestDownload(buildGoogleDriveDownloadUrl(fileId), cookie);
  cookie = mergeCookies(cookie, response.setCookie);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!response.response.ok) {
      throw new WorkerError("SOURCE_UNAVAILABLE", "Google Drive link is not publicly downloadable", false);
    }
    if (isFileResponse(response.response)) {
      await writeResponse(response.response, destination, maxBytes, onProgress);
      return;
    }

    const html = await readBoundedText(response.response, MAX_INTERSTITIAL_BYTES);
    if (looksPrivate(html)) {
      throw new WorkerError("SOURCE_UNAVAILABLE", "Google Drive must be shared as Anyone with the link (Viewer)", false);
    }
    const retryUrl = parseGoogleDriveDownloadForm(html, response.response.url || buildGoogleDriveDownloadUrl(fileId), fileId)
      ?? buildGoogleDriveDownloadUrl(fileId, true);
    response = await requestDownload(retryUrl, cookie);
    cookie = mergeCookies(cookie, response.setCookie);
  }

  throw new WorkerError("SOURCE_UNAVAILABLE", "Google Drive did not return a downloadable video", false);
}

export function parseGoogleDriveDownloadForm(html: string, baseUrl: string, fileId: string) {
  const formTag = html.match(/<form\b[^>]*>/i)?.[0];
  const action = formTag ? readAttribute(formTag, "action") : null;
  const actionUrl = new URL(action ? decodeHtmlEntities(action) : buildGoogleDriveDownloadUrl(fileId, true), baseUrl);
  if (!isAllowedDriveUrl(actionUrl)) return null;

  const params = new URLSearchParams();
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const input = match[0];
    const name = readAttribute(input, "name");
    if (!name) continue;
    const value = readAttribute(input, "value") ?? "";
    params.set(name, decodeHtmlEntities(value));
  }
  if (!params.has("id")) params.set("id", fileId);
  if (!params.has("export")) params.set("export", "download");
  if (!params.has("confirm")) params.set("confirm", "t");
  actionUrl.search = params.toString();
  return actionUrl.toString();
}

async function requestDownload(url: string, cookie: string) {
  const parsed = new URL(url);
  if (!isAllowedDriveUrl(parsed)) throw new WorkerError("INVALID_MEDIA", "Google Drive download URL is not allowed", false);
  try {
    const response = await fetch(parsed, {
      headers: {
        Accept: "video/*,application/octet-stream,text/html;q=0.8",
        ...(cookie ? { Cookie: cookie } : {}),
        "User-Agent": "ClipFactory worker",
      },
      redirect: "follow",
    });
    if (!response.ok && response.status !== 403 && response.status !== 404) {
      throw new WorkerError("SOURCE_UNAVAILABLE", `Google Drive returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    }
    return { response, setCookie: readSetCookie(response.headers) };
  } catch (error) {
    if (error instanceof WorkerError) throw error;
    throw new WorkerError("SOURCE_UNAVAILABLE", "Google Drive could not be reached", true, { cause: error });
  }
}

function isFileResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  return !contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/json");
}

async function writeResponse(response: Response, destination: string, maxBytes: number, onProgress: DownloadProgress) {
  const totalHeader = response.headers.get("content-length");
  const totalBytes = totalHeader && /^\d+$/.test(totalHeader) ? Number(totalHeader) : null;
  if (totalBytes !== null && totalBytes > maxBytes) {
    throw new WorkerError("INVALID_MEDIA", sourceLimitMessage(maxBytes), false);
  }
  if (!response.body) throw new WorkerError("SOURCE_UNAVAILABLE", "Google Drive returned an empty download", false);

  let downloadedBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloadedBytes += chunk.byteLength;
      if (downloadedBytes > maxBytes) {
        callback(new WorkerError("INVALID_MEDIA", sourceLimitMessage(maxBytes), false));
        return;
      }
      onProgress(downloadedBytes, totalBytes);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as unknown as import("node:stream/web").ReadableStream), limiter, createWriteStream(destination, { flags: "wx" }));
  if (downloadedBytes <= 0) throw new WorkerError("INVALID_MEDIA", "Google Drive returned an empty video", false);
}

function sourceLimitMessage(maxBytes: number) {
  const gibibytes = Math.round(maxBytes / (1024 ** 3));
  return `Google Drive video exceeds the ${gibibytes} GB source limit`;
}

async function readBoundedText(response: Response, limit: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw new WorkerError("SOURCE_UNAVAILABLE", "Google Drive returned an unreadable download page", false);
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function looksPrivate(html: string) {
  return /service.?login|accounts\.google\.com|sign\s*in|request access|you need permission/i.test(html);
}

function isAllowedDriveUrl(url: URL) {
  return url.protocol === "https:" && DRIVE_HOSTS.has(url.hostname.toLowerCase());
}

function readAttribute(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ?? null;
}

function decodeHtmlEntities(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&#x27;", "'");
}

function readSetCookie(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  return withGetSetCookie.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
}

function mergeCookies(existing: string, setCookies: string[]) {
  const values = new Map<string, string>();
  for (const cookie of existing.split(";")) {
    const [name, ...parts] = cookie.trim().split("=");
    if (name && parts.length) values.set(name, parts.join("="));
  }
  for (const cookie of setCookies) {
    const [pair] = cookie.split(";");
    const [name, ...parts] = pair.trim().split("=");
    if (name && parts.length) values.set(name, parts.join("="));
  }
  return [...values.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}
