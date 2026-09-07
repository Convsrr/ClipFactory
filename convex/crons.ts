import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("recover expired worker leases", { minutes: 1 }, internal.renderJobs.watchdog, {});
crons.interval("expire abandoned upload intents", { hours: 1 }, internal.projects.expireUploadIntents, {});

export default crons;
