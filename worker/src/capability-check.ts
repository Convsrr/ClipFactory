import { checkMediaCapabilities } from "./ffmpeg.js";
import { CAPABILITY_REQUIREMENTS, requiredCapabilitiesReady } from "./health.js";
import { storageConfigured } from "./storage.js";
import { transcriptionConfigured } from "./transcription.js";
import { loadWorkerEnv } from "./env.js";

async function main() {
  loadWorkerEnv();
  const capabilities = {
    ...(await checkMediaCapabilities()),
    storage: storageConfigured(),
    transcription: transcriptionConfigured(),
    faceTracker: Boolean(process.env.FACE_TRACKER_URL?.trim()),
  };
  const requiredReady = requiredCapabilitiesReady(capabilities);
  process.stdout.write(`${JSON.stringify({ ok: requiredReady, capabilities, capabilityRequirements: CAPABILITY_REQUIREMENTS }, null, 2)}\n`);
  if (!requiredReady) process.exitCode = 1;
}

void main();
