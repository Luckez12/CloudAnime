# Kurage 2.0.0 / CloudAnime 1.8.21

Overlay `providers/kurage.js` and `manifest.json` into the existing CloudAnime repository. No YML files or app changes are included. No repository push has been performed.

## Fewer processes

Replaced the obfuscated primary plus delayed duplicate engine with one readable provider. The old engines queried the same Kurage backend, requested both Sub and Dub, and repeated mapping work. The alternate also imposed a 2.2-second request timeout without aborting the underlying fetch.

The normal path is now one ARM exact-ID lookup followed by one Kurage `episodes.source` Sub request. There is no Cinemeta call, AniList GraphQL title search, TMDB HTTP request, unused catalogue request, Dub request, duplicate engine, retry or media/subtitle probe during discovery. `available:false` ends immediately after the response arrives. A mapping cache lasts up to five minutes within a surviving provider runtime; signed source URLs are refreshed on each discovery. This cache is not guaranteed to survive VUEO runtime recreation.

Unique ARM movie/normal-season mappings need no extra anime request. Ambiguous/special mappings use only explicitly linked AniZip datasets and exact episode fields. The requested TMDB, AniList and TVDB identities must agree; no title-specific IDs, date-gap guesses or fixed episode offsets are used. Ambiguous or missing records return no source. This deliberately does not claim universal coverage when public mapping data is incomplete or season orders disagree.

The total discovery budget remains 18 seconds, below VUEO's 20-second cap. Each network operation shares the remaining budget; there is no second engine or separate short per-engine timeout. Abort is used when the runtime provides AbortController. Valid source display metadata is read from VUEO only when needed, with an optional title lookup capped at one second and the remaining overall budget. Episodes with no usable source do not request display metadata.

Only explicit Sub/Japanese sources are retained. Proxy URLs and their encoded upstream-header query stay intact; playback requests to the Kurage proxy use Kurage Origin/Referer. Supported direct-source headers are retained. No proxy decoding or additional extractor is required. Published en/ms/id subtitle sidecars are forwarded when present; no subtitle is invented for responses without tracks.

The manifest preserves AnimeSalt 2.3.0 and all previous cleanup choices. Kurage remains enabled. `hasSettings` is false because the replacement has no settings UI. As with the earlier cleanup overlay, remove retired `providers/anidb.js` and `providers/anikototv.js` files if they remain: ZIP overlays cannot delete files, and the existing repository validator rejects unregistered providers.

## Verification on 2026-10-18

28 automated scenarios passed using current captured responses and failure cases: JoJo unavailable, One-Punch Man, Apothecary Diaries, JoJo split-season boundaries, invalid/missing mapping, duplicate URLs, missing/Dub/mixed audio, wrong source identity, HTTP failure, abort on timeout, lazy display metadata and subtitle forwarding. The repository's unchanged validator passed all 16 manifest providers.

Direct Kurage catalogue response confirms AniList **14719 is JoJo's Bizarre Adventure (TV)**. TMDB 45790 S01 E01 maps to that identity; the website Sub response was `{available:false}`. The earlier conversational claim that 14719 was Sakurasou was incorrect. There was no evidence that this particular request resolved to the wrong anime.

Live end-to-end discovery with the shipped budget:

- One-Punch Man S01 E01: one MP4 source, two HTTP calls, approximately 11.6 seconds.
- Apothecary Diaries S01 E01: one MP4 source, three HTTP calls including necessary AniZip mapping, approximately 17.7 seconds.
- JoJo S01 E01: standalone Sub requests confirmed unavailable, but a full run exhausted the 18-second budget while awaiting Kurage after an approximately 8.6-second ARM lookup. It returned no source with no retry. Backend/network latency can still exhaust the budget; removing duplicate work cannot guarantee a fast upstream response.

The One-Punch Man and Apothecary proxy URLs both returned HTTP 206, `video/mp4`, and MP4 `ftypisom` bytes in separate diagnostic range checks. These probes are not part of provider execution. Full Android/TV playback and on-device timing have not been tested. Timings above are samples from this execution environment, not promises for every request.
