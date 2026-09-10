import { defineRateLimits } from "convex-helpers/server/rateLimit";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const { rateLimit } = defineRateLimits({
  uploadSigning: { kind: "token bucket", rate: 20, period: HOUR, capacity: 5 },
  projectCreation: { kind: "token bucket", rate: 12, period: HOUR, capacity: 3 },
  projectRetry: { kind: "token bucket", rate: 6, period: HOUR, capacity: 2 },
  projectRepair: { kind: "token bucket", rate: 6, period: HOUR, capacity: 2 },
  metadataRegeneration: { kind: "token bucket", rate: 20, period: HOUR, capacity: 5 },
});
