# AnimeSalt v2.0.0 — CloudAnime 1.8.14

Install this ZIP into CloudAnime. Install the companion generic SRT patch into VUEO (55), then rebuild Mobile/TV.

- Ravok native HLS only; Abyss removed. No decoder API, dubbed audio, segment probing or subtitle downloads during discovery.
- Exact TMDB title/alias + release-year match. Exact site season and episode checks; ambiguous matches return no sources.
- Verify a unique Japanese HLS audio rendition, then use existing generic VUEO HLS policy to select Japanese and preserve all video qualities.
- Return only English/Malay/Indonesian sidecars supplied by the site. No translation or subtitle generation.
- Shared metadata avoids extra TMDB requests; title pages cached for five minutes (16 entries). A cold S01E01 discovery uses six HTTP requests; 45-second total deadline, 10 seconds per request, 48-second runtime limit.
- Manifest is based on the last delivered AllAnime v2.0.0 / CloudAnime 1.8.13 manifest; all other provider records remain identical.

Validation on 2026-10-18:
- Nine captured-response regression scenarios passed in a Node VM without Buffer/process/require inside provider context.
- Live S01E01 discovery passed for TMDB 63926 (One-Punch Man) and 220542 (The Apothecary Diaries): one Ravok stream and one English sidecar each, six requests. Cold runtime approximately 42 seconds in this environment.
- Fresh One-Punch Man video and Japanese audio segment range requests passed at start, middle and end (six samples). This verifies media access, not Android playback.
- Companion JVM checks preserve all 190 cues and dialogue text in a captured website SRT while correcting decimal timestamps.
- Movie extraction is supported by the code but was not live-tested. Android APK build and on-device playback remain unverified.
