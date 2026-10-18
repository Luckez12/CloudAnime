# AnimeSalt v2.0.1 — CloudAnime 1.8.15

Provider-only update. The previously delivered VUEO (55) generic SRT patch is unchanged and still applies.

Trigger: TMDB 30984, Bleach (2004), S01E01 returned No exact title/year match through console.error, so VUEO incorrectly displayed Provider failed.

Fresh website evidence on 2026-10-18: searching Bleach returns only the series titled Bleach: Thousand-Year Blood War, with no search pagination. The site labels that sequel page 2004, while listing four seasons and 46 episodes. TMDB alternatives also include later-series names. That combination cannot verify original Bleach S01E01.

Changes:
- Expected missing/ambiguous title, missing season and missing episode cases use NO_MATCH diagnostics rather than console.error. Actual transport/metadata/parser failures still report an error.
- SEARCH diagnostics include query, requested year, exact candidate count and up to five actual result titles. Year rejections include requested/site years.
- Alternate titles which extend a primary/original title are not accepted without a season mapping; primary/original titles themselves remain valid. This avoids treating an alternate sequel title as original season one.
- No automatic substitute to TYBW. This update does not add an original Bleach source.
- Ravok Japanese audio selection, subtitles, HLS extraction and existing provider settings remain as in v2.0.0. All other manifest provider records unchanged from CloudAnime 1.8.14.

Validation: 12 Node VM scenarios passed: nine existing provider cases plus the exact user request with captured fresh search data, full real TMDB alternative-title data with no unrelated episode extraction, and a simulated network error. Existing captured One-Punch Man extraction still returns Japanese HLS with its English sidecar. Android/on-device verification remains pending. No YML included.
