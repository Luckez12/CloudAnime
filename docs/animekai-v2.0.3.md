# AnimeKai v2.0.3 — published episode guard

CloudAnime 1.8.39. Extract this ZIP at the repository root. Paths are relative to that root; no enclosing project directory or workflow changes.

The old provider sent mapped MAL/episode directly to MegaVid. A playable HLS response was accepted even when the website had not published that episode. Source identity fields were optional; an HLS playlist alone does not prove season/episode identity.

The provider now uses the ARM anime-planet slug only as a lookup hint for animekai.li's episode page. It requires the watch-page slug, active local episode, published episode entry and Sub availability to match. It then reads an actual page-listed Sub server and checks its MAL ID and episode against the ARM mapping. Redirects that select another episode, unpublished entries, wrong MAL/episode routes, and uncertain no-sub/dub server labels return no streams before source discovery. No release-date checks or added metadata services.

Normal direct path: ARM -> website episode -> supported MegaVid source -> HLS check (four HTTP requests; previously three). The existing ambiguous-mapping AniZip branch remains. An unknown/unusable ARM catalogue slug fails closed. MegaPlay and Vidmoly extraction are not implemented by this patch; if the page lists only those or uncertain MegaVid sources, no stream is returned. A website/server can still mislabel the media itself; this patch verifies published page-to-player identity, not video content frames.

Validation: `node scripts/validate.mjs` validates all 15 providers. `node scripts/test-animekai-v203.cjs` passes 13 controlled regression cases. Recorded live .li HTML rejects the E6 request redirected to active E5 and accepts exact E1 with mocked source/HLS responses. Recorded E5 HTML has only unsupported or explicitly uncertain server options and is correctly skipped. A subsequent live end-to-end E6 run timed out on the website and returned zero links; successful live playback has not been verified. The unrelated existing Animetsu test cannot start because its hard-coded animetsu_update/providers/animetsu.js fixture is absent; it was not modified.

Only AnimeKai's entry and the top-level version change in manifest.json. Other provider entries and files are unchanged.
