# AnimeNoSub v1.0.0

CloudAnime only. Adds one provider to the migrated 16-provider v1.1.0 manifest. Existing entries remain unchanged. No workflows or package scripts changed.

Direct requests to https://animenosub.to; no hosted Anivexa API dependency. WordPress search, episode-list and Base64 iframe fields were observed on live pages. Protocol reference: https://github.com/walterwhite-69/Anivexa-API/tree/main/providers and /extractors (accessed 2026-10-11 UTC). This provider was independently implemented; runtime mapping/filter/display helpers are retained from CloudAnime.

Mapping: ARM plus ani.zip episode dates, then AniList verifies MAL identity and Japanese origin. Exact catalog aliases only; multiple matches, unverifiable episodes, fractional specials and unknown labels are skipped. This may omit valid streams rather than select a different season.

Servers: Nova AES-CBC API, Vidmoly plaintext HLS, legacy plaintext MegaPlay sources. Unknown hosts and encrypted MegaPlay are skipped with diagnostics. Each server resolves independently; one error does not discard another server. HLS must return #EXTM3U; master playlists win over variants for the same server. Audio groups explicitly declaring foreign or unidentified languages are rejected. External subtitle tracks are limited to English, Malay and Indo. Hardcoded subtitles and actual audio cannot be verified from metadata alone.

Live website/search/episode parsing was checked. Sample MegaPlay player returned an error page in this environment, so live playback is unconfirmed. Fixture checks cover successful extraction, encrypted Nova, mapping mismatch, non-JP titles, incorrect season/title, dub labels, master selection, foreign audio groups and subtitle filtering.

ZIP contains only providers/animenosub.js, manifest.json and this note. No YML needed.
