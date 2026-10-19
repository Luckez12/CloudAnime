# Animetsu v2.1.2

Adds explicit GG Direct MP4 alternatives alongside the existing GG proxy qualities. Select GG Direct when the API proxy fails to open in the native player. Preserves the published direct URL, quality and AnimeGG Referer. Signed media URLs are never cached. This supplies an alternative route; it does not change Android player timeouts or guarantee device playback.

The supplied performance log reports an api.animetsu.site root-open failure with status -1 and no first frame. It omits the exception, full source URL, title and provider debug details, so the exact device/network cause remains unconfirmed.

Fresh Blue Box E1 tests returned HTTP 206 and MP4 bytes for both proxy and direct routes; the direct route redirected to a media CDN. Neither header variant distinguished the proxy failure in this environment. Device playback remains to be tested. Controlled regression suite: 46 passing cases. Title-first routing and first completed server behavior retained.
