# Animetsu v2.1.3

Explicit resolutions below 720p are excluded from Bee and GG before media requests. 720p+, Auto, Unknown and missing quality remain eligible. Dimension labels use the video height.

GG probes at most three eligible quality entries, each through the published proxy and direct URL where distinct. Probes race in parallel with Bee. Only the first GG route with an HTTP 206 response, a bounded initial byte range, video/mp4 MIME and a recognizable MP4 box signature is returned. Invalid media, HTML, unbounded HTTP 200 responses and duplicate URLs are excluded. All losing requests are cancelled when a server succeeds. Signed URLs and media bytes are never cached.

Each probe has a 10-second ceiling within the existing 36-second overall budget; success returns immediately. UTF-8 text bridge verification searches ASCII MP4 box names without assuming their decoded byte offset. This verifies a partial media response, not full decoding or playback on Android. A server ignoring Range is conservatively rejected.

52 controlled regression tests cover routing, races/cancellation, MIME/body/range failures, deduplication, 720p filtering and Auto/Unknown acceptance. The prior device log recorded three successful first frames with delayed startup; this patch does not change player buffering or networking.

Build validation: a test using the previously recorded Blue Box GG API response plus fresh media requests selected one GG 720p MP4 after 6.1 seconds. Fresh full-API runs hit API/playlist timeouts in this environment. Full native Android playback is not verified for this build.
