# AnimeSalt v2.1.0 — verified Bleach TYBW mapping

Provider-only patch for CloudAnime 1.8.16. No VUEO app files or workflows included. The existing VUEO (55) generic SRT patch remains applicable.

TMDB 30984 groups original Bleach in season 1 and Thousand-Year Blood War in season 2. AnimeSalt publishes the TYBW page as four separate parts, each starting at episode 1. A primary-title search for Bleach therefore cannot be accepted directly as an original-series match.

Verified mapping (TMDB 30984 only):

| VUEO / TMDB | AnimeSalt |
| --- | --- |
| S2 E1–13 | TYBW S1 E1–13 |
| S2 E14–26 | TYBW S2 E1–13 |
| S2 E27–40 | TYBW S3 E1–14 |
| S2 E41–50 | TYBW S4 E1–10, only when that episode exists on site |

As checked on 2026-10-18, the site lists 13/13/14/6 episodes. Thus S2E46 maps to available site S4E6, while S2E47 returns no result until the site lists S4E7. The verified range currently stops at TMDB S2E50. Other IDs/seasons receive no new inferred mapping.

Evidence: current TMDB season metadata has a season-2 title Thousand-Year Blood War, numbered episodes and distinct broadcast runs beginning at episodes 1, 14, 27 and 41. Current AnimeSalt series/season lists have matching 13/13/14 completed part lengths and a partially available fourth part. The website misleadingly retains the root series year 2004; title alone or year alone is not used to substitute season one.

Implementation:
- An explicit verified mapping entry carries the confirmed offsets; no runtime TMDB season request is added. This respects VUEO's existing metadata context, which supplies root-series metadata rather than episode timelines.
- On a missing main title, only a known requested ID/season may recover to its exact scoped site title.
- Reuse current search results, verify exact scoped title/year and all visible site part numbers/counts/post identity, then verify the returned episode page title and local season/episode.
- Any changed part structure, closed-part count mismatch, unknown mapping, out-of-range episode or unavailable source episode returns no sources. Original Bleach S1E1 remains untouched.
- Source display retains the original requested TMDB season/episode. MAPPING and EPISODE diagnostics show the site coordinates separately.
- Ordinary discovery keeps the 45-second deadline. A mapped route has up to 60 seconds total with a 64-second runtime cap, per-request cap 10 seconds. Mapping adds no metadata call; fetching another site's season list may add one existing AJAX request.
- Ravok extraction, Japanese-only audio selection and sidecar handling remain unchanged.

Validation:
- 21 end-to-end mapping scenarios passed against captured real search/part-list fixtures and mocked media responses: eight range/boundary positions, original season protection, missing target, out-of-range and unknown mapping, changed counts/numbering/identity, mismatched returned episode, metadata identity and native VUEO JSON-string bridge without TMDB season calls.
- Nine existing extraction cases and three no-match/error cases passed: 33 scenarios total.
- Final provider-only live validation passed: TMDB S2E1 -> site S1E1 (six HTTP calls, approximately 31 seconds here) and S2E14 -> site S2E1 (seven HTTP calls, approximately 36 seconds here). Both returned one verified Japanese HLS source; no runtime TMDB season request was made. Neither tested Ravok configuration supplied an external subtitle track.
- Device playback for this mapping is not yet verified. No YML included.
