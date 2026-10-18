# AnimeWorld 2.0.1 / CloudAnime 1.8.23

Overlay `providers/animeworld.js` and `manifest.json` into CloudAnime. No app patch or YML files are included. No repository push has been performed.

## Japanese original audio only

MultiAudio sources remain eligible when the native HLS master proves Japanese audio is available. The returned URL now includes the existing generic VUEO instruction `#vueo_hls_v1=plain&audio=ja,jp,jpn,japanese`. This fragment is consumed locally by VUEO and removed before the HTTP request. The player keeps Japanese audio renditions, marks them default, and preserves video variants/qualities. It does not transcode or duplicate the video. Subtitle forwarding remains unchanged.

No discovery stages or network calls are added. This uses the existing ProviderHlsDataSource/ProviderHlsCodec integration in the supplied VUEO repository 55. No host-specific app logic is introduced. Source metadata now says Japanese Original rather than MultiAudio because playback exposes the filtered language.

## Missing results in the supplied provider log

The uploaded log contains four AnimeWorld scans:

- Apothecary Diaries S1E1: one source, one subtitle, approximately 4.66 seconds.
- Apothecary Diaries S1E2: one source, one subtitle, approximately 4.56 seconds.
- Black Clover S1E52: exact site episode unavailable.
- Black Clover S2E1: exact site season unavailable.

On 2026-10-18 the current Black Clover catalogue at `https://watchanimeworld.one/series/black-clover/` declares only Season 1. Both the catalogue episode cards and its live Season 1 AJAX response contain 51 unique episodes, numbered 1 through 51. Thus the series existing on the website does not establish that E52 or Season 2 is published there. The provider does not replace E52 with E1 or substitute an older website season for the new TMDB season. No mapping change or per-title exception was added.

## Verification and limits

17 provider regression scenarios passed with captured website/player data, including original-only instructions, exact identity, real English captions, missing Japanese audio and error handling. The strict repository validator passed all 16 manifest providers.

The actual Java ProviderHlsCodec from supplied VUEO repository 55 was compiled and executed against the captured live five-language master. The result contains one Japanese audio track with DEFAULT=YES/AUTOSELECT=YES; English/Hindi/Tamil/Telugu renditions are removed and the video variant count is unchanged. Tests also covered LF/CRLF line endings, no-policy passthrough and missing-language rejection. No app source change was needed.

The user confirmed playback works after obtaining fresh sources in 2.0.0. This release changes the audio policy only. On-device Japanese-only selection still needs confirmation. The earlier HTTP 403 was not conclusively diagnosed; this patch does not claim to solve signed-link expiry or upstream rejection.

Manifest preserves AnimeSalt 2.3.0, Kurage 2.0.0, AnimeWorld enabled and the prior cleanup/disabled providers. Remove retired provider files identified in earlier cleanup patches if they still remain; overlay ZIPs cannot delete them.
