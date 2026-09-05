/**
 * Local Convex API types.
 *
 * `npx convex dev` replaces this file with deployment-generated output.
 */
import type * as aiActions from "../aiActions.js";
import type * as aiData from "../aiData.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as clips from "../clips.js";
import type * as dashboard from "../dashboard.js";
import type * as processing from "../processing.js";
import type * as projects from "../projects.js";
import type * as renderJobs from "../renderJobs.js";
import type * as users from "../users.js";
import type * as worker from "../worker.js";
import type * as workerData from "../workerData.js";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  aiActions: typeof aiActions;
  aiData: typeof aiData;
  auth: typeof auth;
  billing: typeof billing;
  clips: typeof clips;
  dashboard: typeof dashboard;
  processing: typeof processing;
  projects: typeof projects;
  renderJobs: typeof renderJobs;
  users: typeof users;
  worker: typeof worker;
  workerData: typeof workerData;
}>;

export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

// Component types depend on a configured Convex deployment. The local shim is
// intentionally permissive; Convex codegen will replace it with the exact API.
export declare const components: any;
