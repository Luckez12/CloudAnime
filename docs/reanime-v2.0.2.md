# Reanime2.0.2

Requires the accompanying VUEO generic media-transform app patch, based on uploaded
repo53. Build/install the app first, refresh provider code, then rescan.

HD-1/HD-2 remain separate Sub results. Mapping and discovery are unchanged: exact
season IDs take the direct AniList route; no new requests are added (eight HTTP
calls for two published profiles before metadata caching).

The provider now declares the website HLS loader's segment wrapper patterns and
XOR key via optional generic source instructions. These website format constants
are maintained in provider code, not in VUEO. The app strips and conditionally
XOR-decodes only media references inherited from opted-in playlists.

Verified against real HD-2 S01E02 video/audio samples and website player code.
Decoded media is recognized as H.264 1080p/AAC. This is not a claim of tested Android
playback or successful full APK compilation. Install both patches before testing.
