import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { WorkerError } from "./errors.js";

let cachedClient: S3Client | null = null;

export async function downloadObject(key: string, destination: string) {
  assertObjectKey(key);
  try {
    const response = await client().send(new GetObjectCommand({ Bucket: requiredEnv("R2_BUCKET"), Key: key }));
    if (!response.Body) throw new Error("Object has no body");
    await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(destination, { flags: "wx" }));
  } catch (error) {
    throw storageError("download", error);
  }
}

export async function uploadObject(key: string, source: string, contentType: string) {
  assertObjectKey(key);
  try {
    await client().send(new PutObjectCommand({ Bucket: requiredEnv("R2_BUCKET"), Key: key, Body: createReadStream(source), ContentType: contentType }));
    return publicUrl(key);
  } catch (error) {
    throw storageError("upload", error);
  }
}

export function publicUrl(key: string) {
  assertObjectKey(key);
  const base = process.env.R2_PUBLIC_URL?.trim();
  return base ? `${base.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}` : undefined;
}

export function storageConfigured() {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].every((name) => Boolean(process.env[name]?.trim()));
}

function client() {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"), secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY") },
  });
  return cachedClient;
}

function assertObjectKey(key: string) {
  if (!key || key.length > 800 || key.startsWith("/") || key.includes("..") || key.includes("\\") || key.split("/").some((part) => !part)) {
    throw new WorkerError("INVALID_JOB_PAYLOAD", "Object key is invalid", false);
  }
}

function storageError(operation: string, error: unknown) {
  if (error instanceof WorkerError) return error;
  const status = typeof error === "object" && error !== null && "$metadata" in error
    ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode)
    : 0;
  const retryable = !status || status === 408 || status === 429 || status >= 500;
  return new WorkerError("STORAGE_UNAVAILABLE", `Object storage ${operation} failed${status ? ` with HTTP ${status}` : ""}`, retryable, { cause: error });
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new WorkerError("CONFIGURATION_ERROR", `${name} is not configured`, false);
  return value;
}
