# Animetsu 2.0.0 / CloudAnime 1.8.31

Replace the matching repository paths with this update package. It is not a complete repository. Animetsu is enabled in the manifest. No VUEO app changes and no YML files are included. AnimePahe remains removed as requested in 1.8.30; if its old files still exist in the repository, delete the paths in DELETE_FILES.txt. Extracting a ZIP does not delete old files automatically.

## Source changes

The previous provider depended on animetsu.live/v2/api and old kite/fsoft extraction. The current animetsu.site website handles its /v2/api routes inside assets/client_engine.js. Merely changing the old base URL would not reproduce the current website.

This implementation follows the current website's published Sub routes for Bee and GG. It does not run downloaded JavaScript, call the old backend, request Dub, use randomized user agents, or return iframe pages as native video. The site's other iframe-only and disabled servers are outside this adapter.

- Bee: api.aniclover.cc/api/watch/{AniList}/sub/{episode}. Preserves the actual signed HLS URL without adding a fake extension. Validates the playlist and preserves the website-supplied beta.zanora.xyz media transport. The explicit Sub branch takes precedence over other response branches.
- GG: api.animetsu.site/watch/animegg/{AniList}/sub/animegg-{episode}. Requires matching response identity, episode, Sub audio and an active MP4 source. Uses the published media URL rather than inventing proxy parameters. A small Range request must return 206, the expected Content-Range and MP4 ftyp signature before returning a source. It does not download a whole MP4 for verification.
- Each server fails independently. A timeout or malformed response from one does not discard the other's result.
- ARM and AniZip establish the MAL/AniList identity. TMDB season episode dates select the mapped anime episode, with a strict TVDB identity/date bridge for independently verifiable absolute episode requests. Wrong or ambiguous matches return no source; there is no first-result/title guess or arithmetic sequel offset.
- Japanese original-language evidence is checked using matching VUEO metadata when available, otherwise TMDB details. Explicit conflicting audio metadata is rejected. If an HLS master contains audio renditions, Japanese must be present; mixed masters request the existing VUEO Japanese-audio selection fragment.
- Metadata is compacted and cached for five minutes through the existing app cache when available. Signed playback URLs and source API responses are refreshed on every discovery.
- Bee subtitles retain English, Malay and Indonesian tracks when supplied. Extensionless tracks default to WebVTT, matching the live sampled response; published ASS/SubRip declarations are preserved. No subtitle language is fabricated when absent.

## Verification

37 controlled regression scenarios passed. Run from the repository root:

    node scripts/test-animetsu-v2.cjs

The scenarios cover identity/episode conflicts, ambiguous dates, show-wide absolute mapping, movie/TV mismatches, cache isolation, Japanese/Sub filtering, malformed HLS/MP4, bounded Range validation, subtitle formats and independent server failures.

Live source discovery in the build environment:

| Request | Result |
| --- | --- |
| One Piece, TMDB 37854 S01E01 | Bee HLS with English WebVTT; GG timed out in this run. |
| Black Clover, TMDB 73223 S02E01 | AniList 195604 / MAL 61967 E01; Bee HLS with English and Indonesian subtitles, plus GG 1080p MP4. |
| Your Name, TMDB 372058 movie | GG 480p MP4; Bee timed out in this run. |

The sampled Bee master and variant returned valid HLS, and the first sampled media segment contained MPEG-TS sync bytes at 188-byte intervals despite its image/jpeg Content-Type. The sampled subtitle returned WEBVTT. GG returned 206 partial video/mp4 bytes with an ftyp box. These are source/content checks, not full on-device playback verification.

Cold live discovery took approximately 29–31 seconds in this environment. The provider's total budget is 36 seconds and the manifest timeout is 40 seconds. Subsequent requests can reuse metadata, but server availability and timing vary.

Still to verify on the user's device: native VUEO playback, seeking, audio and subtitles, on both TV and mobile. Source providers can rotate or expire signed links independently of this patch.
