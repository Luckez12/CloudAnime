# Reanime 1.0.6 — identity and episode matching

Replace repository-root paths from this ZIP. No YML or build files.
CloudAnime manifest 1.7.4. Reanime 1.0.6.
Includes the previously delivered Ani.pm 1.0.3 unchanged to keep manifest/code consistent;
it only removes extra child probes and does not fix Ani.pm playback 403.

Reanime fixes:
- Replace first date-window AniList selection with the existing independently verified
  ARM / ani.zip / episode metadata adapter used by the repaired CloudAnime providers.
- Require a verified anime identity and episode. No guessed season offsets or broad title fallback.
- Search matches explicit AniList ID, never cover-image digits or a highest weak title score.
- Conflicting IDs, missing IDs, ambiguous site entries, unsafe slugs and movie/TV conflicts are rejected.
- Detail and HTML fallbacks cannot switch to a different AniList ID.
- Existing sub-only filtering and FlixCloud extraction remain in place.

Limits: titles lacking verified mappings may now return no results. This deliberately
avoids substituting another show/season. API availability and playback are not guaranteed.
Existing provider timeout remains 19 seconds; unavailable metadata can exhaust this budget.

Validation: JavaScript syntax check and 12 fixture/integration scenarios passed.
Includes actual Reanime search response for Naruto (Oct17 local time), checking Naruto,
Shippuden, unrelated IDs, conflicting/missing identity, type conflicts, unsafe slug,
ambiguity, mapped episode route, unavailable mappings and detail fallback ID conflict.
No end-to-end live playback claim. No VUEO app rebuild required for this provider patch.
