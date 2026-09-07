# ClipFactory

ClipFactory turns a long video into ranked, captioned 9:16 clips. The MVP covers one focused path: sign in, upload a video or add a YouTube URL, process it, review the strongest moments, change clip copy, and download the renders.

The app opens in a clearly labelled preview mode when Convex is not configured. Preview projects are static sample data; they never enter billing, usage, or processing records.

## Stack

- Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS, and shadcn/Base UI
- Convex for auth, product data, credit accounting, and durable pipeline orchestration
- Cloudflare R2 or another S3-compatible object store for source and rendered media
- A separate Node worker for FFmpeg, `yt-dlp`, transcription, scene detection, captions, and rendering
- g0i.ai as an OpenAI-compatible inference layer for candidate selection, hooks, titles, descriptions, and virality scores
- Stripe Checkout, Customer Portal, and signed webhooks for the Creator plan

g0i.ai does not own uploads, storage, job state, credits, or rendering. Those remain in Convex and the media worker.

## Product routes

Public pages live at `/`, `/pricing`, `/sign-in`, and `/sign-up`. The signed-in product lives at:

- `/app/dashboard`
- `/app/projects`
- `/app/projects/[projectId]`
- `/app/projects/[projectId]/clips/[clipId]`
- `/app/billing`
- `/app/settings`

## Pipeline

Each project runs through these durable workflow stages:

1. `ingest` downloads the source, inspects it, creates a proxy, and extracts audio.
2. `transcribe` calls the configured faster-whisper-compatible service.
3. `analyse` asks g0i.ai for structured clip candidates and validates the JSON with Zod.
4. `scene_detect` records FFmpeg scene changes.
5. `face_track` calls an optional provider through a normalized crop-track contract. Tracks are persisted in absolute source-video seconds with normalized focus coordinates; unavailable, malformed, or low-confidence tracking falls back to deterministic centre framing.
6. `caption_render` selects clip-scoped transcript words when available, segments them into readable phrases, and writes safe-zone ASS captions with preset-specific active-word highlighting.
7. `clip_render` builds a reusable crop plan, smooths focal movement, resets at scene boundaries, dynamically reframes the source to 1080x1920, burns captions, and uploads MP4s.
8. `thumbnail_render` creates poster frames.

Convex records every stage in `renderJobs` and is the durable queue. Workers poll the authenticated Convex claim endpoint only when they have capacity. A claim is one atomic mutation from `queued` to `running`; it records the worker, attempt, heartbeat, and lease. The workflow waits on one stable event name per render job, so a requeued attempt can still resume the same workflow stage. Worker callbacks are attempt-scoped and idempotent before the workflow applies returned object keys and metadata.

Running jobs use a 10-minute lease and a 30-second heartbeat by default. A one-minute Convex watchdog requeues expired leases with bounded exponential backoff, then permanently fails the stage after three claims. Transient provider, storage, network, 408, 429, and 5xx failures retry; invalid media, invalid payloads, lost leases, and configuration/auth failures do not.

Completed output application is also idempotent. Source-minute charging uses `processing:<projectId>:source-minutes`, transcripts use their render-job ID, clip assets use deterministic project/clip keys, and duplicate callbacks do not send the next workflow event twice.

## Data model

The product tables are `users`, `projects`, `videos`, `transcripts`, `analysisRuns`, `clips`, `captionStyles`, `renderJobs`, and `usageLedger`. Convex Auth adds its own session and account tables.

Every public query and mutation derives the user from the authenticated Convex identity. Project, clip, upload-key, billing, and regeneration access is checked against that user. Credits use an append-only ledger plus a cached balance on the user record.

## Local setup

### 1. Prerequisites

- Node.js 20.9 or newer
- FFmpeg and FFprobe (the worker needs an FFmpeg build with the `subtitles`/libass filter for burned ASS captions)
- `yt-dlp` if YouTube ingestion is enabled
- Convex, R2/S3, g0i.ai, Stripe, and transcription-service accounts for the live pipeline

Install JavaScript dependencies and create local configuration:

```bash
npm install
cp .env.example .env.local
```

Without live service values, `npm run dev` still starts the read-only product preview.

### 2. Convex and auth

Create or select a Convex deployment:

```bash
npx convex dev
```

Then run the Convex Auth setup and follow its prompts:

```bash
npx @convex-dev/auth
```

The commands generate the real `convex/_generated` files and set `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, `CONVEX_SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` in the appropriate environments. Do not copy signing keys into source control.

Set the server-side g0i.ai values and the worker control secrets in the Convex deployment:

```bash
npx convex env set G0I_API_KEY your-key
npx convex env set G0I_BASE_URL https://your-g0i-endpoint.example/v1
npx convex env set G0I_MODEL_FALLBACKS 'gemini-2.5-flash,deepseek-v4-flash,gemini-2.5-flash-lite'
npx convex env set G0I_MODEL_ANALYSIS 'gemini-2.5-flash,deepseek-v4-flash,gemini-2.5-flash-lite'
npx convex env set G0I_MODEL_HOOKS 'gemini-2.5-flash-lite,gemini-2.5-flash,deepseek-v4-flash'
npx convex env set G0I_MODEL_TITLE 'gemini-2.5-flash-lite,gemini-2.5-flash,deepseek-v4-flash'
npx convex env set G0I_MODEL_DESCRIPTION 'gemini-2.5-flash-lite,gemini-2.5-flash,deepseek-v4-flash'
npx convex env set G0I_MODEL_SCORING 'deepseek-v4-flash,gemini-2.5-flash,gemini-2.5-flash-lite'
npx convex env set WORKER_SHARED_SECRET your-random-secret
npx convex env set WORKER_CALLBACK_SECRET your-second-random-secret
npx convex env set WORKER_LEASE_MS 600000
npx convex env set WORKER_MAX_ATTEMPTS 3
```

Each model variable is an ordered, comma-separated fallback list. The provider tries the next model when a model returns an HTTP error, empty output, invalid JSON, or JSON that fails the operation schema. The AI client requires an OpenAI-compatible Chat Completions endpoint with JSON-object response support.

Set one `G0I_MODEL` (or `G0I_MODEL_ANALYSIS`) to use the same configured model for every operation; operation-specific variables override it. `G0I_TIMEOUT_MS`, `G0I_MAX_RETRIES`, `G0I_TEMPERATURE`, `G0I_MAX_OUTPUT_TOKENS`, `G0I_MAX_CANDIDATES`, `G0I_MAX_TRANSCRIPT_CHARS`, and `G0I_MAX_RAW_RESPONSE_CHARS` tune the bounded analysis runtime without changing source code.

### 3. Object storage

Create a private R2/S3 bucket and set the `R2_*` values. `R2_PUBLIC_URL` should be a delivery origin for processed assets; keep source object keys unguessable and private in production.

Upload signing now creates a 24-hour `uploadIntents` record. Project creation must attach the exact authenticated user's pending intent with matching size, MIME type, and filename. An hourly cron marks abandoned intents expired. Object deletion remains deliberately separate: run an R2 cleanup process that reads expired intents and deletes only those exact keys after the recovery window. Never apply a blanket lifecycle rule to attached source objects.

Direct browser uploads require bucket CORS for your app origin:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-app.example"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

### 4. Transcription and worker

`WHISPER_BASE_URL` must accept `POST /transcribe` with a multipart `file`. It should return:

```json
{
  "language": "en",
  "text": "Full transcript",
  "segments": [{ "start": 0, "end": 4.2, "text": "Opening sentence" }],
  "words": [{ "start": 0, "end": 0.4, "word": "Opening", "probability": 0.98 }]
}
```

Start the worker and web app in separate terminals:

```bash
npm run worker:dev
npm run dev
```

The worker exposes only `GET /health`; it no longer accepts pushed jobs. It polls `CONVEX_SITE_URL/worker/claim`, heartbeats to `/worker/heartbeat`, and delivers attempt-scoped results to `/worker/callback`. The Convex HTTP actions authenticate those requests with separate shared and callback secrets. Put both services behind TLS and restrict worker egress/ingress at the infrastructure layer.

Run `npm run worker:check` before starting traffic. It reports FFmpeg, FFprobe, subtitles/libass, yt-dlp, storage, transcription, and optional face-tracker capability without printing paths or credentials. Missing FFmpeg, FFprobe, subtitles, storage, or transcription makes health return 503; yt-dlp and face tracking are optional for upload processing.

Failed projects can resume through authenticated `POST /api/projects/[projectId]/retry`. The backend preserves applied stages and starts a new workflow at the first incomplete stage. A user may process at most three projects concurrently; upload signing, project creation, retry, and metadata regeneration also use per-user token-bucket limits.

### 5. Stripe

Create a recurring Creator price and set `STRIPE_PRICE_CREATOR_MONTHLY`. Configure a webhook for `/api/stripe/webhook` with at least:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

For local webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Set the returned signing secret as `STRIPE_WEBHOOK_SECRET`. Stripe Tax is not enabled by this scaffold; register in the required jurisdictions before enabling automatic tax collection.

## Commands

```bash
npm run test             # Unit plus Convex/worker reliability tests
npm run test:reliability # Claims, leases, callbacks, retries, debits, and auth boundaries
npm run dev              # Next.js development server
npm run typecheck        # App, Convex, and shared TypeScript
npm run worker:typecheck # Worker-specific Node TypeScript
npm run lint             # ESLint
npm run build            # Production Next.js build (webpack)
npm run worker:dev       # Local media worker
npm run worker:check     # Safe binary/service capability report
npm run convex:dev       # Live Convex development sync
```

## Remaining production boundaries

- The automated reliability suite uses `convex-test` and mocked HTTP delivery. Run a disposable, credentialed Convex/R2/transcription environment with a generated long video before paid traffic; the normal test command intentionally needs no external account.
- `worker/src/media-security.ts` is the explicit malware/file-scanner integration boundary. No malware engine is bundled, and FFprobe validation is not presented as malware protection.
- Expired upload intents are recorded but R2 deletion requires a separately deployed cleanup process with access to both Convex cleanup candidates and the bucket. Attached sources are retained for project retry.
- Face tracking remains an integration boundary, not an embedded model. Set `FACE_TRACKER_URL` and optionally `FACE_TRACKER_API_KEY` when a provider is available. The worker validates provider responses, chooses a stable primary subject, smooths crop movement, and keeps rendering with centre framing when the provider is unavailable.
- Caption files use word-level phrase timing and active-word ASS events when timestamps are available, then fall back to segment timing or evenly estimated text timing.
- YouTube ingestion uses `yt-dlp`. Only process content the account is allowed to download, and review platform terms before launch.
- The Creator plan is wired. Add Studio price IDs, plan-specific credit allocations, metered overage policy, refunds, and failed-payment handling before offering those publicly.
- Regeneration currently changes AI text metadata. A caption-style or timing change should enqueue a new caption and clip render rather than overwriting the prior asset.
- Health is process-local. Aggregate worker health and structured JSON logs in the hosting platform to detect fleet-wide capacity or repeated provider failures.
