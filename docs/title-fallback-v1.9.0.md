# CloudAnime 1.9.0 — ID first, exact-title fallback

Apply this ZIP at the repository root. Paths start with manifest.json, package.json, providers/, scripts/ and docs/; there is no enclosing project folder. Cumulative AnimeKai fixes through v2.0.5 (race Server 1/2, exclusion of Server 3 and CDN fallback) are included. No YAML edits, file deletions or dependency changes.

## Scope

Adds identity fallback to AllAnime, AnimeKai, HiAnime, Kurage, Reanime, Vidnest Anime, AnimeDunya, AnimeGG, AnimeNoSub, AnimeOnsen and AniPM. Animetsu, AniZone, AnimeSalt and AnimeWorld already use title discovery and are byte-for-byte unchanged.

Successful original mapping objects and original ID-path HTTP request sequences are preserved in the recorded regression fixtures. AllAnime's catalogue bootstrap still starts concurrently with mapping. Media extraction, subtitle filters, existing audio rules, quality rules and server behavior remain intact. The only additional website lookup is AnimeKai's title-to-slug discovery when no valid mapped slug exists.

## Fallback behavior

Only a failed/missing identity mapping enters the new helper; a source/playlist 403, HTML response or timeout after successful identity discovery does not restart title search. Explicit mapping conflicts/mismatches are not overridden.

Uses VUEO's matching TMDB metadata (or its metadata bridge) for title, original title and aliases. The supplied TMDB/IMDb identity and media type must match the request. Explicit non-Japanese source metadata is rejected. Missing usable metadata fails closed rather than borrowing another title.

Searches AniList with at most two aliases in parallel. Accepts one unique exact normalized title/season candidate with compatible movie/TV format and Japanese origin. Later seasons require an explicit matching season suffix; ordinal forms such as 2nd Season and Second Season are normalized. Part/cour suffixes, arbitrary numbers, split-season offsets and unsuffixed first-season titles are not stripped or guessed. Multiple matches, incomplete paginated results, conflicting IDs and episode numbers beyond a known total are rejected. Total episode counts do not resolve an ambiguous title/remake match. This strict approach may skip anime whose season title is unrelated to its base title.

On catalogue failure, tries Jikan using the same scoped query. That branch requires Japanese-language VUEO metadata and verifies the selected MAL-to-AniList bridge through AniZip. This is separate from ARM and does not require ARM to recover. No new air-date or release-schedule check is introduced. Existing native mapping logic is retained, including any date-based rules it already uses.

The fallback has a seven-second maximum budget, three-second per-request cap and keeps 2.5 seconds of the provider's remaining budget for extraction. It never extends existing provider deadlines. If the original lookup consumed the budget, fallback is skipped. There are no extra HTTP calls on the normal successful ID route. Fallback logs its own request count because native provider counters count their original scoped requests.

AnimeKai searches its own catalogue only when its mapped slug is absent. It then requires one exact-title slug, an exact active/published Sub episode, and a page-listed player URL whose MAL/episode matches the resolved identity. If an original MAL ID already exists, title fallback must agree with it.

## Verification

`npm run validate` now performs repository validation and the new self-contained regression suites, so the existing validation workflow runs the checks automatically without a workflow edit.

- 35 fallback-policy cases, including context isolation, special-season rejection, aliases, exact/ambiguous matching, catalogue outages, no release-date requirement and IMDb identity.
- 25 integration checks: all 11 ID-based providers preserve baseline successful mapping objects/request sequences and convert missing mappings into the expected ID shapes; AllAnime concurrency is retained; all 15 modules load; four title-first files are unchanged.
- 7 full AnimeKai title-to-page-to-HLS fixture flows, including wrong MAL, redirect, ambiguous slug and no title retry on media failure.
- 18 existing AnimeKai race/CDN cases.
- Existing 840 minimum-resolution cases and Reanime mapping regressions pass.

The baseline mapping JSON was captured by executing the unmodified pre-title-fallback provider code against the same controlled inputs; no duplicate provider code is shipped in tests. The release ZIP is checked by applying it to a fresh copy of the original uploaded archive and running validation there.

Live fallback catalogue probes were unavailable in this environment: AniList returned HTTP 403 and Jikan HTTP 503; a bounded runtime probe safely returned no fallback result. Automated coverage does not establish end-to-end live playback for all 15 providers. Catalogue availability and upstream video correctness remain external limitations; this release does not claim zero possible defects.
