# Reanime2.0.3 — same-date episode mapping

Provider-only update. Keep the working VUEO generic segment-transform app patch.
Overlay this ZIP at CloudAnime root, refresh provider code and rescan.

The Apothecary Diaries TMDB220542 has several AniList seasons associated with TMDB
season1. Its first three episodes also share the date2023-10-22. The previous exact
date check found three episodes and rejected them without examining episode titles.

When multiple episodes share the exact requested broadcast date, this version compares
TMDB's episode name against the existing AniZip multilingual episode titles. Exactly
one episode and one candidate must remain. Missing, unmatched or duplicate titles
still fail closed. Identity and date checks remain in place. No fuzzy title search,
first-result fallback, title ID hardcoding, or extra HTTP requests were added.

Verified using captured ARM, TMDB and four AniZip responses: S01E01 Maomao maps to
AniList161645 episode1; episodes2/3 are independently distinguished by their titles.
18 provider integration scenarios pass. Playback extraction and HD-2 segment
instructions are unchanged from the user-confirmed working2.0.2 baseline.
This validation does not claim testing every title or end-to-end Android playback.
