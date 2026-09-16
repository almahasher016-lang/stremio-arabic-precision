# Arabic Precision Subtitles — v1.0.0

Independent Arabic-first subtitle addon for Stremio. No code is imported from Stremio-Fetch-Hotfix. No AI, translation generation, or promise of 100% coverage/synchronization.

## What works

- Stremio-compatible `GET /manifest.json` and `GET /subtitles/{movie|series}/{imdb[:season:episode]}.json` routes, optional extra stream metadata, CORS and health endpoint.
- Separate OpenSubtitles REST v1, SubDL REST v2, and Subsource REST v1 providers. Providers require credentials and fail independently.
- Stable IMDb/season/episode matching, reject known mismatched hashes and sizes, conservative release ranking, ordered alternative candidates.
- Authenticated downloads kept server side; expiring HMAC-signed file URLs; bounded archive extraction, legacy Arabic decoding and SRT conversion.
- Per-provider rate queue with 429/Retry-After, bounded payloads, HTTPS host allowlists, cancellation and structured diagnostic logs without credential exposure.
- Bounded memory search/content caches, negative caching only after successful searches, optional durable raw file cache using an attached Railway Volume. Normalization/cache versioning invalidates old content.
- Optional **operator-only** `alass` subtitle-reference synchronization (`ENABLE_REFERENCE_SYNC=false` by default). The server does not receive the video file and does not invent a trusted reference.

**Important limitations:** this is a new, independent implementation, not a feature-for-feature clone of the old project. Source APIs can change; live provider tests must be run with real credentials before production. The cache/rate queue is per-process and is not coordinated across multiple Railway replicas: use ONE replica. Some archive/format variants may be rejected rather than return incorrect Arabic. Subsource schema is checked against public API examples and must pass live contract tests with your own key. The alass binary is not included in the Docker image and is not automatically executed by Stremio.

The HTTP routes implement the public [Stremio Addon Protocol](https://stremio.github.io/stremio-addon-sdk/protocol.html) directly using the Node HTTP server. This avoids unnecessary runtime dependencies; the protocol does not require installing the SDK for simple standalone subtitle addons.

## Run locally

Requires **Node.js >=22.16.0**. No `npm install` is required (there are no external npm dependencies).

1. Copy `.env.example` to `.env`, set the provider credentials and `LINK_SIGNING_SECRET`. This repository intentionally does **not** auto-read `.env`; use the environment settings of your shell or hosting platform. Never commit `.env`.
2. For local development with no secrets, simply run `npm start`; `/manifest.json`, `/health` and tests will work, while subtitle searches will be empty until a provider is configured.
3. Run `npm run check` before deploying. The script validates syntax, checks package and runtime versions, and runs tests.
4. With real provider keys explicitly configured, run `RUN_LIVE_PROVIDER_TESTS=true npm run test:live` (PowerShell: `$env:RUN_LIVE_PROVIDER_TESTS='true'; npm run test:live`). It makes one real search per configured provider. `RUN_LIVE_DOWNLOAD=true` additionally downloads at most one sample from each configured provider, consuming provider quota.

Typical episode call: `/subtitles/series/tt0944947:1:1/filename=Show.S01E01.WEB-DL.mkv&videoHash=0123456789abcdef.json` (URL-encode metadata when building the route). Movies: `/subtitles/movie/tt0133093.json`.

## Railway deployment

1. Create a **new** GitHub repository named `stremio-arabic-precision` and push these files to branch `main`. No existing source repository needs modification.
2. Open the new Railway project `stremio-arabic-precision`. Create a service **from this new GitHub repository**. The included `railway.json` and `Dockerfile` configure the build and `/health` check.
3. Set `NODE_ENV=production`, `PUBLIC_BASE_URL=https://YOUR-SERVICE.up.railway.app`, and a new random 32+ character `LINK_SIGNING_SECRET`. Set `OPENSUBTITLES_API_KEY` **and** `OPENSUBTITLES_TOKEN`, `SUBDL_API_KEY`, and `SUBSOURCE_API_KEY` as applicable. These variables are required for their respective providers; unset or blank keys disable a source. Railway OAuth access exposes old variable *names* only; it cannot reveal or migrate their values automatically. Transfer values using Railway's authenticated UI, not GitHub files or a chat message.
4. Optional persistent cache: attach a Railway Volume at `/app/data`, then set `DATA_DIR=/app/data`. Without a mounted writable volume, leave `DATA_DIR` empty. Limit this service to a single replica; multiple replicas have uncoordinated rate queues and caches.
5. Deploy and confirm `/health` returns HTTP 200 with at least one provider, and `/manifest.json` responds. Probe an actual movie and episode in Stremio; verify an actual returned subtitle URL yields Arabic SRT. **A healthy status alone does not demonstrate that live sources work.**
6. Install `https://YOUR-SERVICE.up.railway.app/manifest.json` through Stremio. Public catalog publication is intentionally disabled until live verification and operational monitoring pass.

### Environment variables

See `.env.example`. Defaults: search 3.5 seconds/provider HTTP call; global request deadline 6 seconds; download 9 seconds/stage; positive search cache 10 minutes, negative cache 45 seconds, raw content cache 24 hours; maximum 12 results; max download 5 MiB. Adjust only after real latency/quotas are measured. The single-process rate queues are conservative placeholders, not guarantees of provider account quotas.

### Authentication

OpenSubtitles download requires a login token as well as an API key. An API key alone does not activate the connector. SubDL uses its current v2 bearer API and Subsource uses `X-API-Key`. Do not copy the old application's ADMIN_TOKEN, personal-vault data or unrelated infrastructure secrets into this project.

### Operational failure triage

Every search receives `X-Request-ID` and structured log events: `provider_search` (`ok`, `rate_limited`, `authentication_failed`, timeout), `search_complete`, `download_failed` and `subtitle_ready`. Logs never include API keys or full download URLs. Distinguish: no results (200 with empty list) vs all providers failed (503) vs signed link expired (403) vs all downloads/normalizers failed (502). Provider-nightly workflow runs one search each night after you configure GitHub Actions secrets. Until secrets are set, it fails visibly rather than claim providers are healthy.

### Reference synchronization (manual only)

Install the official `alass` executable separately, obtain a **trusted reference subtitle** and an incorrect subtitle for the same edition, then run:

```bash
ENABLE_REFERENCE_SYNC=true node scripts/sync-reference.js incorrect.srt trusted-reference.srt output.srt
```

On Windows PowerShell set `$env:ENABLE_REFERENCE_SYNC='true'` first. The tool will validate cue counts and output; manually compare alignment with the video before using it. It is disabled by default and does not affect normal Stremio requests.

## Official references

- [Stremio subtitle handler and metadata](https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/requests/defineSubtitlesHandler.md)
- [OpenSubtitles API documentation](https://opensubtitles.stoplight.io/docs/opensubtitles-api)
- [SubDL v2 API documentation](https://subdl.com/developers)
- [Subsource REST API](https://beta.subsource.net/api-docs)
- [alass command-line synchronization](https://github.com/kaegi/alass)

## Version: 1.0.0
