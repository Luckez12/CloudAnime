# VidNest v2.0.1 — filename cleanup

Apply this ZIP to the CloudAnime root, then refresh the repository in VUEO.

The manifest now loads `providers/vidnest.js`. After applying, delete only the old `providers/vidnest-anime.js` file. ZIP extraction cannot delete it automatically.

Display name remains VidNest. The internal provider ID stays `vidnest-anime` to preserve provider settings/toggle identity; it is not a file path. Extraction and playback code are unchanged from the working v2.0.0. No new VUEO patch or YML.

Other providers and their versions remain unchanged, including Anime-Sama. Anime-Sama was audited separately; this patch does not alter its extraction.
