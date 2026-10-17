# CloudAnime provider cleanup

Apply this ZIP at the CloudAnime root, then refresh the repository in VUEO.

Anime-Sama and AnimeDekho entries are removed from manifest.json as requested. ZIP application cannot delete existing files. You may delete only these obsolete provider files after applying:

- providers/anime-sama.js
- providers/animedekho.js
- providers/vidnest-anime.js

The working VidNest v2.0.1 is included as providers/vidnest.js. Its stable internal provider ID remains vidnest-anime; that is not a filename. Its extraction is unchanged. HiAnime 2.0.0, Reanime 2.0.5, Ani.pm 1.0.4 and all other entries are retained.

## AnimeKai audit — no extraction patch yet

The current provider v1.0.5 targets https://www3.anikai.cc rather than assuming it is the historic animekai.to implementation. The source performs TMDB metadata/season requests, loose title matching (including first-result movie fallback), episode-count-based guessed season offsets, then extracts both Sub and Dub groups before the adapter filters results. Embed extraction scans raw/packed HTML for m3u8 strings without proving the selected title/episode or validating the HLS response.

On 2026-10-17 UTC, repeated direct checks of the configured homepage and browser search timed out; anikai.cc also timed out. animekai.to and anikai.to returned HTTP502 in this environment. Search-indexed pages for the configured www3.anikai.cc show Sub sources and HD server choices, but indexed content does not establish current extraction/playback health. The existing provider is retained unchanged; it has not been declared fixed or disabled.

A rebuild needs a reachable configured site and verifiable title/episode/server evidence. No speculative replacement decoder, unrelated-domain migration, new VUEO app patch or YML is included.
