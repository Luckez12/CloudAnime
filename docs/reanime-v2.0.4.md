# Reanime 2.0.4 — mapping compatible with VUEO metadata broker

Provider-only patch based on the supplied Reanime 2.0.3 patch. Overlay at CloudAnime root and refresh the repo. No VUEO or YAML changes. Preserve the existing working generic HLS instruction support in the app.

## Root cause reproduced

Inspected VUEO-NEXT-main (53), PluginDiscoveryContext.kt. Its broker intercepts TMDB requests and synthesizes a TMDB series-shaped body from addon seed metadata. The current expected-details path check also accepts trailing season/episode segments, so the provider's episode URL can return series metadata instead of name/air_date/season_number/episode_number. Reanime 2.0.3 required those episode fields for ambiguous-season date/title matching and therefore failed closed. The timestamped trace marking that URL completed does not prove real episode metadata was received.

Captured ARM and AniZip responses for TMDB 220542 show multiple AniList seasons assigned to TMDB season 1. For the requested first season, ARM explicitly links TMDB season 1 with TVDB season 1 for AniList 161645. Its AniZip dataset confirms the same AniList/TMDB/TVDB IDs and explicit per-episode TVDB show ID, seasonNumber and episodeNumber. The other candidates have different linked TVDB seasons or missing mapping data.

## Change

Remove the TMDB episode request and embedded TMDB credential. For ambiguous seasons, allow mapping only when ARM explicitly links the requested TMDB season to the same-number TVDB season, AniZip corroborates all three series IDs, and exactly one positive AniList episode has the requested explicit show/season/episode fields. Deduplicate identical matches; conflicting or missing evidence remains unresolved. No earliest-season heuristic, title hardcoding, date guess, fuzzy title search, first-result fallback or absolute-episode assumption is added.

This is a deliberately limited ordering bridge backed by explicit season and episode fields. Different TMDB/TVDB orders without such evidence are unsupported; the patch does not claim universal episode equivalence. In the included captured fixtures S01E25 is skipped rather than assigned speculatively to another AniList season.

The existing unique-season and movie paths remain unchanged. Extraction, subtitle filtering, Japanese-audio rules and generic HLS playback instructions are byte-identical after the mapping function. Mapping now uses five requests for this case (ARM plus four parallel AniZip datasets), rather than six including the unavailable TMDB episode metadata.

## Validation

`node tests/reanime-mapping.cjs` passes captured-data S1E1–E4 mappings, wrong dataset/show IDs, conflicting seasons, duplicate/conflicting candidate evidence, unsupported E25, unique season and movie scenarios. The audit additionally ran the old provider against a VUEO-style series metadata fixture and reproduced its failure for S01E01. Manifest comparison confirms only Reanime's descriptor and repository version changed.

Live Reanime endpoints /api/flix/161645/1 and /api/flix/161645/2 returned HTTP 200, success true and published HD-1/HD-2 sub servers. Dub entries are still excluded by unchanged extraction filtering. This confirms server discovery, not end-to-end Android playback or subtitle timing.
