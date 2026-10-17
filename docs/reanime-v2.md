# Reanime v2.0.0 — standalone rebuild

Install order:
1. Apply APP-VUEO-Flix-HLS-Compatibility-TV-Mobile-No-YML.zip to VUEO repo root,
   build/install updated Mobile/TV app using existing workflow.
2. Apply this CloudAnime ZIP at CloudAnime repo root, refresh repository/provider.
Old VUEO cannot decode these HLS playlists. This is a functional dependency.

Normal TV request: ARM real /themoviedb or /imdb endpoint -> unique explicit season
AniList identity -> Reanime /api/flix/{AniList}/{episode} -> Flix serialized player data
-> playback token -> master HLS. One Punch Man 63926 S1E1 fixture uses five HTTP calls.
A unique movie identity uses the same route with episode 1.
No title search, broad date-window ranking, shared TMDB warmup, Cinemeta, download page,
progress probe, duplicate HD embed extraction or subtitle-body prefetch on this path.

Ambiguous seasons/show-wide entries and specials: only then load the exact TMDB episode
and at most four AniZip candidate datasets; identity + exact air date must yield one episode.
Both broadcast date and preview airdate are considered. No guessed offsets/episode fallback.
Unresolved mapping returns a clear no-result message, not a synthetic HTTP404 for a fake route.

Only published sub servers are used. HD aliases of the same access ID share one extraction;
a second published profile is attempted only when the first master fails. Master is required;
no silent MKV download fallback. AES-128 media segments remain standard Media3 playback.

The site key module is interpreted through a bounded i32 subset (16KiB module, 64 locals,
50k instruction budget per function), not eval/Node/WebAssembly. Existing VUEO crypto-js
shim supplies SHA256/HMAC/AES; PBKDF2 is derived using its HMAC primitive. No runtime
module download or third-party API server is used. Unknown protocol revisions fail closed.
The protocol was checked against current website player JS and cross-checked against the
public ReAnime.to-API reference; implementation is a standalone independent runtime port.

Manifest decoding key travels in an explicit source URL fragment. Updated VUEO strips
that fragment before networking, decodes playlists and retains only Japanese audio groups.
External subtitles are limited to English/Malay/Indonesian from published language labels.
Japanese-labelled signs/songs are not relabelled as English based on secondary text.

Budgets: 18s request deadline, per-call at most 6.5s, 2MB text responses, 12 metadata entries
cached for five minutes, at most three unique Flix access IDs and two published profiles each.
Signed playback URLs are freshly extracted; no long-lived source cache is added.

Validation:
- 13 full-provider fixture scenarios using the actual VUEO crypto-js compatibility shim.
- One Punch Man S1E1: 5 requests and exact captured HLS URL/manifest key; S2 selects its own ID.
- Ten independent key-interpreter inputs match native WASM, including playlist key extraction.
- Actual master/video/audio playlists decoded; Japanese-only master policy tested.
- Live HTTP200 master/video/audio + HTTP200 16-byte AES key + HTTP206 segment sample.
  Decrypting the sample yields MPEG-TS sync bytes at 188-byte intervals.
- Java codec and Kotlin wrappers compile; six transport integration checks use Android/Media3
  API stubs. They verify child key inheritance, headers, no extra requests, binary passthrough,
  other-provider passthrough and SubtitleSession factory integration.
- Full Android APK build/device playback has not been executed in this environment.

The provider file is rebuilt; unrelated providers retain manifest versions from supplied
CloudAnime + previously delivered Reanime1.0.6 baseline. No YML or VUEO UI file changes.
