# AnimeKai v2.0.5 — MegaPlay CDN fallback

CloudAnime 1.8.41. Apply the ZIP at the repository root; no enclosing folder, deletions or workflow changes. Standalone provider replacement works on the original upload, v2.0.3 or v2.0.4.

Retains the Server 1 / Server 2 verified-HLS race, cancellation, exact published episode checks, allowed subtitle languages, exclusion of Server 3 and the existing shared deadline. No release-date validation.

Fixes MegaPlay discovery failing when the decoded URL at fetch.nexabloom.top returns HTTP 403 or an HTML error. Media headers use the player origin and root Referer. Only after an original HLS fails, read the website's /lib/check_domain.json with a cache-burst query, accept a valid declared fallback hostname and request the same path/query on that HTTPS host. Verify that response as HLS before returning it. Never hard-code the currently observed fallback domain. Losing fallback requests participate in race cancellation. No health request is added when original HLS works. Original MegaPlay HLS probing is capped at four seconds and reserves remaining time for fallback within the existing deadline.

The sanitized VUEO log showed the direct MegaVid player path rather than its JSON endpoint. The actual code still requests /source?noax=1. A new endpointSuffixValid diagnostic records whether the constructed URL includes the expected endpoint suffix without relying on a sanitized URL display. MegaVid's HTML response has not been proven to be caused by redirect, app rewriting or upstream blocking; this patch does not claim to resolve that uncertainty. Existing one-retry behavior remains, while MegaPlay can recover independently.

Validation: all 15 providers pass validation; 18 controlled regression cases pass, including CDN fallback, rejected invalid host, fallback HLS validation, no health call on original success and cancellation during fallback. Live probe of the website-declared fallback for the exact S2E1 media path in the reported log returned HTTP 200 with a valid 1080p/720p/480p HLS master. A separate live provider run exhausted its deadline after slow upstream requests; successful full provider playback in VUEO is not established. This verifies playlist access, not full playback in VUEO.

Run: npm ci --ignore-scripts; node scripts/validate.mjs; node scripts/test-animekai-v205.cjs. Older version-specific tests describe their older releases. Only AnimeKai's manifest entry and the top-level version change; other provider files/entries remain unchanged.
