# AnimeWorld 2.0.0 / CloudAnime 1.8.22

Overlay `providers/animeworld.js` and `manifest.json` into the CloudAnime repository. No YML or app changes are included. This ZIP has not been pushed to a repository.

## Repairs and reduced work

The old `.top` website redirects to `.one`, while the old parser accepted only literal `.top` series/episode links. The replacement uses the current `.one` catalogue and reads the player host from the selected episode iframe; the current published host is `play.zephyrix.org`, replacing the old `.top` player.

Uses VUEO shared root metadata once, exact title/year search and exact season/episode links. Confirms the episode's own Open Graph title and canonical URL rather than matching an incidental episode link elsewhere on the page. No per-title TMDB tables, guessed slug, fixed episode offsets or substitute season are used. If website numbering differs from the requested numbering without explicit evidence, it returns no source rather than inventing a mapping.

Removed the TMDB season request that was used only for display text, the old compatibility/display wrappers, fabricated 1080p/codec claims, first-search-result selection and guessed `subtitle_eng.srt` path. Search is bounded to two verified title aliases and stops after an exact match. Existing episode cards are used directly; the season AJAX request is made only when the requested episode is not already present.

Player API and subtitle configuration page are requested concurrently. Uses the API's supplied signed native `securedLink`; the current `videoSource` `.txt` route returns a security-error response and is not a playable HLS master. Packed subtitle configuration is decoded by string substitution, never evaluated. Optional subtitle-page failure does not suppress an otherwise valid original-audio source.

The fetched master must contain a Japanese audio rendition referenced by every video variant. **MultiAudio is accepted** when Japanese is available. The master URL is returned unchanged: all native languages remain selectable, including dubs. This provider does not force a default audio track or remove other tracks. Japanese-only sources are also accepted; a source without verified Japanese audio is not accepted as original Japanese anime audio. Published en/ms/id subtitle sidecars are forwarded without downloading them during discovery. The 18-second provider budget remains below VUEO's 20-second cap.

For the tested first Apothecary episode, the source declares Japanese, English, Telugu, Tamil and Hindi, with one published English caption. The caption URL has an `.html` suffix and HTML response type but contains actual SRT text with decimal timestamps; the provider supplies the SRT MIME type. The previously supplied VUEO generic SRT-normalization fix is relevant to that format.

## Validation and limits

17 automated scenarios passed using freshly captured website/player responses, including exact episode identity, stale-domain avoidance, MultiAudio acceptance, signed HLS selection, real caption forwarding, missing Japanese audio, orphan audio groups, HTML responses, wrong title/year/ID, unavailable episodes, foreign links and optional subtitle failure. The repository's unchanged validator passed all 16 providers.

Current live stage checks fetched search, series, season AJAX, episode, player configuration, source API and signed master. Native Japanese and video child playlists were readable; sample segments from both started with valid MPEG-TS synchronization bytes. The real caption response contained SRT cues.

A live extractor run, with the four catalogue responses replayed from those captures and all three player/API/HLS requests made live, returned one MultiAudio source and one English caption in approximately 13.2 seconds using the shipped 18-second budget. This is not a fully live end-to-end timing claim. A cold fully live attempt could not finish discovery within the budget because this environment spent approximately 7.7 and 8.1 seconds on the first two catalogue requests. Full Android/TV playback, audio selection and subtitle rendering still need device verification.

## Manifest

AnimeWorld is re-enabled at 2.0.0. AnimeSalt 2.3.0, Kurage 2.0.0 and previous cleanup choices are preserved. AnimePahe and Animetsu remain disabled. As with the previous cleanup overlay, remove retired `providers/anidb.js` and `providers/anikototv.js` if still present; ZIP overlays cannot delete old files and the repository validator rejects unregistered providers.
