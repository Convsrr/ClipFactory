export type MediaSafetyScanner = (input: { path: string; objectKey: string | null }) => Promise<{ clean: boolean; reason?: string }>;

let scanner: MediaSafetyScanner | null = null;

export function registerMediaSafetyScanner(nextScanner: MediaSafetyScanner | null) {
  scanner = nextScanner;
}

export async function scanSourceMedia(path: string, objectKey: string | null) {
  if (!scanner) return { configured: false, clean: true } as const;
  const result = await scanner({ path, objectKey });
  return { configured: true, ...result } as const;
}
