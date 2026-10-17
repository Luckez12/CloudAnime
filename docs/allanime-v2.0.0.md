# AllAnime v2.0.0

Extract this ZIP at the CloudAnime repository root, refresh the repository in VUEO, and rescan the episode. It contains the provider, manifest and this note. No workflow/YML files or VUEO application changes are included.

## Confirmed causes

The old episode request returned GraphQL AA_CRYPTO_MISSING. Version 1.0.5 treated the rejected response as an empty source list. Its persisted query and legacy decryptor did not implement the current website bootstrap/build/content-lane protocol.

The search result for Kusuriya no Hitorigoto contains three seasons. Fuzzy ranking or choosing the first result can select a different season. Source discovery must verify AniList/MAL identity, the exact episode, Japanese catalogue origin and the Sub route.

## Changes

- Exact ARM season mapping; ambiguous ordering uses an explicit linked season plus AniZip episode evidence. Catalogue selection checks AniList/MAL IDs instead of title similarity. The encrypted episode response must confirm the same show and episode.
- Current website bootstrap proof, build ID, content lane, request proof and authenticated AES-GCM response decryption. GraphQL errors are reported explicitly.
- A public website build profile seeds the protocol cache. It is not a title/episode override or an account credential. A rejected cached build reloads the public website assets and extracts literal configuration without executing downloaded JavaScript. An unrecognised layout fails explicitly.
- Website-style persisted-query GET requests, with POST registration only when the server reports PersistedQueryNotFound. One bounded stale-session refresh is permitted.
- Sub only. No Dub search/extraction or unrelated metadata calls. Mapping and bootstrap run concurrently; metadata and bootstrap are cached within the provider instance.
- Native Default/clock, direct MP4/HLS, OK.ru and simple MP4Upload sources are supported. A Default source takes priority over the redundant Yt-mp4 route. Unsupported iframe-only services are omitted.
- Actual media responses are checked. HTML returned with HTTP200/206 is rejected; HLS audio explicitly labelled as foreign/mixed is rejected. No subtitle or segment probes are added to normal source discovery. OK.ru in the tested episode uses subtitles burned into the video.
- Playback uses the generic shared HTTP transport already installed for the other providers. There are no AllAnime host rules, content IDs or codec patches in VUEO.

## Verification

The live API decrypted successfully for TMDB220542 S01E01 and confirmed AniList161645/MAL54492. Its search also returned seasons 2 and 3, which were excluded by ID. The Yt-mp4 URL returned Site Unavailable HTML and was rejected; S-mp4 returned a clock response without a usable media URL. OK.ru returned a valid HLS source. Its master, child playlist, and sampled beginning/middle/end MPEG-TS segments succeeded; sampled segments returned HTTP206 and MPEG-TS data.

Production provider execution with the VUEO CryptoJS shim and live HTTP returned one OK.ru source on the final cold scan: 8 HTTP calls, about 40.9 seconds. A cached mapping/bootstrap run returned the same source with 5 calls in about 19 seconds. Earlier runs encountered the previous total deadline. This environment's individual HTTP requests frequently took 3–8.5 seconds. These measurements do not establish Android discovery speed or successful Android playback; the provider is not claimed to be fast on the strength of these tests.

Native cryptographic comparisons cover AES-GCM encrypt/decrypt at eight payload lengths, authentication failures, HMAC-SHA256, and extraction of the captured public build. Provider fixtures cover the three-season search, wrong show/episode IDs, tampered payloads, stale bootstrap refresh, cached-build rejection and public-asset refresh, explicit API errors, HTML rejection, Default source preference and foreign HLS audio rejection.

Requests have an 8.5-second individual cap and a 42-second total budget, with a 44-second manifest allowance. This is a maximum, not an intentional wait. Site availability and the supported native sources determine coverage; not every iframe server shown by the website is extracted.
