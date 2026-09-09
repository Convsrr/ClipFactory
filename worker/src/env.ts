import { loadEnvConfig } from "@next/env";

const silentLog = { info() {}, error() {} };

/** Load the local Next-style env files for standalone worker commands. */
export function loadWorkerEnv() {
  if (process.env.NODE_ENV === "production") return;
  loadEnvConfig(process.cwd(), true, silentLog);
}
