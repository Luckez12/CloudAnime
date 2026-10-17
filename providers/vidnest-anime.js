/* CloudAnime VidNest v2.0.0 — exact identity, Aniwave Sub, HTTP only. */
(function () {
  "use strict";
  var SITE = "https://vidnest.fun",
    API = "https://new.vidnest.fun";
  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  var CryptoJS = require("crypto-js");
  var documents = Object.create(null),
    documentKeys = [];
  function log(stage, message) {
    console.log("[VidNest] " + stage + ": " + message);
  }
  function positive(v) {
    var n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function address(u, base) {
    try {
      var x = new URL(u, base);
      return x.protocol === "https:" ? x.href : "";
    } catch (_) {
      return "";
    }
  }
  function host(u) {
    try {
      return new URL(u).hostname;
    } catch (_) {
      return "";
    }
  }
  function language(track) {
    var fields = [
      track.language,
      track.lang,
      track.srclang,
      track.label,
      track.name,
    ];
    for (var i = 0; i < fields.length; i++) {
      var s =
        typeof fields[i] === "string" ? fields[i].trim().toLowerCase() : "";
      if (/^(?:en|eng|english)(?:$|[\s_(-])/.test(s)) return "en";
      if (/^(?:ms|msa|may|malay|bahasa melayu)(?:$|[\s_(-])/.test(s))
        return "ms";
      if (/^(?:id|ind|indo|indonesian|bahasa indonesia)(?:$|[\s_(-])/.test(s))
        return "id";
    }
    return "";
  }
  function b64word(value) {
    var s = String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return CryptoJS.enc.Base64.parse(s);
  }
  function bytes(word) {
    var out = [];
    for (var i = 0; i < word.sigBytes; i++)
      out.push((word.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255);
    return out;
  }
  function word(data) {
    var w = [];
    for (var i = 0; i < data.length; i++)
      w[i >>> 2] = (w[i >>> 2] || 0) | (data[i] << (24 - (i % 4) * 8));
    return CryptoJS.lib.WordArray.create(w, data.length);
  }
  function aesBlock(block, key) {
    // CBC's first block with a zero IV equals ECB. VUEO requires an explicit
    // 16-byte IV even when ECB is requested, so use its supported CBC path.
    var encrypted = CryptoJS.AES.encrypt(word(block), word(key), {
      iv: word(new Array(16).fill(0)),
    });
    return bytes(encrypted.ciphertext).slice(0, 16);
  }
  function xor(a, b) {
    return a.map(function (v, i) {
      return v ^ b[i];
    });
  }
  function multiplyGcm(x, h) {
    var z = new Array(16).fill(0),
      v = h.slice();
    for (var bit = 0; bit < 128; bit++) {
      if (x[bit >>> 3] & (128 >>> bit % 8)) z = xor(z, v);
      var last = v[15] & 1;
      for (var j = 15; j > 0; j--) v[j] = (v[j] >>> 1) | ((v[j - 1] & 1) << 7);
      v[0] >>>= 1;
      if (last) v[0] ^= 225;
    }
    return z;
  }
  function gcmDecrypt(key, iv, payload) {
    if (
      ![16, 24, 32].includes(key.length) ||
      iv.length !== 12 ||
      payload.length < 16 ||
      payload.length > 1048576
    )
      throw new Error("Invalid AES-GCM payload");
    var cipher = payload.slice(0, -16),
      tag = payload.slice(-16),
      zero = new Array(16).fill(0);
    var h = aesBlock(zero, key),
      y = zero.slice(),
      j0 = iv.concat([0, 0, 0, 1]);
    for (var i = 0; i < cipher.length; i += 16) {
      var block = cipher.slice(i, i + 16);
      while (block.length < 16) block.push(0);
      y = multiplyGcm(xor(y, block), h);
    }
    var length = zero.slice(),
      bits = cipher.length * 8;
    for (var k = 15; k >= 8; k--) {
      length[k] = bits % 256;
      bits = Math.floor(bits / 256);
    }
    var expected = xor(multiplyGcm(xor(y, length), h), aesBlock(j0, key)),
      diff = 0;
    for (var t = 0; t < 16; t++) diff |= tag[t] ^ expected[t];
    if (diff) throw new Error("AES-GCM authentication failed");
    var counter = j0.slice(),
      plain = [];
    for (var offset = 0; offset < cipher.length; offset += 16) {
      for (var c = 15; c >= 12; c--) {
        counter[c] = (counter[c] + 1) & 255;
        if (counter[c]) break;
      }
      var mask = aesBlock(counter, key);
      for (var p = 0; p < 16 && offset + p < cipher.length; p++)
        plain.push(cipher[offset + p] ^ mask[p]);
    }
    return CryptoJS.enc.Utf8.stringify(word(plain));
  }
  async function getStreams(id, type, season, episode) {
    type = type === "series" ? "tv" : type;
    id = String(id || "");
    if (!/^(?:\d+|tt\d+)$/.test(id) || ["tv", "movie"].indexOf(type) < 0)
      return [];
    if (
      type === "tv" &&
      (!Number.isInteger(Number(season)) ||
        Number(season) < 0 ||
        !positive(episode))
    )
      return [];
    season = Number(season);
    episode = type === "movie" ? 1 : Number(episode);
    var deadline = Date.now() + 18000,
      closed = false,
      requestCount = 0,
      streams = [];
    async function text(url, headers) {
      var left = Math.min(6500, deadline - Date.now());
      if (left <= 0 || closed) throw Error("Request budget reached");
      var timer,
        controller =
          typeof AbortController === "function" ? new AbortController() : null;
      requestCount++;
      try {
        return await Promise.race([
          Promise.resolve()
            .then(function () {
              return fetch(url, {
                headers: Object.assign(
                  {
                    "User-Agent": UA,
                    Accept: "application/json, text/plain, */*",
                  },
                  headers || {},
                ),
                signal: controller ? controller.signal : undefined,
              });
            })
            .then(async function (r) {
              if (!r.ok) {
                var err = Error("HTTP " + r.status + " at " + host(url));
                err.status = r.status;
                throw err;
              }
              var b = await r.text();
              if (b.length > 2000000) throw Error("Response too large");
              return b;
            }),
          new Promise(function (_, reject) {
            timer = setTimeout(function () {
              if (controller) controller.abort();
              reject(Error("HTTP timeout at " + host(url)));
            }, left);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function json(url, headers) {
      return JSON.parse(await text(url, headers));
    }
    async function metadata(url) {
      var hit = documents[url];
      if (hit && Date.now() - hit.time < 300000) return hit.data;
      var data = await json(url);
      documents[url] = { time: Date.now(), data: data };
      documentKeys.push(url);
      while (documentKeys.length > 12) delete documents[documentKeys.shift()];
      return data;
    }
    async function mapping() {
      var rows = await metadata(
        "https://arm.haglund.dev/api/v2/" +
          (/^tt/.test(id) ? "imdb" : "themoviedb") +
          "?id=" +
          encodeURIComponent(id),
      );
      if (!Array.isArray(rows)) return null;
      rows = rows.filter(function (r) {
        return (
          r &&
          positive(r.anilist) &&
          (/^tt/.test(id) ? r.imdb === id : String(r.themoviedb) === id) &&
          (type === "movie" ? r.media === "MOVIE" : r.media !== "MOVIE")
        );
      });
      var exact = rows.filter(function (r) {
        return (
          r["themoviedb-season"] != null &&
          Number(r["themoviedb-season"]) === season
        );
      });
      if (type === "movie") {
        var movies = rows.filter(function (r) {
          return r["themoviedb-season"] == null;
        });
        if (movies.length === 1)
          return {
            id: Number(movies[0].anilist),
            ep: 1,
            method: "exact movie ID",
          };
        return null;
      }
      // ARM is the season identity authority. No blanket date gate for a unique normal season.
      if (season > 0 && exact.length === 1)
        return {
          id: Number(exact[0].anilist),
          ep: episode,
          method: "exact season ID",
        };
      var candidates = exact.length
        ? exact
        : rows.filter(function (r) {
            return r["themoviedb-season"] == null;
          });
      // Candidate count is not a matching rule. Filter evidence before network work.
      var candidateSeen = Object.create(null);
      candidates = candidates.filter(function (r) {
        if (
          r["themoviedb-season"] == null ||
          r["thetvdb-season"] == null ||
          Number(r["themoviedb-season"]) !== season ||
          Number(r["thetvdb-season"]) !== season ||
          !positive(r.thetvdb)
        )
          return false;
        var key = [r.anilist, r.thetvdb, Number(r["thetvdb-season"])].join(":");
        if (candidateSeen[key]) return false;
        candidateSeen[key] = true;
        return true;
      });
      if (!candidates.length) {
        log(
          "MAPPING",
          "No explicit ARM season-order bridge for requested season",
        );
        return null;
      }
      var tmdb = positive(id) || positive(candidates[0].themoviedb);
      if (!tmdb) return null;
      // VUEO's metadata-only broker does not provide episode details here.
      // Do not request TMDB episodes or mistake a series-shaped body for one.
      var datasetById = Object.create(null),
        ids = [];
      candidates.forEach(function (r) {
        var key = String(r.anilist);
        if (ids.indexOf(key) < 0) ids.push(key);
      });
      // Bound concurrency, never discard candidates solely because there are many.
      for (var offset = 0; offset < ids.length; offset += 4) {
        await Promise.all(
          ids.slice(offset, offset + 4).map(async function (key) {
            datasetById[key] = await metadata(
              "https://api.ani.zip/mappings?anilist_id=" + key,
            ).catch(function () {
              return null;
            });
          }),
        );
      }
      var datasets = candidates.map(function (r) {
        return datasetById[String(r.anilist)];
      });
      // Missing candidate evidence cannot resolve an otherwise ambiguous season.
      if (datasets.some(function (d) { return !d; })) return null;
      var matches = [],
        seenMatches = Object.create(null);
      datasets.forEach(function (d, i) {
        var r = candidates[i];
        // This bridge is allowed only when ARM explicitly equates the two season numbers.
        // Never assume TVDB ordering equals TMDB ordering for an unlinked season.
        if (
          r["themoviedb-season"] == null ||
          r["thetvdb-season"] == null ||
          Number(r["themoviedb-season"]) !== season ||
          Number(r["thetvdb-season"]) !== season ||
          !positive(r.thetvdb)
        )
          return;
        if (
          !d ||
          !d.mappings ||
          Number(d.mappings.anilist_id) !== Number(r.anilist) ||
          String(d.mappings.themoviedb_id) !== String(tmdb) ||
          Number(d.mappings.thetvdb_id) !== Number(r.thetvdb)
        )
          return;
        Object.keys(d.episodes || {}).forEach(function (key) {
          var e = d.episodes[key];
          if (
            !e ||
            !positive(e.episode) ||
            e.seasonNumber == null ||
            e.episodeNumber == null ||
            Number(e.tvdbShowId) !== Number(r.thetvdb) ||
            Number(e.seasonNumber) !== season ||
            Number(e.episodeNumber) !== episode
          )
            return;
          var matchKey = r.anilist + ":" + Number(e.episode);
          if (seenMatches[matchKey]) return;
          seenMatches[matchKey] = true;
          matches.push({
            id: Number(r.anilist),
            ep: Number(e.episode),
            method: "ARM linked season + AniZip exact episode",
          });
        });
      });
      if (matches.length !== 1)
        log(
          "MAPPING",
          "Linked episode candidates=" +
            matches.length +
            "; no safe TMDB episode metadata fallback",
        );
      return matches.length === 1 ? matches[0] : null;
    }
    try {
      var mapped = await mapping();
      if (!mapped) {
        log("MAPPING", "No unambiguous title/episode mapping; skipped");
        return [];
      }
      log(
        "MAPPING",
        "AniList " +
          mapped.id +
          ", episode " +
          mapped.ep +
          " via " +
          mapped.method,
      );
      var nonce = CryptoJS.enc.Base64.stringify(
        CryptoJS.lib.WordArray.random(16),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      var envelope = await json(
        API +
          "/aniwave_hls/" +
          mapped.id +
          "/" +
          mapped.ep +
          "/sub?_n=" +
          encodeURIComponent(nonce),
        { Referer: SITE + "/", Origin: SITE },
      );
      if (
        !envelope ||
        envelope.v !== 2 ||
        typeof envelope.d !== "string" ||
        typeof envelope.n !== "string" ||
        envelope.n.length > 256 ||
        envelope.d.length > 131072
      )
        throw Error("Invalid encrypted source envelope");
      var raw = bytes(b64word(envelope.d));
      var key = bytes(
        CryptoJS.SHA256(
          envelope.n + "|" + "F9k2mR8vL4qP7wY1zN0fG3bS6tH5jC8d_x4R7vN2mP9qL1",
        ),
      );
      var data = JSON.parse(gcmDecrypt(key, raw.slice(0, 12), raw.slice(12)));
      if (!data || typeof data !== "object") throw Error("Invalid source data");
      var meta = data.metadata;
      if (
        meta &&
        ((meta.anilistId != null && Number(meta.anilistId) !== mapped.id) ||
          (meta.episode != null && Number(meta.episode) !== mapped.ep) ||
          (meta.subOrDub && String(meta.subOrDub).toLowerCase() !== "sub"))
      )
        throw Error("Conflicting source identity");
      var list = Array.isArray(data.sources) ? data.sources : [],
        seen = Object.create(null);
      list = list
        .filter(function (s) {
          var u = s && address(s.url || s.file);
          if (!u || seen[u] || String(s.type || "").toLowerCase() !== "sub")
            return false;
          seen[u] = true;
          return true;
        })
        .slice(0, 6);
      for (var i = 0; i < list.length; i++) {
        try {
          var source = list[i],
            url = address(source.url || source.file);
          var referer = address(source.referer) || "https://play.echovideo.ru/";
          var headers = {
            "User-Agent": UA,
            Referer: referer,
            Origin: new URL(referer).origin,
          };
          var body = (await text(url, headers)).replace(/^\uFEFF/, "").trim();
          var lines = body.split(/\r?\n/),
            master = lines.some(function (l) {
              return /^#EXT-X-STREAM-INF:/.test(l);
            });
          if (
            !/^#EXTM3U(?:\s|$)/.test(body) ||
            /<html|<!doctype/i.test(body) ||
            !master
          )
            throw Error("Expected master HLS");
          var variants = lines.filter(function (l) {
            return l.trim() && l.trim()[0] !== "#";
          });
          if (
            !variants.length ||
            variants.some(function (l) {
              return !address(l.trim(), url);
            })
          )
            throw Error("Invalid HLS variant");
          var audio = lines.filter(function (l) {
            return /^#EXT-X-MEDIA:/.test(l) && /TYPE=AUDIO(?:,|$)/.test(l);
          });
          if (
            audio.some(function (l) {
              return !/(?:LANGUAGE|NAME)="(?:ja|jpn|japanese)"/i.test(l);
            })
          )
            throw Error("Mixed or unknown HLS audio");
          var subs = [],
            subSeen = Object.create(null);
          (Array.isArray(data.subtitles) ? data.subtitles : [])
            .slice(0, 64)
            .forEach(function (t) {
              if (!t || typeof t !== "object") return;
              var lang = language(t),
                u = address(t.url || t.file, url);
              if (!lang || !u || subSeen[u]) return;
              subSeen[u] = true;
              var mime = /\.ass(?:[?#]|$)/i.test(u)
                ? "text/x-ssa"
                : /\.srt(?:[?#]|$)/i.test(u)
                  ? "application/x-subrip"
                  : "text/vtt";
              subs.push({
                url: u,
                language: lang,
                lang: lang,
                name:
                  lang === "en" ? "English" : lang === "ms" ? "Malay" : "Indo",
                mimeType: mime,
                headers: headers,
              });
            });
          streams.push({
            name: "VidNest",
            provider: "VidNest",
            serverName: "Aniwave",
            title:
              "Japanese Sub · AniList " + mapped.id + " · Episode " + mapped.ep,
            url: url,
            type: "hls",
            mimeType: "application/x-mpegURL",
            quality: "Auto",
            audioLanguage: "ja",
            audioType: "sub",
            subtitles: subs,
            headers: Object.assign({}, headers, {
              "X-VUEO-HTTP-Transport": "shared",
            }),
          });
          log(
            "EXTRACT",
            "Aniwave Sub; master HLS verified; " +
              subs.length +
              " subtitle tracks",
          );
          break;
        } catch (e) {
          log("EXTRACT", String(e.message || e));
        }
      }
    } catch (e) {
      log("ERROR", String(e.message || e));
    } finally {
      closed = true;
      log(
        "RESULT",
        streams.length + " sources, " + requestCount + " HTTP calls",
      );
    }
    return streams;
  }
  module.exports = { getStreams: getStreams };
})();
