# AnimeOnsen v1.0.0

Website: https://www.animeonsen.xyz/

Standalone CloudAnime provider. It uses the site's anonymous session bootstrap and direct API; it does not call an Anivexa proxy or reuse account credentials.

- Existing date-based TMDB/IMDb to MAL episode mapping.
- Japanese AniList identity and movie/series type verification.
- Batched title search; unique exact metadata MAL match required. No fuzzy identity fallback.
- Confirms the mapped episode exists in the upstream episode list before loading its video.
- Direct DASH MPD, with session Authorization, Referer, Origin and User-Agent preserved.
- Published English, Malay and Indo subtitle URLs travel with the stream and their request headers. No subtitle preflight removes tracks.
- Explicit foreign audio tags and DRM manifests are rejected. The site adapter requests only the sub service; unlabelled audio is not independently verified by listening.
- Bounded request budget; HTTP 403/bootstrap failures are logged without session token values.

Reference checked on 2026-10-12: https://github.com/walterwhite-69/Anivexa-API/blob/main/providers/animeonsen.js
The homepage meta fields, ao.session cookie encoding, search and video endpoint conventions were adapted into an independent standalone runtime implementation.

Validation: all 19 providers pass manifest/syntax validation. Runtime fixture tests cover DASH + permitted subtitles/header propagation, wrong MAL, absent episode, foreign audio, DRM and Cloudflare 403. Fixture API responses are simulated; existing captured live anime mapping responses are reused.

Live limitation: homepage requests from this build environment returned HTTP 403 with a Cloudflare browser challenge. API schema, signed CDN URLs, audio and playback have not been validated end-to-end live. This is a provider to test on-device, not a confirmed-working playback claim. No challenge bypass is included.

Apply this ZIP to CloudAnime. It includes manifest.json and providers/animeonsen.js at repository-root paths, plus this note. No workflows, app code or changes to other provider files are included. The manifest retains the earlier AnimeDunya v1.0.1 registration.
