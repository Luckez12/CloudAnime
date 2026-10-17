# Ani.pm1.0.4 — opt into shared HTTP playback

Install the accompanying VUEO shared HTTP transport app patch first, then refresh
this provider and rescan. Existing1.0.3 extraction, mapping, session proof and
subtitle logic remain unchanged. The source now carries the generic transport
instruction X-VUEO-HTTP-Transport: shared. It is attached only to returned streams,
not provider discovery requests. VUEO consumes and strips it before HTTP.

User logs prove master/root403 during player open, while provider discovery reads
that master successfully. This change aligns the player with the same native
OkHttp client used for discovery. It is a targeted correction of the transport
mismatch; the exact server rejection reason and successful device playback are
not yet confirmed. No extra probes, site proxy, URL rewriting or WebView added.

The manifest retains the latest Reanime2.0.5 descriptor. No Reanime code is included.
