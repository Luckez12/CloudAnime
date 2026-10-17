# HiAnime2.0.0 — standalone rebuild

Apply at CloudAnime repository root, refresh provider code, then rescan.
No YAML or VUEO source changes are included. Uses the shared HTTP transport app
patch already confirmed working by the user for Ani.pm1.0.4.

## Replaced

Removed both legacy engines, duplicate mapping wrappers, TMDB external_ids calls,
Jikan title guesses, summed-season offsets, saved Dub preferences and obsolete
Vidwish/MegaCloud route attempts. This version directly uses the currently working
MegaPlay Sub route behind the existing HiAnime provider ID.

The old external_ids flow expected a top-level imdb_id but received VUEO's synthesized
series-shaped metadata with external_ids.imdb_id. It stopped before reaching video
servers. The old source decoder also expected sources.file while MegaPlay now
publishes AES-CBC encrypted enc. Correcting only metadata would not restore links.

## New flow

1. ARM TMDB/IMDb identity -> exact MAL season/episode. Unique normal seasons and
   movies use the fast path. Ambiguous seasons reuse the corroborated linked-season
   pattern tested for Reanime: explicit matching ARM TMDB/TVDB season link, then
   matching MAL/TMDB/TVDB identities and exact episode fields from AniZip. No
   candidate-total ceiling, per-title ID exceptions or guessed first matches.
2. Fetch /stream/mal/{MAL}/{episode}/sub, require its Sub setting and episode player.
3. Fetch the site's getSources response and decrypt enc locally using the existing
   VUEO CryptoJS AES-CBC shim and the public website codec. No decryption service,
   eval, WebView or additional runtime module.
4. Verify the HLS body, reject HTTP200 HTML and unverified/mixed audio groups.
   If the published source fails, request the website's check_domain.json and try
   its declared fallback host, retaining the source path/query. No guessed domains.
5. Return the verified master with source headers and en/ms/id subtitle metadata.
   Request shared playback HTTP using the existing generic app instruction.

A healthy unique season needs four requests (ARM, page, sources, master). Ambiguous
linked episodes add only eligible AniZip datasets. The captured Apothecary episode
uses seven requests including one AniZip dataset and the two CDN fallback calls.
Metadata cache:16 entries,5min. Per-scan budget18s, per-call6.5s, body limit2MB.
Discovery does not fetch child playlists, segments or subtitle bodies. Subtitle
tracks are taken from the site's captions metadata; subtitle cue rendering and
full playback still require Android verification.

## Evidence and tests

Current MegaPlay for MAL54492 episode1 returned an encrypted source. The original
URL returned an HTML unavailable page. Its website-published fallback returned a
valid master; its relative child playlist and a real segment sample returned200,
with MPEG-TS sync bytes at188-byte intervals. These live probes were separate from
normal discovery and are not added to the provider scan.

16 replay scenarios pass using VUEO's actual CryptoJS shim/native bridge contract
and its URL snapshot behavior: real encrypted response, CDN fallback, healthy fast
path, same-day episodes1–3, unique season and movie paths, no Dub requests, subtitle
language filtering, no child probes, mismatched identities, unavailable players,
malformed ciphertext, API failure, invalid CDN destinations and HTTP200 HTML.

This is not a claim of full Android playback, all-title coverage or universal
TMDB/TVDB episode ordering. Uncorroborated ordering remains unresolved. Website
codec constants are held only in provider code, not VUEO. Updated manifest preserves
Reanime2.0.5 and Ani.pm1.0.4. VidNest settings/code are unchanged by this patch.
