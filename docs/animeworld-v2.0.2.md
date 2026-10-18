# AnimeWorld 2.0.2 / CloudAnime 1.8.24

Overlay `providers/animeworld.js` and `manifest.json` into CloudAnime. No YML or app changes are included. No repository push has been performed.

## Root cause

The supplied log already showed a correct exact-title candidate for Smoking Behind the Supermarket with You (2026). The failure came afterward: the previous provider scanned up to 16,000 characters after the page heading for any four-digit year. That region could include recommended series, comments or synopsis text. It therefore rejected the correct page after collecting unrelated years such as 2022, 2020, 2023, 2025 and 2018.

The replacement identifies the unique primary `article.single`, its own H1 and its explicit year field. Nested year spans are read as a complete element. Unrelated article years and synopsis numbers are not used as identity evidence. A missing, invalid or conflicting primary year still fails closed; the fix does not simply accept a page whenever the requested year appears anywhere.

This applies to all titles using the current catalogue structure. No TMDB-ID exception, title-specific year, substituted series or inferred episode offset was added.

## Search and episode route

Search by the shared metadata title first, followed by a distinct verified alias only if needed, with the existing two-query bound. Match exact normalized title/alias and the primary catalogue release year. Stop searching after a unique verified match. Locate the exact requested season/episode in the site's episode cards; request that site's season list only when the card is not already present. Verify the selected episode's own title/coordinates and canonical URL.

Episode names are not used as independent catalogue search queries. For this title, S1E1 is already on the series page, so discovery needs no season AJAX call and no Japanese-alias search after the successful first match.

The Japanese-only VUEO HLS policy, all video quality variants, English/Malay/Indonesian subtitle forwarding, signed native HLS route and existing request budget are unchanged. The repair adds no HTTP requests.

## Validation

28 automated checks passed: the previous 17 provider regression scenarios plus 11 primary identity cases. These cover the captured failing page, unrelated recommendation years, numbers in the synopsis, wrong/missing primary years, conflicting primary identities and reproduction of the old wide-scan failure. The repository's unchanged validator passed all 16 providers.

Fresh live captures verified the website's search result, primary year 2026, S1E1 card, episode metadata and current FirePlayer URL for Smoking Behind the Supermarket with You. A test replayed those freshly captured catalogue responses while making the actual player page, player API and signed HLS requests live under the shipped 18-second budget. It returned one source, three verified native audio renditions including Japanese, a Japanese-only playback instruction and one English subtitle in approximately 13.8 seconds. Total request count was six: one title search, series page, episode page, player page, source API and native master. This is a live extractor check with replayed catalogue pages, not a fully live end-to-end timing or Android playback claim.

Manifest preserves AnimeSalt 2.3.0, Kurage 2.0.0, AnimeWorld enabled and all earlier cleanup choices. As before, old retired provider files must be absent for strict validation; overlay ZIPs cannot delete them.
