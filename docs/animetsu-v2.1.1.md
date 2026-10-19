# CloudAnime 1.8.34 / Animetsu 2.1.1

Replace matching repository paths with this update. No VUEO changes or YML files are included. AnimePahe remains removed; DELETE_FILES.txt lists its old repository files if they still need deleting. ZIP extraction does not remove old files automatically.

## GG MP4 handoff correction

Version 2.1.0 requested the first bytes of an MP4, decoded them through Response.text(), and required the string `ftyp` at a fixed character index. That is not a portable binary check: a runtime's text decoder can transform binary bytes, and an MP4 need not place its first ftyp box at that fixed location. This could reject an API-published source before the player received it.

Version 2.1.1 follows the website's GG player handoff instead:

- Confirm the API result's AniList ID, episode, requested/returned Sub metadata and MP4 stream type.
- Preserve the actual HTTPS media URL or the published relative proxy URL.
- Return published MP4 quality options without an extra Range, HEAD or media-body request. Binary MP4 data is no longer decoded as text or examined by provider JavaScript.
- Prefer the website's `isActive` rendition, then other qualities. The website's JavaScript includes all MP4 streams; `isActive: false` is not treated as a disabled quality.
- Exclude iframe entries, conflicting audio, invalid URLs and duplicate media URLs.

This verifies source metadata and returns links, not full playback. The native player performs the actual media load. A URL from the API can still expire or fail at its server; the provider no longer mislabels a text-decoding failure as an invalid MP4.

## Preserved behavior

Title-first search and confirmed source-ID caching remain. Full mapping is a fallback for unavailable/ambiguous title routes or failed source coordinates. Bee and GG race, and the first successful server result is returned immediately. Bee HLS response checks and English/Malay/Indonesian subtitle handling remain. The mandatory origin/MAL cache gate remains removed.

## Validation

44 controlled regression scenarios passed:

    node scripts/test-animetsu-v2.cjs

New coverage proves that GG makes no media preflight request, cannot fail due to binary text decoding, preserves alternate qualities, accepts published non-default renditions, deduplicates URLs, and excludes iframe, malformed URL and Dub results. Existing title/search/cache, source-race, identity and subtitle scenarios remain.

Live Blue Box GG API access returned 403 or timed out in the build environment. A cold provider run reached the correct AniList 170942 / MAL 57181 E01 but both media server paths exhausted the request budget there. This does not verify playback or prove that the user's server is unavailable. Retest Blue Box S01E01 in VUEO and inspect the new GG published-quality log.

Other provider entries are unchanged.
