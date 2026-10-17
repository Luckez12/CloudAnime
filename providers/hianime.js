/* CloudAnime HiAnime v2.0.0 — verified ID mapping, one HTTP engine, Sub only. */
(function () {
  "use strict";
  var SITE = "https://megaplay.buzz";
  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  var documents = Object.create(null),
    documentKeys = [];
  function positive(value) {
    var n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function log(stage, message) {
    console.log("[HiAnime] " + stage + ": " + message);
  }
  function address(value, base) {
    if (typeof value !== "string" || value.length > 8192) return "";
    try {
      var u = new URL(value, base);
      return u.protocol === "https:" ? u.href : "";
    } catch (_) {
      return "";
    }
  }
  function attribute(tag, name) {
    var m = new RegExp(
      "(?:^|\\s)" + name + "\\s*=\\s*[\"']([^\"']*)[\"']",
      "i",
    ).exec(tag);
    return m ? m[1] : "";
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
  async function getStreams(id, type, season, episode) {
    id = String(id || "");
    type = type === "series" ? "tv" : type;
    season = Number(season);
    episode = Number(episode);
    if (!/^(?:tt\d+|\d+)$/.test(id) || (type !== "tv" && type !== "movie"))
      return [];
    if (
      type === "tv" &&
      (!Number.isInteger(season) || season < 0 || !positive(episode))
    )
      return [];
    var deadline = Date.now() + 18000,
      calls = 0;
    async function text(url, extra) {
      var left = Math.min(6500, deadline - Date.now());
      if (left <= 0) throw Error("Request budget exhausted");
      var timer,
        controller =
          typeof AbortController === "function" ? new AbortController() : null;
      var opts = {
        headers: Object.assign(
          { "User-Agent": UA, Referer: SITE + "/" },
          extra || {},
        ),
      };
      if (controller) opts.signal = controller.signal;
      calls++;
      try {
        return await Promise.race([
          Promise.resolve()
            .then(function () {
              return fetch(url, opts);
            })
            .then(async function (r) {
              if (!r.ok)
                throw Error(
                  "HTTP " + r.status + " at " + new URL(url).hostname,
                );
              var body = await r.text();
              if (body.length > 2000000)
                throw Error("Response exceeds size limit");
              return body;
            }),
          new Promise(function (_, reject) {
            timer = setTimeout(function () {
              if (controller) controller.abort();
              reject(Error("HTTP timeout at " + new URL(url).hostname));
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
      while (documentKeys.length > 16) delete documents[documentKeys.shift()];
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
      var seen = Object.create(null);
      rows = rows.filter(function (r) {
        if (
          !r ||
          !positive(r.myanimelist) ||
          !(/^tt/.test(id) ? r.imdb === id : String(r.themoviedb) === id) ||
          (type === "movie" ? r.media !== "MOVIE" : r.media === "MOVIE")
        )
          return false;
        var key = [
          r.myanimelist,
          r["themoviedb-season"],
          r.thetvdb,
          r["thetvdb-season"],
        ].join(":");
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      if (type === "movie") {
        var movies = rows.filter(function (r) {
          return r["themoviedb-season"] == null;
        });
        return movies.length === 1
          ? {
              id: Number(movies[0].myanimelist),
              ep: 1,
              method: "exact movie ID",
            }
          : null;
      }
      var exact = rows.filter(function (r) {
        return (
          r["themoviedb-season"] != null &&
          Number(r["themoviedb-season"]) === season
        );
      });
      if (season > 0 && exact.length === 1)
        return {
          id: Number(exact[0].myanimelist),
          ep: episode,
          method: "exact season ID",
        };
      var candidates = exact.filter(function (r) {
        return (
          r["thetvdb-season"] != null &&
          Number(r["thetvdb-season"]) === season &&
          positive(r.thetvdb)
        );
      });
      if (!candidates.length) {
        log("MAPPING", "No explicit season-order bridge");
        return null;
      }
      var datasetById = Object.create(null),
        ids = [];
      candidates.forEach(function (r) {
        var key = String(r.myanimelist);
        if (ids.indexOf(key) < 0) ids.push(key);
      });
      for (var offset = 0; offset < ids.length; offset += 4) {
        await Promise.all(
          ids.slice(offset, offset + 4).map(async function (key) {
            datasetById[key] = await metadata(
              "https://api.ani.zip/mappings?mal_id=" + key,
            ).catch(function () {
              return null;
            });
          }),
        );
      }
      var matches = [],
        matched = Object.create(null);
      candidates.forEach(function (r) {
        var d = datasetById[String(r.myanimelist)];
        if (
          !d ||
          !d.mappings ||
          Number(d.mappings.mal_id) !== Number(r.myanimelist) ||
          String(d.mappings.themoviedb_id) !== String(r.themoviedb) ||
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
          var identity = r.myanimelist + ":" + Number(e.episode);
          if (matched[identity]) return;
          matched[identity] = true;
          matches.push({
            id: Number(r.myanimelist),
            ep: Number(e.episode),
            method: "ARM linked season + AniZip exact episode",
          });
        });
      });
      return matches.length === 1 ? matches[0] : null;
    }
    function decrypt(data) {
      if (typeof data.enc !== "string") return data;
      if (data.enc.length > 1000000 || !/^[A-Za-z0-9_+/=-]+$/.test(data.enc))
        throw Error("Invalid source ciphertext");
      var C = require("crypto-js");
      // Public website AES-CBC codec; key bytes are zero-padded to 32 as in its WebCrypto code.
      var key = C.enc.Hex.parse(
        C.enc.Utf8.parse("i?LMTAx0Q6,:}50U")
          .toString(C.enc.Hex)
          .padEnd(64, "0"),
      );
      var cipher = C.enc.Base64.parse(
        data.enc.replace(/-/g, "+").replace(/_/g, "/"),
      );
      var plain = C.AES.decrypt({ ciphertext: cipher }, key, {
        iv: C.enc.Utf8.parse("W0;27ToaUpl_P%'c"),
        mode: C.mode.CBC,
        padding: C.pad.Pkcs7,
      }).toString(C.enc.Utf8);
      var decoded = JSON.parse(plain);
      if (!decoded || typeof decoded !== "object")
        throw Error("Invalid decrypted source payload");
      return Object.assign({}, data, decoded);
    }
    async function verify(url, headers) {
      var body = (await text(url, headers)).replace(/^\uFEFF/, "").trim();
      if (!body.startsWith("#EXTM3U"))
        throw Error("Source response is not HLS");
      var master = /#EXT-X-STREAM-INF:/.test(body);
      if (!master && !/#EXTINF:/.test(body))
        throw Error("HLS has no media entries");
      var refs = body
        .split(/\r?\n/)
        .map(function (s) {
          return s.trim();
        })
        .filter(function (s) {
          return s && s.charAt(0) !== "#";
        });
      if (
        !refs.length ||
        refs.some(function (s) {
          return !address(s, url);
        })
      )
        throw Error("Invalid HLS media references");
      var audio = body.match(/^#EXT-X-MEDIA:.*TYPE=AUDIO.*$/gm) || [];
      if (
        audio.some(function (s) {
          return !/LANGUAGE="(?:ja|jpn|japanese)"/i.test(s);
        })
      )
        throw Error("Mixed or unverified HLS audio");
      return { url: url, master: master };
    }
    async function extract(mapped) {
      var page = SITE + "/stream/mal/" + mapped.id + "/" + mapped.ep + "/sub";
      var html = await text(page);
      if (!/\btype\s*:\s*["']sub["']/.test(html))
        throw Error("Page did not confirm Sub channel");
      var tags = html.match(/<[^!][^>]*>/g) || [],
        player = tags.find(function (tag) {
          return attribute(tag, "id") === "megaplay-player";
        });
      var playerId = player && attribute(player, "data-id");
      if (!/^\d{1,12}$/.test(playerId || "") || !positive(playerId))
        throw Error("Mapped episode player unavailable");
      var data = decrypt(
        await json(
          SITE + "/stream/getSources?id=" + playerId + "&id=" + playerId,
          { Referer: page, Origin: SITE, "X-Requested-With": "XMLHttpRequest" },
        ),
      );
      var rawSources = [];
      if (typeof data.file === "string") rawSources.push({ file: data.file });
      if (data.sources && !Array.isArray(data.sources))
        rawSources.push(data.sources);
      if (Array.isArray(data.sources))
        rawSources = rawSources.concat(data.sources);
      var seen = Object.create(null),
        sources = rawSources
          .map(function (s) {
            return address(
              typeof s === "string" ? s : s && (s.file || s.url),
              page,
            );
          })
          .filter(function (u) {
            if (!u || seen[u]) return false;
            seen[u] = true;
            return true;
          })
          .slice(0, 6);
      if (!sources.length) throw Error("No source URLs in decoded response");
      var headers = { "User-Agent": UA, Referer: SITE + "/", Origin: SITE },
        selected = null,
        fallbackTried = false;
      // Website-published CDN failover, requested only after an unusable source response.
      for (var i = 0; i < sources.length; i++) {
        try {
          selected = await verify(sources[i], headers);
        } catch (error) {
          if (!fallbackTried) {
            fallbackTried = true;
            try {
              var health = await metadata(SITE + "/lib/check_domain.json");
              var fallback =
                typeof health.fallback === "string"
                  ? health.fallback.toLowerCase()
                  : "";
              var original = new URL(sources[i]);
              if (
                /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(
                  fallback,
                ) &&
                fallback !== original.hostname
              ) {
                selected = await verify(
                  "https://" + fallback + original.pathname + original.search,
                  headers,
                );
                log("CDN", "Website fallback master verified");
              }
            } catch (_) {}
          }
          if (!selected) log("SOURCE", error.message);
        }
        if (selected && selected.master) break;
      }
      if (!selected) throw Error("No verified HLS source");
      var tracks = Array.isArray(data.tracks) ? data.tracks : [],
        trackSeen = Object.create(null);
      var subtitles = tracks
        .filter(function (t) {
          return t && /^(?:captions|subtitles)$/.test(t.kind || "");
        })
        .map(function (t) {
          var lang = language(t),
            url = address(t.file || t.url, page);
          if (!lang || !url || trackSeen[url]) return null;
          trackSeen[url] = true;
          var path = new URL(url).pathname,
            mime = /\.(?:ass|ssa)$/i.test(path)
              ? "text/x-ssa"
              : /\.srt$/i.test(path)
                ? "application/x-subrip"
                : "text/vtt";
          return {
            url: url,
            language: lang,
            name: lang === "en" ? "English" : lang === "ms" ? "Malay" : "Indo",
            mimeType: mime,
            headers: headers,
          };
        })
        .filter(Boolean)
        .slice(0, 16);
      log(
        "EXTRACT",
        (selected.master ? "Master HLS" : "Media HLS") +
          " verified; Japanese/Sub route; " +
          subtitles.length +
          " external subtitles",
      );
      return [
        {
          name: "HiAnime",
          serverName: "MegaPlay",
          title:
            "MAL " + mapped.id + " • Episode " + mapped.ep + " • Japanese Sub",
          url: selected.url,
          type: "hls",
          mimeType: "application/x-mpegURL",
          quality: "Auto",
          audioLanguage: "ja",
          audioType: "sub",
          headers: Object.assign({}, headers, {
            "X-VUEO-HTTP-Transport": "shared",
          }),
          subtitles: subtitles,
          provider: "hianime",
        },
      ];
    }
    var streams = [];
    try {
      var mapped = await mapping();
      if (!mapped)
        log("MAPPING", "No unambiguous title/episode mapping; skipped");
      else {
        log(
          "MAPPING",
          "MAL " +
            mapped.id +
            ", episode " +
            mapped.ep +
            " via " +
            mapped.method,
        );
        streams = await extract(mapped);
      }
    } catch (error) {
      log("ERROR", error.message);
    }
    log("RESULT", streams.length + " sources, " + calls + " HTTP calls");
    return streams;
  }
  module.exports = { getStreams: getStreams };
})();
