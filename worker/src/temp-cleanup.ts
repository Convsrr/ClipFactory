import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RELIABILITY_DEFAULTS } from "../../shared/reliability.js";

const TEMP_PREFIX = "clipfactory-";

export async function cleanupStaleWorkerDirectories(now = Date.now()) {
  let removed = 0;
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PREFIX) || !/^clipfactory-[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
    const path = join(tmpdir(), entry.name);
    const details = await stat(path);
    if (now - details.mtimeMs < RELIABILITY_DEFAULTS.staleTempDirectoryMs) continue;
    await rm(path, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}
