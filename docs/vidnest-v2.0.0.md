# VidNest v2.0.0

Apply this ZIP at the CloudAnime repository root, then refresh CloudAnime in VUEO. The provider display name becomes VidNest. Its existing ID `vidnest-anime` and filename stay the same to preserve configuration identity.

## Changes

- Replaces the retired backend host and legacy server fan-out with the website current Aniwave Sub route.
- Uses the same exact ARM/AniZip identity and episode mapping approach as the working Reanime rebuild. No per-title IDs, guessed absolute offsets, first-search result or TMDB episode calls.
- Handles the current authenticated AES-GCM envelope in the provider using the existing VUEO CryptoJS primitives. The site public codec key and host configuration are provider code only.
- Accepts explicitly Sub-labelled sources. Requires a valid master HLS and rejects HTML/error bodies and foreign or unidentified explicit audio groups. Unlabelled HLS audio relies on the API Sub classification; Japanese audio is not independently measured.
- Returns the first verified Aniwave master, with provider playback headers and available English/Malay/Indo subtitle metadata. Does not split quality variants into duplicate source entries.
- No Dub/Hindi, HiAnime/Anitaku or Megaplay API calls, external decrypt API, WebView, retries, speculative fallbacks, or subtitle/segment probes during discovery.
- Three HTTP calls for a unique season: ARM, Aniwave API, master. Ambiguous eligible season mapping adds AniZip requests, checked in batches of four. Budget 18 seconds; each request up to 6.5 seconds.

## Compatibility

No new VUEO app patch is included. Playback opts into the generic shared HTTP transport already installed for Ani.pm. No VidNest domain or key is added to the app.

## Validation

Seventeen replay cases use the actual VUEO CryptoJS shim: captured encrypted API response, authentication tampering, mapping, same-day premiere episode ordering, wrong identities, API error, Dub filtering, invalid HLS, audio groups and subtitle filtering.

Live checks on 2026-10-17 UTC retrieved Apothecary Diaries S01E01 through the current API, decrypted its authenticated response, retrieved master and child HLS and confirmed MPEG-TS sync in a segment sample. Those child/segment requests are audit-only and absent from production discovery. A full fresh TMDB-to-source run was also attempted twice; ARM timed out in this environment before extraction. Mapping was validated using captured upstream ARM/AniZip data and the same mapping approach already used in Reanime. On-device playback is not yet confirmed. Site rotations and ambiguous upstream mappings may still return no result rather than guess.

## Patch contents

Only manifest.json, providers/vidnest-anime.js and this document. Other provider versions are retained, including HiAnime 2.0.0, Reanime 2.0.5 and Ani.pm 1.0.4. No YML.
