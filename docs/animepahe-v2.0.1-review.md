# AnimePahe 2.0.1 / CloudAnime 1.8.28 — current upstream review

Copy manifest.json and providers/animepahe.js into the corresponding CloudAnime paths. This replaces AnimePahe 2.0.0; all other manifest entries, including AnimeWorld 2.0.4, are retained. No YML files. AnimePahe remains disabled by default.

## What was rechecked

Fetched current source on 2026-10-19 from:
- https://raw.githubusercontent.com/D3adlyRocket/Anime-Nuvio/main/providers/animepahe.js
- https://raw.githubusercontent.com/yuzono/anime-extensions/master/src/en/animepahe/src/eu/kanade/tachiyomi/animeextension/en/animepahe/AnimePahe.kt
- https://raw.githubusercontent.com/KevCui/animepahe-dl/master/animepahe-dl.sh

These primary upstream implementations still use the same search/release API shape and published resolution-menu/Kwik flow. The AnimePahe downloader uses .pw and a configured browser clearance/session, while the extension has its own Cloudflare-aware networking client. VUEO native fetch does not become such a client merely by copying their parser. No third-party proxy, clearance cookie or bypass implementation was imported.

The supplied device log reaches the .pw search API and receives 403. That proves the rebuilt mapping now runs, but does not establish a parser failure or a new API. In the prior browser inspection the site returned a hard Cloudflare block. No new requests to the blocked AnimePahe site were made during this review. Actual current website HTML/playback remains inaccessible in this environment, so source compatibility is not a claim of live site validation.

## Real code gap fixed

The 2.0.0 release selector accepted only the anime-local episode number. Current upstream code explicitly distinguishes local list position from the site's published episode number. Live ARM/AniZip data for the supplied Black Clover request confirms:

- TMDB 73223 season 2, episode 1
- MAL 61967, anime-local episode 1
- AniZip/TVDB absolute episode number 171

Version 2.0.1 preserves the explicit absolute episode field from the validated dataset. Release selection accepts the local or absolute number actually supplied by that same episode record. It does not derive an offset from a first page or hardcode 171. If both numbers match separate releases, the result is ambiguous and rejected. Pagination remains based on anime-local position, not the absolute episode number.

This makes the release parser compatible with either a site labelling that episode 1 or a site labelling it 171. The site's actual release label for this title could not be observed because access is blocked.

## Verification and remaining blocker

33 scenarios passed: all 29 prior identity/audio/extraction/block/cache/pagination checks, plus Black Clover local/absolute labels, wrong absolute episode rejection and ambiguous matches. ARM/AniZip responses are live captures; site and Kwik responses are controlled fixtures.

The HTTP 403 is not fixed by this release-number correction. Resolving that access issue would require separately assessing a legitimate browser/session flow in the VUEO app and verifying that the website accepts it. A parser rewrite, random query suffix, retry loop, mirror fanout or borrowed cookies would not constitute a verified fix. Keep AnimePahe disabled for ordinary discovery while this blocker remains. No APK changes are included.
