# AnimeWorld 2.0.3 / CloudAnime 1.8.25

Overlay `providers/animeworld.js` and `manifest.json` into CloudAnime. No YML or app changes are included. No repository push has been performed.

## Named episode pages

The current Jujutsu Kaisen S1E1 page uses `Ryomen Sukuna` as its Open Graph title. The previous provider incorrectly required every episode SEO title to contain `Series Name 1x1`. The correct episode had already been selected from the site's season list; this additional presentation-format requirement caused the false rejection.

Episode identity now uses a chain of website evidence: the exact numbered link published by the verified series catalogue/season list, the episode's exact canonical URL, and the parent-series navigation inside the primary player area. Open Graph URL conflicts, a different parent series, wrong requested coordinates, duplicate/missing canonicals and explicitly conflicting numbered SEO titles still fail. Named SEO titles are allowed. It does not accept arbitrary title search results, choose another series, or guess episode offsets.

The implementation is generic and contains no Jujutsu-specific title/ID mapping. Search remains title/verified alias first; season and episode selection use the verified catalogue cards. No HTTP requests, fallback engines or retries are added. Japanese-only audio and real subtitle forwarding remain unchanged. Scoped primary-year parsing from 2.0.2 is preserved.

## Verification

43 automated checks passed: 17 provider regression cases, 11 primary-year identity cases, 14 episode identity cases and one Jujutsu captured-chain discovery replay. Captured named/numbered pages cover Jujutsu Kaisen S1E1, Apothecary Diaries E1/E2 and Smoking Behind the Supermarket E1. Negative cases cover wrong parents, canonical/OG conflicts, wrong numbers and missing/ambiguous primary player evidence. The repository's unchanged validator passed all 16 manifest providers.

Fresh live requests retrieved the Jujutsu series, Season 1 AJAX list, episode, source API, player subtitle configuration and native master. A replay using those captured episode/player/API/master responses returned one Japanese-only source and one English subtitle in seven HTTP calls with one title query. Its search card was a representative fixture consistent with the supplied successful exact-title search log. This is not an Android playback or fully live end-to-end timing claim.

## Apothecary E2 playback remains open

The supplied provider log establishes successful discovery of the exact E2 page and source. It does not contain the player error after video starts, so this release does not claim to fix that failure.

Separate live media diagnostics fetched the E2 native master, Japanese audio playlist, lowest and highest video playlists. First/middle/last segment range samples for all three playlists (nine samples) returned HTTP 206 and valid MPEG-TS synchronization bytes. These are diagnostic probes only; none are added to production discovery. Sampled valid bytes do not prove continuous playback, decoding or subtitle rendering on the user's device.

A new Performance export recorded while E2 actually fails is needed to identify the failing playlist/segment/subtitle request or decoder exception. The earlier Performance ZIP showed a root-playlist HTTP 403 before video started; it cannot establish the cause of this new post-start failure. No speculative retry, cache, subtitle removal or app change was introduced.

Manifest preserves AnimeSalt 2.3.0, Kurage 2.0.0, AnimeWorld enabled, original-only audio and all prior cleanup decisions. Earlier retired provider files must still be absent for strict validation; an overlay ZIP cannot delete them.
