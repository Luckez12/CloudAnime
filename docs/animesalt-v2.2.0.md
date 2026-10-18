# AnimeSalt v2.2.0 — Ravok + MegaPlay Sub

CloudAnime 1.8.18 provider-only patch. No YML or VUEO source changes. The existing VUEO (55) generic SRT patch remains applicable.

Added:
- Discover exact megaplay.buzz /stream/s-N/{episode-id}/sub embeds from the already verified AnimeSalt episode page. Never fetch Dub embeds or guess MegaPlay IDs from TMDB/MAL.
- Require the embed's Sub setting, numeric player ID and data-realid matching the linked episode ID.
- Decode the current encrypted getSources response locally through VUEO's existing CryptoJS AES-CBC/native bridge contract and public website codec. No remote decoder, dynamic script evaluation or WebView.
- Verify the returned master/media HLS body and media references. HTML error pages are not playable URLs. If the original CDN fails, fetch the website's check_domain.json and try its declared fallback with the original path/query preserved; no guessed fallback host.
- An explicit unique Japanese audio group uses the existing generic VUEO audio-selection policy. Other explicit audio groups without Japanese evidence are rejected; single-audio HLS relies on the verified Sub embed channel.
- Return available English/Malay/Indonesian caption metadata with its required headers. Ignore other subtitle languages and thumbnails.
- Return Ravok and MegaPlay independently where available. A failure in either extractor does not suppress a valid source from the other. Deduplicate iframe/source URLs and retain original requested TMDB coordinates in source display.

Preserved:
- Ravok extraction, named episode-card parsing, exact episode-page verification, Black Clover absolute numbering and Bleach TYBW mapping.
- No new metadata requests. Existing shared HTTP playback handoff. No child-playlist, segment or subtitle-body downloads during provider discovery.
- Abyss remains unimplemented.

Runtime:
- One scan has an 18-second internal deadline and a 20-second manifest runtime, matching VUEO (55)'s actual 20-second provider cap. Individual calls are limited to the smaller of ten seconds and the remaining scan budget.
- A healthy MegaPlay Black Clover S1E52 path uses seven network requests with seeded metadata; an unusable original CDN adds health + fallback requests, nine total. A source that already works does not fetch CDN health.
- Existing title-page cache bounds remain unchanged. No app timeout increase is included.

Validation on 2026-10-18:
- 78 scenarios passed: 23 MegaPlay cases, 22 Black Clover/parser cases, 21 Bleach mapping cases, nine Ravok extraction cases and three no-match/error cases. MegaPlay tests execute the actual VUEO (55) CryptoJS JavaScript shim with the native AES bridge contract emulated by Node crypto and VUEO's URL snapshot behavior; provider context has no Node Buffer/process access.
- Real Black Clover S1E52 maps to site S2E52. Its current Sub embed, encrypted API payload and website-declared fallback produced one Japanese/Sub MegaPlay HLS source and an English sidecar in an end-to-end live VM run. That diagnostic run used an expanded test deadline because each network operation took several seconds in this environment; the final shipping deadline remains 18 seconds. It does not establish on-device timing or playback.
- Separate live probes fetched the selected child playlist, sampled start/middle/end segments with MPEG-TS sync-byte verification, and read the English caption file with cue timestamps present. Those probes are not part of discovery code.
- Tests cover bad/mismatched embeds, Dub exclusion, malformed ciphertext, API errors, HTML-as-HLS, valid/invalid CDN failover, subtitle filtering, Japanese group selection, duplicate iframes, both-server results and failure isolation. All prior parser/mapping regressions passed.
- Full Android/on-device playback of this provider version remains to be checked.

Device test: select Black Clover (TMDB 73223), S01E52. Expected server MegaPlay with English subtitles when the current website payload remains available. Ravok episodes continue using their existing path.
