# Ani.pm v1.0.1

Standalone CloudAnime provider for https://ani.pm. Apply the ZIP at repository root. No containing CloudAnime-main folder, YML, app changes, external proxy backend, Node globals or runtime imports.

## Identity and episode mapping

Uses the verified CloudAnime mapping adapter from AnimeGG v1.0.1. Explicit season mappings keep priority. Show-wide mappings support absolute episodes only when MAL/TMDB identity, a unique independent TVDB episode ID, requested season and compatible broadcast date agree. Relative season episodes continue to map by broadcast date. No sequel offsets or fuzzy franchise substitutions.

Ani.pm search candidates must have matching MAL or AniList identity, without conflicting IDs. Playback bootstrap is requested directly for the mapped episode with lang=sub. Its core identity, source/id, episode, requested/effective Sub language, episode list entry, Sub availability and package must agree before session creation. Ambiguity yields no stream.

## Extraction

Requests only advertised sub and subhard packages via Ani.pm's Settlar session endpoint. The returned embed must use https://embed.settlar.io. Session data must declare Japanese audio. Foreign or unknown audio is excluded. Tokens and signed media URLs are transient response data and are not logged, stored in provider source or reused across requests.

Sources are inspected as HLS by declared kind or URL, including extensionless signed media endpoints. A valid master stops further candidates in its channel; otherwise valid media playlists or declared MP4 files are fallback options. Foreign/mixed or unlabelled HLS audio groups are excluded. Failure to retrieve one candidate allows another candidate in that channel. Softsub is listed ahead of hardsub regardless of request completion order.

External English, Malay and Indo subtitles are forwarded only when actually published and their retrieved bodies contain recognizable subtitle cues. WebVTT, ASS and SubRip receive explicit format/MIME metadata and per-track Referer/Origin/User-Agent headers. The provider does not fabricate missing subtitle tracks or extract burnt-in text. Signed source and subtitle URLs are resolved afresh on every discovery run.

## Validation, 2026-10-14

Live HTTP requests retrieved Ani.pm search, One Piece E1156 playback bootstrap, sub/subhard sessions, both embed sessions, both master HLS playlists, and an English subtitle body. Both sessions declared Japanese audio; the softsub track returned WebVTT with actual timed cues.

Full standalone-provider replay against those captured responses maps TMDB 37854 S23 E1156 to MAL 21 E1156 and returns two HLS sources: Softsub with English WebVTT, and Hardsub with no external tracks. All 14 regression scenarios pass: identity mismatch, wrong episode/language, unavailable package, foreign/unknown session audio, mixed HLS audio, invalid subtitle body, master priority, failed-candidate fallback, published-channel filtering and embed-origin validation. Manifest/syntax validation passes for all 21 providers. Movie mapping uses the existing movie identity path; live movie playback was not tested.

Actual video playback in VUEO, downstream media segments and device subtitle rendering have not been verified. Test One Piece S23 E1156 in VUEO first and check both Softsub and Hardsub sources. Malay/Indo are supported when the player publishes them; this sampled episode published English only.

Reference conventions inspected: https://github.com/walterwhite-69/Anivexa-API/blob/main/providers/anipm.js. Implementation follows the current live API, includes stricter bootstrap checks and Japanese-only audio enforcement, and does not depend on that API service.

Manifest retains AnimeGG v1.0.1, AnimeDunya v1.0.1 and AnimeOnsen v1.0.1. New repository manifest version: 1.7.0.


## v1.0.1 — VUEO session URL compatibility fix

VUEO's standalone runtime URL implementation assigns href at construction and keeps searchParams separately. Mutating searchParams does not recompute href. v1.0.0 constructed the session URL with new URL and called searchParams.set, so VUEO sent the bare session endpoint without selection/provider/episode/channel parameters. A live request to that bare endpoint with site headers returns HTTP 400 with error code invalid-settlar-session-request.

The provider now constructs and encodes the complete session query directly as a string. No app files, authentication changes, cache changes or episode mapping changes are required. This defect was missed because the original replay used Node's standard URL implementation. Tests now use a URL shim matching the relevant VUEO implementation and assert every required session parameter is preserved.

The original query-loss behavior was reproduced from the released v1.0.0 ZIP. All 14 previous scenarios now pass under the VUEO-compatible URL shim. A further complete replay using freshly downloaded Black Clover Season 2 responses confirms TMDB73223 S02E01 maps to MAL61967 E1 and yields two Japanese/Sub master HLS sources plus actual English and Indo WebVTT bodies. Live bootstrap/session/embed/playlist/subtitle requests succeeded for this title. All 21 providers pass manifest and syntax checks. Actual on-device playback remains unverified.

Repository manifest version: 1.7.1. Ani.pm provider version: 1.0.1.
