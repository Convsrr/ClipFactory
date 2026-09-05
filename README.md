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
5. `face_track` calls an optional face-tracking service; without one it records a centre-crop fallback.
6. `caption_render` writes ASS caption tracks.
7. `clip_render` cuts candidates, reframes them to 1080x1920, burns captions, and uploads MP4s.
8. `thumbnail_render` creates poster frames.

Convex records every stage in `renderJobs`. The worker signs callbacks with a shared secret, and the workflow applies the returned object keys and metadata before moving forward.

## Data model

The product tables are `users`, `projects`, `videos`, `transcripts`, `analysisRuns`, `clips`, `captionStyles`, `renderJobs`, and `usageLedger`. Convex Auth adds its own session and account tables.

Every public query and mutation derives the user from the authenticated Convex identity. Project, clip, upload-key, billing, and regeneration access is checked against that user. Credits use an append-only ledger plus a cached balance on the user record.

## Local setup

### 1. Prerequisites

- Node.js 20.9 or newer
- FFmpeg and FFprobe
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

Set the server-side g0i.ai and worker values in the Convex deployment as well as the web/worker environments that use them:

```bash
npx convex env set G0I_API_KEY your-key
npx convex env set G0I_BASE_URL https://your-g0i-endpoint.example/v1
npx convex env set G0I_MODEL_FALLBACKS 'gemini-2.5-flash,deepseek-v4-flash,gemini-2.5-flash-lite'
npx convex env set G0I_MODEL_ANALYSIS 'gemini-2.5-flash,deepseek-v4-flash,gemini-2.5-flash-lite'
npx convex env set G0I_MODEL_HOOKS 'gemini-2.5-flash-lite,gemini-2.5-flash,deepseek-v4-flash'
npx convex env set G0I_MODEL_TITLE 'gemini-2.5-flash-lite,gemini-2.5-flash,deepseek-v4-flash'
npx convex env set G0I_MODEL_DESCRIPTION 'gemini-2.5-flash-lite,gemini-2.5-flash,deepseek-v4-flash'
npx convex env set G0I_MODEL_SCORING 'deepseek-v4-flash,gemini-2.5-flash,gemini-2.5-flash-lite'
npx convex env set WORKER_BASE_URL https://your-worker.example
npx convex env set WORKER_SHARED_SECRET your-random-secret
npx convex env set WORKER_CALLBACK_SECRET your-second-random-secret
```

Each model variable is an ordered, comma-separated fallback list. The provider tries the next model when a model returns an HTTP error, empty output, invalid JSON, or JSON that fails the operation schema. The AI client requires an OpenAI-compatible Chat Completions endpoint with JSON-object response support.

Set one `G0I_MODEL` (or `G0I_MODEL_ANALYSIS`) to use the same configured model for every operation; operation-specific variables override it. `G0I_TIMEOUT_MS`, `G0I_MAX_RETRIES`, `G0I_TEMPERATURE`, `G0I_MAX_OUTPUT_TOKENS`, `G0I_MAX_CANDIDATES`, `G0I_MAX_TRANSCRIPT_CHARS`, and `G0I_MAX_RAW_RESPONSE_CHARS` tune the bounded analysis runtime without changing source code.

### 3. Object storage

Create a private R2/S3 bucket and set the `R2_*` values. `R2_PUBLIC_URL` should be a delivery origin for processed assets; keep source object keys unguessable and private in production.

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
  "segments": [{ "startSec": 0, "endSec": 4.2, "text": "Opening sentence" }],
  "words": [{ "startSec": 0, "endSec": 0.4, "text": "Opening", "confidence": 0.98 }]
}
```

Start the worker and web app in separate terminals:

```bash
npm run worker:dev
npm run dev
```

The worker exposes `GET /health` and authenticated `POST /jobs`. Put it behind TLS and a private network or strict ingress allowlist in production.

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
npm run dev              # Next.js development server
npm run typecheck        # App, Convex, and shared TypeScript
npm run worker:typecheck # Worker-specific Node TypeScript
npm run lint             # ESLint
npm run build            # Production Next.js build (webpack)
npm run worker:dev       # Local media worker
npm run convex:dev       # Live Convex development sync
```

## MVP tradeoffs and next work

- The worker uses an in-memory concurrency queue. Before running more than one worker or accepting high-value uploads, place dispatch behind a durable queue and add a watchdog that requeues stale `renderJobs`.
- Face tracking is an integration boundary, not an embedded model. The safe fallback is a centre crop; connect a tracker and pass crop tracks into the FFmpeg filter graph for speaker-aware framing.
- Caption files use phrase timing when word timing is unavailable. Add per-word ASS events for karaoke highlighting once the transcription provider contract is fixed.
- YouTube ingestion uses `yt-dlp`. Only process content the account is allowed to download, and review platform terms before launch.
- The Creator plan is wired. Add Studio price IDs, plan-specific credit allocations, metered overage policy, refunds, and failed-payment handling before offering those publicly.
- Regeneration currently changes AI text metadata. A caption-style or timing change should enqueue a new caption and clip render rather than overwriting the prior asset.
- Add malware/media validation, upload expiry cleanup, abuse rate limits, worker observability, and integration tests against disposable Convex/R2/Stripe test resources before paid production traffic.
