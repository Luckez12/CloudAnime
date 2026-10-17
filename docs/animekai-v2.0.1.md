# AnimeKai v2.0.1 — video segment HTTP403 fix

Apply this ZIP at the CloudAnime root, refresh the repository in VUEO, then rescan the same episode. No new VUEO patch is required. Existing app shared HTTP transport remains in use.

## Confirmed failure

The user performance ZIP captured AnimeKai playback for MAL54492 episode1 and MAL42249 episode1. Both rendered a first frame, then repeatedly received HTTP403 with kind=segment from cdnx.aniwatchtv.site. The first segment failures preceded the SmartSubs source rebuild. The native request used OkHttpDataSource, so the existing shared HTTP transport was active.

Live HTTP replay reproduced the issue with the default source route: initial segments could succeed while later segments around 223 seconds (MAL54492) and 63 seconds (MAL42249) returned HTTP403. The error body was an HTML Website Access Blocked page even though its content type was image/jpeg. This is why root/master validation alone did not catch the playback failure.

The website player has a published fallbackWith(noax=1) path for failure of its Animex relay. Its refresh=1 route still returned the failing relay and the same sampled segment failures. The noax=1 route returned its separate cached-copy source through cp.megavid.buzz; corresponding playback positions succeeded with HTTP206 and MPEG-TS data.

## Change

The provider requests the same exact MAL/episode/Sub source API with the website's noax=1 option from the start. It does not first request the failing relay, retry requests or add segment probes during normal discovery. If the backend ignores the option and returns animex=true, the provider rejects that response rather than returning the known failing relay path.

No per-title or per-episode IDs are embedded in the code. This applies to every mapped title through the same route. No host-specific rules or codec changes are added to VUEO.

Mapping, the 24-second total budget, 26-second runtime allowance, master HLS validation, automatic quality, Japanese/Sub route, English/Malay/Indo filtering and generic playback transport remain unchanged. Unique season discovery still has three HTTP calls: mapping, source JSON, master. Ambiguous mapping can add AniZip lookups.

## Validation

- 22 replay scenarios with current captured fallback API/master responses, including the noax=1 request requirement and rejection when fallback mode is ignored.
- Both user-affected MAL routes returned valid fallback master/child playlists. Segment samples at the failed playback positions returned HTTP206 and valid MPEG-TS sync.
- English subtitle downloads returned HTTP200 with actual WebVTT cues for both affected titles; one has a valid UTF-8 BOM.
- One Punch Man S01E02 also returned a fallback master, plus English/Indonesian subtitle metadata.
- Additional segment sampling spans start, middle and end of both affected fallback episodes. These are audit requests only, absent from discovery.

On-device confirmation is still required. These probes do not guarantee every segment, future CDN availability, session lifetime or all titles. The underlying reason the old relay upstream blocked those segment URLs was not established; no claim of a fixed 60-second token expiry is made.

## Scope

Only manifest.json, providers/animekai.js and this document. Prior provider removals and VidNest filename cleanup are retained. Other providers are unchanged. No YML.
