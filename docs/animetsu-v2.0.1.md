# CloudAnime 1.8.32 / Animetsu 2.0.1

Apply the files at matching repository paths. This is an update package, not a complete repository. No VUEO changes or YML files are included. AnimePahe remains removed; delete the old paths in DELETE_FILES.txt if they still exist. ZIP extraction does not remove old repository files automatically.

## First validated source returns immediately

Bee and GG start together. The first server that finishes identity/audio/media validation returns its sources immediately; remaining extraction is cancelled. A fast HTTP error, empty result, HTML page or invalid media cannot win. If one server fails, the other remains eligible. If both fail, the provider returns no sources.

This intentionally returns the winning server only. The current provider interface returns one final array; it does not append results from a slower server after completion. Signed streams remain uncached. Native cancellation is used when available, with a local cancellation promise for runtimes without AbortController.

## Episode date correction

AniZip can publish both `airdate` (AniDB streaming premiere) and `airDate`/`airDateUtc` (TVDB broadcast). Version 2.0.0 always chose the first nonempty field and discarded the other date. This could reject the right episode when TMDB used the broadcast date.

Version 2.0.1 checks all distinct published dates. Exact matches take priority, the existing one-day local/UTC allowance remains, and MAL/AniList/TMDB identity guards remain in place. It does not widen the main mapping date window or invent episode offsets.

Observed example: TMDB 324502, Overgeared S01E01 maps to AniList 212888 / MAL 64340 E01. The dataset records September 27, 2026 as streaming `airdate` and October 2, 2026 as broadcast `airDate`; TMDB uses October 2.

## Missing-registry fallback

When the primary mapping is unavailable, a bounded catalogue fallback uses the current TMDB title/native title and season episode dates, AniList search (Jikan if unavailable), exact native-title candidates and independent AniZip ID/episode verification. Conflicting reciprocal TMDB IDs, mismatched formats, absent episodes and ambiguous verified candidates are rejected.

For this separate fallback only, a streaming/TV schedule difference must be constant from episode one and within seven days. This is a date-schedule check, not an episode-number offset. The requested episode must actually exist in the dataset. Verified catalogue identity is cached for subsequent episodes.

The metadata namespace is changed for this release so stale data from 2.0.0 is not reused. Empty ARM arrays are not cached. Signed media links are always refreshed.

## Validation

44 controlled regression scenarios passed, including both possible server winners, fast-failure isolation, cancellation with/without AbortController, date-field differences, catalogue ambiguities, episode drift, source/audio identity, HLS/MP4 validation, subtitle formats and metadata cache behavior.

Run from the repository root:

    node scripts/test-animetsu-v2.cjs

Live Black Clover S02E01 and Overgeared S01E01 testing both returned GG 1080p as the first validated source and cancelled the still-pending Bee request. Overgeared used the corrected main-registry date path, independently of catalogue search. Network timing varies; the change removes waiting for a slower server after a valid result exists, not metadata or source-fetch time.

Catalogue search itself was blocked/unavailable in the build environment (AniList 403 / Jikan timeout), so that fallback's live availability remains to be confirmed on device. Existing main-registry mapping can work independently of these catalogue searches. On-device retest is required for Overgeared playback and for first-source timing in VUEO.
