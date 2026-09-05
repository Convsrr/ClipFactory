/**
 * Local Convex API shim.
 *
 * `npx convex dev` replaces this file with deployment-generated output.
 */
import { anyApi, componentsGeneric } from "convex/server";

export const api = anyApi;
export const internal = anyApi;
export const components = componentsGeneric();
