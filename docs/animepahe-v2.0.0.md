# CloudAnime 1.8.27 — AnimePahe 2.0.0

Copy manifest.json and providers/animepahe.js into the matching CloudAnime repository paths. No YML files included. This patch follows the AnimeWorld 2.0.4 / manifest 1.8.26 patch; its changes are retained. Other providers are unchanged. AnimePahe remains disabled by default until device access/playback is verified. Use manual provider debug (or temporarily enable it for testing), then send the new debug log.

## Confirmed root cause

The supplied 1.0.8 log executes two identical /tv/220542/external_ids requests and exits before contacting AnimePahe. Two embedded engines each expect a top-level imdb_id. The inspected VUEO metadata broker supplies synthesized root metadata, with IMDb nested in external_ids, and does not provide an upstream external_ids API response. Both engines consequently exit with no visible reason.

The rebuild removes that entire dependency. It does not repair the symptom by adding more external_ids calls or an embedded TMDB API key.

## Single discovery route

1. ARM lookup by exact TMDB ID and requested type/season. AniZip validates the returned MAL/TMDB/TVDB identity and joins the requested coordinates to an exact anime-local episode. Live responses confirm TMDB 220542 S1E2 maps to MAL 54492 E2.
2. Search using the dataset's published titles, with at most two queries and three exact-title candidates. A site's own anime detail page must publish exactly the expected MAL ID. A site's internal numeric ID is never mistaken for MAL. No first-result/title-substring substitution.
3. Select the exact release episode. No flooring of fractional episodes. Fetch first release page, and the computed target page at most once when required; no loop through six pages.
4. Fetch that release's play page. Prefer explicit button audio/resolution attributes; Japanese audio must be identified by the published button/release metadata. Dub players are not requested.
5. Decode only packed literal strings from published Kwik players, without eval. Return only their actual native HLS URL after checking the playlist. No download-redirect path or invented MP4 derivative. Published multi-audio HLS with a Japanese rendition uses the existing original-audio playback instruction.

## Process reduction

Removed duplicate engines, wrapper/filter stacks, IMDb requests, Jikan requests, the legacy mapping endpoint, arbitrary third-party proxy/fake cookie, random timestamps appended to search queries, guessed MP4 URLs and swallowed failure reasons. The file shrinks from 1,830 lines to roughly 140. The previous settings selector is removed because the inspected VUEO runtime has no provider-settings bridge for it.

Existing vueoMetadataCache support is optional. It stores compact mapping/search/entry/release metadata for up to five minutes, scoped by the app to provider/repository version. Play pages, Kwik pages, signed streams and playlists are always fetched fresh. Older apps without that cache bridge still execute normally.

## Mapping boundary

The TV path requires an explicit compatible ARM TMDB/TVDB season bridge and a dataset entry whose TVDB show/season/episode and local anime episode agree. TVDB ordering is not blindly reused when its season differs from the requested TMDB season. Some cross-order/split-season cases can therefore return no results. This is an explicit limitation, not per-title hardcoding or a claim that every anime season now maps. Expanding these cases requires authoritative target episode metadata; a guessed offset is not added here.

## Tests and live access limitation

29 executable scenarios passed. They use live ARM/AniZip captures for The Apothecary Diaries and Spirited Away plus controlled AnimePahe HTML/API, packed Kwik and HLS responses. Cases cover exact identity, movie/type/season mismatch, fractional and duplicate episodes, original/dub/unknown audio, foreign player hosts, ambiguous/missing media, wrong HLS audio, computed pagination, shared metadata reuse and explicit blocked-site diagnostics. The main cold replay uses eight HTTP requests; a repeated scan with metadata cached uses three fresh requests: play page, Kwik page and HLS.

The current site itself blocked this environment. Direct requests to .pw/.com/.org received Cloudflare block pages, and the cloud browser on .pw displayed “Sorry, you have been blocked”. No CAPTCHA was solved, proxy used or site-access workaround attempted. .si returned a connection failure. Current catalogue HTML and actual episode playback could not be captured. The rebuilt site/Kwik parsers therefore remain unverified against a live current page, and a successful replay must not be presented as a successful live playback test.

Run TMDB 220542 S1E2 in manual provider debug on the phone. MAPPING should show MAL 54492 E2, followed by SEARCH/EPISODE/SOURCE or an explicit NO_RESULT reason. If HTTP 403/security challenge appears, the device's access is the next blocker; the old IMDb shape issue has already been removed. Do not enable for ordinary scanning until the device test succeeds.

References used for the existing site's API/player schema: the supplied AnimePahe provider source; published source of AnimePahe Improvements (https://gist.github.com/Ellivers/f7716b6b6895802058c367963f3a2c51) documents #resolutionMenu data-src/data-resolution/data-audio attributes; ARM API docs and live AniZip mapping responses. No public third-party API proxy is part of this provider.
