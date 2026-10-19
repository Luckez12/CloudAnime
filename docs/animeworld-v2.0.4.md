# AnimeWorld 2.0.4 / CloudAnime 1.8.26

Copy providers/animeworld.js and manifest.json over the matching CloudAnime files. Only AnimeWorld version/notes and the repository version change. No YML files are included.

## Faster discovery

The player API and subtitle metadata still start together. The master HLS request now starts immediately after the API response rather than waiting for subtitle metadata. Returning the stream still waits for both paths so available subtitles are retained. Japanese audio and HLS structure are checked as before.

After a verified series title/year match, save a compact catalogue record: catalogue URL/title/year, season post IDs, and website-published episode routes. Cache TTL is five minutes. Selected episodes still require same-site coordinates, exact canonical URL and the matching primary player parent series. A stale cached episode clears the entry and refreshes the catalogue once. No signed stream URL, API response, player page, subtitle configuration or master playlist is cached. Movie extraction keeps its previous verified path.

## App companion required for cross-execution reuse

VUEO creates a new QuickJS runtime for each provider execution, so a JS object cannot persist across scans. Install/build the companion VUEO-Provider-Catalogue-Cache-Bridge-No-YML.zip app patch for the main cache benefit. The bridge stores metadata in bounded process memory, scoped to repository manifest URL, provider ID and provider version. No disk/network calls are added by the cache. It expires after five minutes, and app termination discards it.

Without the bridge, the provider remains functional and uses a runtime-local fallback. The HLS pipeline optimization applies on both old and updated apps. Cross-execution cache hits log `CACHE: Verified catalogue hit; shared across executions`.

## Validation

43 existing captured-response identity/extraction regressions passed, plus nine cache/pipeline cases and 12 compiled native-cache cases: 64 checks total. Tests simulate separate JS runtimes sharing the native cache contract, cached next episodes, expired/wrong-year/stale routes, optional subtitle metadata and HLS ordering. The native Kotlin cache was compiled and executed independently. The app QuickJS binding was reviewed, but a complete APK build and phone validation were not performed.

Captured Jujutsu Kaisen replay: cold scan seven HTTP requests; a fresh runtime repeat and next-episode scan four requests each. Warm scans omit search, catalogue and season AJAX. Every execution still requests the episode page, fresh player API, subtitle metadata and master HLS. The supplied Smoking log already used six requests, so its potential warm request count is four. These are request-count results, not a guaranteed live latency reduction. Site response times still affect startup.

The companion app patch is separate from provider extraction and does not replace the earlier Anime Identity v2 fix.
