# AnimeSalt 2.3.0 / CloudAnime 1.8.20

Overlay `providers/animesalt.js` and `manifest.json` into the CloudAnime repository. This patch contains no YML files. It has not been pushed to a repository.

## Changes

Removed the provider's title-specific TMDB ID tables and fixed episode offsets for Bleach and Black Clover. The provider now reads continuous absolute ranges from the website's season buttons, validates their continuity and shared catalogue identity, and locates the requested episode within those ranges. Reset-numbered seasons retain their own numbers.

When the exact title, season or episode is missing, an external mapping path uses ARM's explicit TMDB/TVDB season bridge and AniZip's exact numbered episode records. Every dataset must agree on TMDB, AniList and TVDB identity. It requires complete, contiguous numbered records; combined website parts must agree with all mapped part counts. It does not strip sequel suffixes, infer offsets from airing gaps, use fixed cour lengths, or contain title-specific mappings. Ambiguous, incomplete or unavailable mapping returns no result. Requests remain within the existing 18-second internal budget; mapping has bounded concurrency and a maximum of 12 parts, with no silent truncation.

Existing Ravok and MegaPlay Sub extractors, Japanese audio selection, subtitle handling and website-declared CDN fallback are retained. No TMDB season/episode request is introduced.

Manifest cleanup is preserved: AnimeZey, AniDB and AnikotoTV are absent; AnimeWorld, AnimePahe and Animetsu are disabled. Kurage remains enabled. If old `providers/anidb.js` or `providers/anikototv.js` files remain in the repository, remove them: an overlay ZIP cannot delete them, and the repository validator rejects unregistered providers. AnimeZey was already deleted by the user.

## Validation and limits

68 automated checks passed: 22 catalogue/parser scenarios using captured Black Clover pages, 14 mapping checks with anonymous synthetic identities and a saved public dataset schema check, 23 MegaPlay scenarios using the VUEO 55 CryptoJS shim, and 9 Ravok scenarios using captured One-Punch Man responses. The strict repository validator also passed for all 16 manifest entries. Synthetic mappings verify the algorithm; they do not establish current live coverage for those titles.

Fresh ARM requests for Bleach, Black Clover, The Apothecary Diaries and One-Punch Man returned HTTP 403 in this execution environment. Live ARM/AniZip mapping, current Bleach TYBW routing, Android playback and on-device timing are therefore unverified in this release. The generic external path deliberately refuses mismatched TMDB/TVDB season orders; it does not promise coverage for every anime. A mapping service outage does not affect the direct title/range path.

The supplied Bleach screenshot shows **Thousand-Year Blood War**, while TMDB 30984 S01 E01/E02 requests the **2004 original series**. The captured site search did not contain that original series. This patch will not substitute TYBW episodes for those requests. It cannot create source coverage that the website does not expose.
