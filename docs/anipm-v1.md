# Ani.pm v1.0.3

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


## v1.0.2 — HLS key proof and child-playlist diagnostics

The device's player log reports Media3 HTTP403 for both Sub channels, with a correct HLS MIME. It does not identify which downstream URL failed. Fresh live requests made during this investigation returned HTTP200 for the master, all six child playlists and sampled MPEG-TS segments, and HTTP206 for range reads. That sampled session expires approximately six hours after issuance. Those results do not establish the cause of the device failure.

The site's downloaded Settlar player JavaScript explicitly attaches X-Settlar-Key-Proof from the embed session's keyProof when requesting /~key or /~key/<number>. v1.0.1 omitted this field from its playback output. v1.0.2 preserves the current channel's proof in source headers, which Media3 propagates to HLS subrequests. No token is logged. Missing or malformed proof is omitted; unencrypted sources remain available. Subtitle fetching behavior is retained.

Each verified master gets one child-playlist preflight, with inherited playback headers. Diagnostics report whether that child was accessible, whether it declares encryption, and whether proof is present. A failed preflight logs the failure but retains the discovered URL; it does not falsely declare playback successful or scan alternate master/source candidates after a master is found. This adds one request per returned HLS channel and may increase discovery time.

Validation: 17 fixture scenarios pass under the VUEO-compatible URL shim. The three new scenarios check channel-specific proof propagation to returned source/playlist headers, malformed proof rejection, and optional-proof compatibility. The protected-child response in that test is simulated, while the original website identity/master/subtitle fixtures are actual captured responses. All 21 provider registrations/scripts validate. The fresh live Black Clover sample was unencrypted, so it cannot prove that missing proof caused the user's HTTP403. Actual encrypted-key access and on-device playback after this patch remain unverified. This patch corrects an observed protocol omission; it is not a confirmed resolution of every HTTP403.

Apply at repository root. Only manifest.json, providers/anipm.js and this document are included. No app files or YML. Repository manifest: 1.7.2; Ani.pm: 1.0.2.


## v1.0.3 — remove added scan overhead

The user's subsequent player log still reports HTTP403. The extra video-playlist preflight in v1.0.2 did not resolve it and can increase discovery latency. It is removed in v1.0.3. The existing master-HLS inspection, published-subtitle validation, encoded session URL fix and session key proof remain unchanged. No further child playlist, key or video-segment probes are added.

The original 17 identity/audio/session/output scenarios pass, and the baseline now explicitly asserts that no master child-playlist URL is fetched by discovery. All 21 provider scripts and manifest entries validate. This rollback removes up to one added request per channel; network variance can still affect total scan duration. It is not a resolution of the player HTTP403. The user's latest player error still lacks the failing downstream request URI/type and the effective request-header information needed to determine why Media3 is rejected.

Provider 1.0.3; repository manifest 1.7.3. No app/YML files.
