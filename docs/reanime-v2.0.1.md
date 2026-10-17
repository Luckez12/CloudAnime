# Reanime 2.0.1 — two Sub profiles + generic playback instructions

Apply the paired generic HLS VUEO app patch first, build/install, then apply this ZIP
at CloudAnime repository root and refresh/rescan. Provider2.0.1 and the generic app
protocol are paired; old Flix-only app instructions are replaced.

Fix: v2.0.0 grouped HD-1 and HD-2 by access ID and treated the second profile as a
fallback. Now every published Sub profile is extracted independently. Distinct v=1
and v=2 profiles are retained, one master per profile, two extractions concurrently,
site server order preserved. One server's failure does not discard the other.
Duplicate identical [embed URL, server name] entries are still removed. Dub excluded.
At most six Sub entries are processed. Normal two-server route uses eight HTTP calls
(ARM + Reanime server list + three per profile), or seven with cached ARM metadata.
More requests than a one-profile scan are necessary to obtain both published links;
network/Android timing is not guaranteed. Search/date/Cinemeta/progress skipping stays.

Domain checks, Flix field/key extraction, language choices and subtitle filtering
remain in this provider. It sends an explicit generic HLS specification:
#vueo_hls_v1=base64-xor&key=<hex>&audio=ja,jpn,japanese
The updated app has no Flix domain, UUID route or Japanese-only policy. It provides
bounded plain/base64-XOR HLS processing and applies the provider's audio list.
No arbitrary JavaScript is executed by the app during media playback.

Validation: 13 provider integration scenarios pass with captured actual website data
and the exact VUEO crypto compatibility shim. Actual HD-1 and HD-2 streams have distinct
URLs and both masters decode. Episode2 /api/flix/21087/2 was checked: HD-1 and HD-2 Sub
are published. One profile failing leaves the other. Existing mapping/subtitle tests pass.
App validation: codec checks plus ten Kotlin transport scenarios, including arbitrary
non-Flix domain/opaque path, English selection, no language filter, unmarked passthrough
and invalid policy rejection. Full Android build/device playback remains unverified.
