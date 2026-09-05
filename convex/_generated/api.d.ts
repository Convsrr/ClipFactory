/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiActions from "../aiActions.js";
import type * as aiData from "../aiData.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as clips from "../clips.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as lib_aiConfig from "../lib/aiConfig.js";
import type * as lib_aiProvider from "../lib/aiProvider.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_clipAnalysis from "../lib/clipAnalysis.js";
import type * as lib_clipDiscoveryPrompt from "../lib/clipDiscoveryPrompt.js";
import type * as lib_presenters from "../lib/presenters.js";
import type * as lib_stages from "../lib/stages.js";
import type * as lib_validators from "../lib/validators.js";
import type * as processing from "../processing.js";
import type * as projects from "../projects.js";
import type * as renderJobs from "../renderJobs.js";
import type * as users from "../users.js";
import type * as worker from "../worker.js";
import type * as workerData from "../workerData.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiActions: typeof aiActions;
  aiData: typeof aiData;
  auth: typeof auth;
  billing: typeof billing;
  clips: typeof clips;
  dashboard: typeof dashboard;
  http: typeof http;
  "lib/aiConfig": typeof lib_aiConfig;
  "lib/aiProvider": typeof lib_aiProvider;
  "lib/auth": typeof lib_auth;
  "lib/clipAnalysis": typeof lib_clipAnalysis;
  "lib/clipDiscoveryPrompt": typeof lib_clipDiscoveryPrompt;
  "lib/presenters": typeof lib_presenters;
  "lib/stages": typeof lib_stages;
  "lib/validators": typeof lib_validators;
  processing: typeof processing;
  projects: typeof projects;
  renderJobs: typeof renderJobs;
  users: typeof users;
  worker: typeof worker;
  workerData: typeof workerData;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
