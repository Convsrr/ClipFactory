import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function r2Client() {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export async function createSourceUpload(objectKey: string, mimeType: string, fileSizeBytes: number) {
  const command = new PutObjectCommand({
    Bucket: requiredEnv("R2_BUCKET"),
    Key: objectKey,
    ContentType: mimeType,
    ContentLength: fileSizeBytes,
  });
  return getSignedUrl(r2Client(), command, { expiresIn: 15 * 60 });
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
