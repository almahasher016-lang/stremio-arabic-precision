# Contributing — Arabic Precision Subtitles

1. Preserve provider isolation. Each adapter exports `name`, `active`, `search(identity, signal)` and `fetch(candidate, signal)`. Search returns an array, never silently replaces transport errors with `[]`.
2. Candidate contract: `{provider,id,imdb,lang:'ara',season,episode,release,downloads,format}` plus optional `moviehash`, `videoSize`, `locator`. A series candidate must have an exact episode; a season pack may be expanded only by a filename with an exact `SxxExx` match. Do not infer media identity from popularity.
3. Use provider-specific `RateGate`, pass `AbortSignal` to all HTTP stages, cap response bytes, whitelist HTTPS hosts, redact secrets and handle 429 backoff.
4. Do not broaden format support by weakening content/ZIP verification. Conversion may remove ASS styling, so do not claim style preservation.
5. Update `TRANSFORM_VERSION` in `src/lib/subtitle.js` whenever decode, ZIP selection, normalization or sync representation changes. This invalidates persistent transformed raw cache entries. Sync runs are operator-only.
6. Update both `package.json` and `src/version.js` for version changes, plus README header/footer. `npm run check` enforces the package/runtime pair; review README manually.
7. New bugs need a reproducer in `test/*.test.js`. `npm run check` must pass; real providers additionally need `npm run test:live` with credentials in environment variables, never fixtures committed with secrets.
8. Use a new branch and a pull request; never force push production or publish to the public addon catalog without real playback verification.

## Logging contract

Emit structured JSON with `time`, `level`, `event`, `correlationId`, `provider`, short safe status, duration and count. Never include subtitle text, user video filenames, complete URLs, Authorization headers, tokens or API keys. Do not infer a provider outage from one missing subtitle.

## Quality gates

A PR needs passing syntax/tests, matching manifest/package versions, at least one good and one failure-case fixture for changed providers, verified 200/403/502/503 HTTP behavior, and an operator-signed live test report before production deployment. No guarantee of 100% subtitle availability or alignment is permitted.
