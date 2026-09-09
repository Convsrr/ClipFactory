type RuntimeEnvironment = Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "NEXT_PUBLIC_CONVEX_URL" | "CLIPFACTORY_AUTH_DISABLED">>;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export function isLocalAuthDisabled(environment: RuntimeEnvironment = process.env) {
  return environment.NODE_ENV === "development" && TRUE_VALUES.has(environment.CLIPFACTORY_AUTH_DISABLED?.trim().toLowerCase() ?? "");
}

export function isBackendConfigured(environment: RuntimeEnvironment = process.env) {
  return Boolean(environment.NEXT_PUBLIC_CONVEX_URL?.trim()) && !isLocalAuthDisabled(environment);
}
