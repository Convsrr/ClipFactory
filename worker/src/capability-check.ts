import { checkMediaCapabilities } from "./ffmpeg.js";
import { CAPABILITY_REQUIREMENTS, requiredCapabilitiesReady } from "./health.js";
import { storageConfigured } from "./storage.js";

async function main() {
  const capabilities = {
    ...(await checkMediaCapabilities()),
    storage: storageConfigured(),
    transcription: Boolean(process.env.WHISPER_BASE_URL?.trim()),
    faceTracker: Boolean(process.env.FACE_TRACKER_URL?.trim()),
  };
  const requiredReady = requiredCapabilitiesReady(capabilities);
  process.stdout.write(`${JSON.stringify({ ok: requiredReady, capabilities, capabilityRequirements: CAPABILITY_REQUIREMENTS }, null, 2)}\n`);
  if (!requiredReady) process.exitCode = 1;
}

void main();
