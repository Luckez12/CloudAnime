# AnimeGG v1.0.1

Website: https://www.animegg.org/

Direct standalone CloudAnime provider; no proxy service, runtime dependencies or workflow changes.

## Extraction

Reuses verified date-based TMDB/IMDb -> MAL episode mapping. AnimeGG has no reliable MAL field on the sampled page, so matching additionally requires an exact mapped title/alias or mapped Anime-Planet slug, a matching series page heading, a compatible episode count, and one explicitly Subbed entry for the mapped episode number. Ambiguous matches return no links. Combined seasons requiring speculative offsets are intentionally not guessed.

Uses current live search `<h2>` headings (with legacy `<strong>` support), `anm_det_pop` episode entries, explicit `data-version=subbed` mirrors and `/embed/<id>` player data. Data literals are parsed without evaluating downloaded scripts. Only direct MP4/HLS sources are returned; backup iframe URLs are not mislabelled as videos.

HLS candidates are inspected first; a valid master stops other source discovery for that mirror. Explicit foreign HLS audio groups are rejected. With no master, media playlists or published MP4 links are returned. MP4 links are not gated by HEAD checks because the playback redirect/CDN can handle HEAD differently from GET.

Only English, Malay and Indo external subtitle tracks are forwarded when the player actually publishes them. The sampled Asobi Asobase E01 embed returns 480p/720p MP4 and no external subtitle tracks. No separate subtitle URL or language is invented. Explicit Sub tabs are evidence of the site's Sub version; audio and burnt-in subtitle language have not been verified by listening/viewing.

## Validation and limits

Live search, series, episode and embed requests returned 200 for Asobi Asobase E01. Actual captured ARM, Cinemeta, ani.zip and AnimeGG pages were replayed through the complete provider and yielded two Sub MP4 links. Fixture modifications verify rejection of dub tabs and wrong season titles, plus master HLS priority and subtitle language filtering. All 20 provider scripts/manifest entries pass syntax/registration validation.

The MP4 endpoints returned redirects during a live HEAD probe, but the downstream CDN connection timed out in this environment. Video playback in VUEO has not been verified. This provider is ready for on-device testing, not a guaranteed-working playback claim.

Reference conventions inspected: https://github.com/walterwhite-69/Anivexa-API/blob/main/providers/animegg.js
The standalone implementation follows the current website HTML and uses stricter matching than the reference's fuzzy/offset fallback.

Apply to CloudAnime repository root. Manifest preserves AnimeDunya v1.0.1 and AnimeOnsen v1.0.1. No VUEO app files or YML included.


## v1.0.1 — show-wide/absolute episode mapping repair (2026-10-14)

ARM currently identifies TMDB 37854 as MAL 21 with `themoviedb-season: null`. The old season-only filter rejected this identity before searching AnimeGG. Show-wide TV mappings are now accepted when no explicit season mapping exists. Explicit season mappings keep priority.

For an absolute request such as S23 E1156, ani.zip must confirm the MAL and TMDB show identities, matching `episode` and `absoluteEpisodeNumber`, and a unique Cinemeta episode in the requested season with the same TVDB episode ID and a compatible broadcast date. This bridges to S23 E1 without guessing season offsets. Relative S23 E1 continues to resolve by broadcast date. Same-day indexing uses the selected metadata episode, not the incoming absolute number.

Mapping logs include the verification method. Exact-title series matching logs the mapped episode's number of explicit Sub entries. No neighboring episode is substituted when the requested episode is absent.

Validation: 10 mapping/audio checks pass, including wrong season, absent independent metadata, conflicting show/episode IDs or dates, ambiguity rejection, and relative season numbering. All 20 provider registrations and scripts pass `npm run validate`. Complete provider replays using newly downloaded ARM, ani.zip, Cinemeta and AnimeGG HTML confirm S23 E1156 maps correctly but has no Sub entry; S22 E1155 returns three published Sub MP4 links from the actual embed. AnimeGG's E1156 direct URL returned 404 during this check. No video playback or MP4 audio listening was performed; in-app playback remains to be verified. Hardsub-only playback is expected from the user's prior confirmation, and no synthetic external subtitle tracks are added.

Patch contains only manifest.json, providers/animegg.js and this document. Apply paths at repository root, without an enclosing CloudAnime-main folder. No YML files included.
