# Reanime2.0.5 — candidate processing, not title-specific exceptions

Provider-only patch based on the user's working2.0.4. Overlay at CloudAnime root,
refresh provider code, then rescan. No app or workflow/YAML update is needed.

Root cause: mapping returned null before inspecting any episodes when ARM supplied
more than four candidate rows. ReZERO65942 has five normal-season candidates linked
to TMDB season1, so2.0.4 stopped after the ARM request. This was an arbitrary total
candidate limit, not missing website content or a playback failure.

Changes apply to all titles:
- Remove the rejection based solely on total candidate count.
- Move the existing explicit TMDB/TVDB linked-season eligibility check before fetch.
- Deduplicate equivalent candidate rows and load each AniList dataset once.
- Check eligible candidates in groups of four to bound concurrency; every group is
  evaluated within the existing request deadline. Four is a concurrency limit now,
  not a total-candidate ceiling. Conflicting matches still fail closed.
- Retain2.0.4's corroborated AniList/TMDB/TVDB IDs and exact episode fields.
- Keep unique-season/movie fast paths, no TMDB episode call, no title search, and
  the existing working extraction/subtitle/HD-2 media instructions.

Verified ReZERO S01E01 resolves to AniList21355 episode1. Mapping needs ARM plus
one eligible AniZip response; with server lookup the fixture performs three calls.
Apothecary Diaries mapping likewise drops from five metadata requests to two.

Regression checks include reversed/duplicate ARM rows, nine eligible candidates
with a match in the last group, conflicting matches across groups, captured
Apothecary episodes1–4, wrong IDs/order, unique-season and movie paths.

This is a general fix for candidate handling, not a claim that every anime ordering
can be resolved. Missing mappings or different uncorroborated TMDB/TVDB episode
orders still require trustworthy evidence; no guessed offsets or per-title IDs are
embedded in production provider code. Fixtures contain real IDs for regression tests.
