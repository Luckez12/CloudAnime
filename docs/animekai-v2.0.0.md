# AnimeKai v2.0.0

Apply at the CloudAnime root, refresh the repository in VUEO and rescan. Existing provider ID and filename remain animekai / providers/animekai.js.

## Website selection

Both animekai.li and animekai.be returned HTTP200 during the audit. They use different site templates; no official affiliation or mirror relationship is asserted.

The .be One Piece and One Punch Man pages expose explicit MAL links, but their two listed Sub servers pointed to the same MegaPlay URL. That path overlaps the existing working HiAnime provider.

The .li watch pages publish MegaPlay plus two MegaVid MAL-based routes. For the sampled One Punch Man episode, both MegaVid variants resolved to the same default upstream/video. The new provider uses the plain MAL route only, avoiding duplicate requests. Its default source supplied an HLS master, valid child playlist and MPEG-TS segment data through cdnx.aniwatchtv.site; this gives an additional playback route compared with the sampled .be MegaPlay links.

The provider follows the .li-published MegaVid MAL backend directly. It does not browse the .li catalogue during each scan, so its coverage follows the reachable MAL player backend and may differ from the titles displayed on the frontend.

## Processing

1. Resolve the requested TMDB/IMDb season to MAL using exact ARM identity. Ambiguous seasons require corroborating AniZip identities and explicit episode numbers. Incomplete evidence skips; no fuzzy titles or guessed season offsets.
2. Call the public MegaVid /mal/{MAL}/{episode}/sub/source JSON endpoint published in the player-payload. Player HTML was read during the audit and is not downloaded during discovery.
3. Accept only an OK HLS payload and a valid HTTPS master. Reject foreign explicit audio groups or conflicting identity metadata. Return one master, preserving automatic quality selection.

Unique season: three HTTP requests. Ambiguous eligible mapping adds AniZip lookups, deduplicated and batched with concurrency four. Total budget 24 seconds, source API call up to 10 seconds, other calls up to 9 seconds (all constrained by the same total deadline). Discovery stops at the master; no subtitle, segment or child-playlist probes. No retries, speculative alternate domains, Dub calls or delayed background extraction.

The upstream route establishes the Sub classification. Japanese audio is not independently identified from the video samples. Missing identity confirmation is never invented.

## Subtitles and compatibility

Forward only explicitly labelled English, Malay and Indonesian captions/subtitles, with VTT/ASS/SRT format metadata and player headers. Actual cue downloading is left to playback/SmartSubs. The sampled default English subtitle URL at hls.dramahot.top returned HTTP403 in one check and timed out in subsequent header comparisons. Video verification does not establish subtitle availability; this patch does not claim that external subtitle access is fixed. Other published backend provider options were observed but are not fanned out during discovery.

Uses the generic X-VUEO-HTTP-Transport: shared opt-in already installed for Ani.pm. No site-specific code, host, keys or new files are added to VUEO. No new app patch, crypto module or WebView is required.

## Validation

21 replay scenarios: captured One Punch Man S01E02 source API/master, exact title/episode routing, Sub only, missing/wrong identities, wrong MAL/episode/audio metadata, unavailable source, HTTP404, HTML responses, master/audio checks, subtitle filtering/MIME, ambiguous Apothecary mapping, missing mapping evidence, movies and IMDb input. Tests use VUEO-style URL snapshots.

Live audit on 2026-10-17 UTC: both frontends, .li-published MegaVid player, source JSON, master, child and MPEG-TS segment verified. Child/segment requests were audit-only. The source endpoint later measured approximately 7.9 seconds across three header variants; initial shorter 6–7 second harness limits cut it off. The final provider allows up to 10 seconds for that source call with a final 24-second total scan limit. ARM also timed out intermittently. A full production run with an 18-second total budget reached the media CDN but exhausted that budget before the master response completed; the final budget is 24 seconds with runtime allowance 26 seconds. Three calls reduce overhead but do not guarantee fast upstream responses. The final full production run from TMDB 63926 S01E02 succeeded with one source, three real HTTP calls and a verified master in 22,384 ms (no mapping fixture). This is evidence of correct live discovery, not fast performance or Android playback. Android playback remains unconfirmed.

## Patch scope

manifest.json, providers/animekai.js and this document. Preserves prior removal of Anime-Sama/AnimeDekho, VidNest filename cleanup, HiAnime 2.0.0, Reanime 2.0.5 and Ani.pm 1.0.4. No YML.
