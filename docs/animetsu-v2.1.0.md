# CloudAnime 1.8.33 / Animetsu 2.1.0

Replace the matching repository paths. This is an update package, not a complete repository. No VUEO app changes or YML files. AnimePahe remains removed; DELETE_FILES.txt lists its old files if they still need deleting. ZIP extraction does not automatically remove old files.

## Request order

1. Reuse a confirmed source ID/episode from the existing metadata cache.
2. Use TMDB directly when the source supports it. Animetsu's published Bee/GG APIs accept AniList IDs, not TMDB IDs, so this unsupported route is skipped without a network probe.
3. Search the same AniList/Jikan catalogue used by the Animetsu website, using the title VUEO already supplied. A unique exact title/season result goes directly to the Sub source request. No ARM, season dates or separate country/origin verification is required for this successful path.
4. Use the full mapping chain only if the title is unavailable, unmatched, ambiguous, or its source route produces no usable video. If mapping confirms the same source coordinates, the provider avoids repeating identical video requests.

A Jikan result supplies a MAL ID and therefore needs one direct MAL-to-AniList lookup. This is not the old full ARM/TVDB/date chain. Movie/TV formats and exact sequel-title variants are checked; an unsuffixed season-one title cannot silently become a sequel. Unresolved seasonal or absolute episode numbering can use the mapping fallback.

Shared VUEO metadata is reused when it matches the request. A TMDB detail fetch is made only when the app did not supply a usable title. Confirmed title-to-source IDs are cached only after a validated video result. A failed cached title entry is invalidated. Playback URLs are refreshed every time.

## Removed blocker

The mandatory country/origin+MAL-cache check is removed. Missing language fields or mismatched cached MAL value types no longer block a source search. This removes the gate that produced `Anime is not verified Japanese content` for otherwise valid titles.

The explicit Sub request, conflicting audio rejection, response-ID checks, HLS validation and bounded MP4 Range/ftyp validation remain. English/Malay/Indonesian subtitles and first-validated-server completion remain. The first successful Bee or GG result is returned and the other request is cancelled.

## Tests and limits

38 controlled regression scenarios passed. Run from the repository root:

    node scripts/test-animetsu-v2.cjs

Coverage includes skipping the expensive mapping chain on successful title search; shared metadata reuse; source-ID caching across episodes; Jikan ID lookup; unambiguous sequel selection; mapping only after failed/ambiguous title routes; changed-ID fallback after source failure; cache invalidation; removal of the old origin gate; server racing/cancellation; source identity/audio/media checks; and subtitle preservation.

For TMDB 237150 S01E04, a cold network run correctly reached AniList 164702 / MAL 55265 E04 and passed the removed origin gate, but exhausted the build-environment budget while reading media. AniList catalogue search returned 403 and Jikan returned 503/unavailable in this environment, so live title-search success could not be demonstrated here.

A second test reused those recorded metadata responses and made fresh Bee/GG/media requests. GG returned a validated 1080p MP4 (206 byte range, ftyp), won the source race and cancelled Bee, in approximately 10.4 seconds. This is a warm-metadata/fresh-source check, not a claim that a cold full request or the title-search path took 10.4 seconds.

On-device retest is required for source discovery timing, playback and subtitles. Other providers' implementations are unchanged by this package.
