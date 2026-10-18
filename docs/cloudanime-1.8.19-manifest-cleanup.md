# CloudAnime 1.8.19 — manifest cleanup + AnimeSalt 2.2.0

Apply this ZIP at the CloudAnime repository root, then refresh the repository/provider list in VUEO.

Removed from manifest:
- AnimeZey (animezey), already deleted by the user.
- AniDB (anidb).
- AnikotoTV (anikototv).

Disabled in manifest pending rebuild:
- AnimeWorld (animeworld).
- AnimePahe (animepahe).
- Animetsu (animetsu).

AnimeSalt remains enabled at v2.2.0 with Ravok + MegaPlay Sub. Its exact previously delivered provider code is included so this patch also carries that update. Existing generic VUEO SRT support remains applicable.

IMPORTANT — obsolete files:
The current ZIP overlay workflow copies files and cannot delete existing repository files. Delete these files in the repository if still present:
- providers/anidb.js
- providers/anikototv.js
- providers/animezey.js (the user already removed AnimeZey)

The existing strict validator rejects unregistered provider JS files until those obsolete files are removed. This ZIP does not change or weaken validation and does not modify workflows. Other prior retired files should remain deleted as before.

The manifest now contains 16 providers: 13 enabled and three disabled. Disabled provider JS files remain in the repository and retain their original code/version. Every other retained provider record and version is preserved exactly from the v1.8.18 manifest.

Validation: removal/disable assertions passed; included AnimeSalt code matches the delivered v2.2.0 bytes; the repository's existing validator passed on a staged final tree with retired files absent. This validates manifest/file structure and JavaScript syntax, not playback of every retained provider. No YML included.
