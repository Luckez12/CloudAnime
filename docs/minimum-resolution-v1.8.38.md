# CloudAnime 1.8.38 — minimum known resolution 720p

Applies to all 15 enabled CloudAnime provider scripts. No VUEO application changes.

Known heights below 720 are removed from provider results. 720p and higher, Auto, Adaptive, Unknown and missing resolution remain eligible. Explicit dimensions/height, quality metadata and resolution-labelled names/files are recognized; URLs, episode numbers, bitrate and file size are not used to guess resolution. Explicit low-resolution evidence still rejects a stream whose broad quality label says Auto/Unknown. Published numeric dimensions take precedence over display labels.

This is a provider result filter, not a restriction on the adaptive rendition chosen during playback. Auto/Unknown playlists remain unchanged, including any lower renditions they contain. The filter adds no network calls and does not probe media. Streams which survive retain their original object, order, URL, headers and subtitle metadata. If all available links have known low resolution, the result is empty.

Each provider contains its own copy of the policy, so no new runtime imports or app support is required. The final exported getStreams and global aliases use the filter. Providers with the display adapter also filter raw labels before display formatting. Existing errors propagate normally. Provider patch versions are incremented to refresh installed scripts.

Baseline: public Luckez12/CloudAnime main manifest 1.8.37 and its 15 current provider files retrieved for this patch, including the AniZone search and Animetsu source fixes. No older provider snapshots used.

Validation: `node tests/minimum-resolution.cjs`: 840 controlled resolution cases across the 15 real provider initializations, plus export aliases, argument forwarding, sync/async behavior, rejection propagation, context-title protection and exact header/subtitle/object preservation. All provider files pass JavaScript syntax parsing. These tests validate result filtering; they do not establish live playback availability.

ZIP contains manifest, 15 provider scripts, standalone policy source, tests and this note. No YML files.
