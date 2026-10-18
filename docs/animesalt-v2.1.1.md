# AnimeSalt v2.1.1 — named episode cards and Black Clover mapping

CloudAnime 1.8.17 provider-only patch. No YML or VUEO app files. Keep the previously supplied generic VUEO SRT patch.

Trigger: TMDB 73223, Black Clover (2017), S1E1 matched the correct title page but returned no sources after loading the season list.

Cause: the old parser required every card heading to end in season x episode coordinates. Black Clover uses actual episode names (for example, Asta and Yuno) while the exact coordinates are present in the site's own episode links.

Fix:
- Read exact season/episode numbers from same-origin /episode/...-NxM/ links within episode cards. If the heading also declares numbers, require agreement. Reject conflicting/ambiguous candidates and continue to verify the selected episode page's series heading and season/episode before extraction.
- Use the website's current GET season-list AJAX route, including action, season and post parameters. S1E1 is now found directly on the series page and needs no redundant AJAX call.
- Preserve numbered-title layouts used by other series.
- Confirmed Black Clover mapping uses the site's absolute episode numbers rather than resetting every part to episode 1:

| TMDB 73223 request | AnimeSalt |
| --- | --- |
| S1 E1–51 | S1 E1–51 |
| S1 E52–102 | S2 E52–102 |
| S1 E103–154 | S3 E103–154 |
| S1 E155–170 | S4 E155–170 |

The current TMDB root metadata confirms 170 episodes in season 1. The website's visible range labels, counts and requested AJAX lists confirm 1–51, 52–102, 103–154 and 155–170. Mapping validates exact visible ranges, counts and common series-post identity. A changed layout/range returns no result instead of shifting episodes. The newer TMDB season 2 is not substituted with the website's old second part.

Bleach TYBW's prior verified mapping remains intact; its per-part local numbering still starts at 1. Other manifest providers are unchanged. No additional metadata requests or app-specific networking exceptions are introduced.

Server availability:
- Japanese Ravok extraction remains the only supported playback path.
- A page without Ravok now returns an expected NO_MATCH diagnostic that lists observed player hostnames, instead of Provider failed.
- Fresh Black Clover S1E52 -> site S2E52 verification reaches the correct page, but that page currently embeds only megaplay.buzz sub/dub players. Those players are not extracted by this release. This update does not promise playback for every mapped episode.

Validation on 2026-10-18:
- 55 Node VM scenarios passed: 22 Black Clover/parser cases, 21 Bleach mapping cases, nine existing extraction cases and three no-match/error cases. Fixtures use captured current series/AJAX pages, mocked media responses for boundary tests, and the real captured Megaplay-only episode page for unsupported-server handling.
- Live Black Clover S1E1 passed: one Japanese Ravok HLS source, six network calls with seeded metadata, approximately 25 seconds in this environment. No external subtitle track supplied by that Ravok configuration.
- Live S1E52 mapping reached the correct S2E52 page; no Ravok source exists there in the captured page. The unsupported-host handling was then verified against those real page bytes.
- Device playback of this provider version remains to be tested.
