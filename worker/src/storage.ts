import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"), secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY") },
});

const bucket = requiredEnv("R2_BUCKET");

export async function downloadObject(key: string, destination: string) {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error(`Object ${key} has no body`);
  await pipeline(response.Body as NodeJS.ReadableStream, createWriteStream(destination));
}

export async function uploadObject(key: string, source: string, contentType: string) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(source), ContentType: contentType }));
  return publicUrl(key);
}

export function publicUrl(key: string) {
  const base = process.env.R2_PUBLIC_URL?.trim();
  return base ? `${base.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}` : undefined;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
