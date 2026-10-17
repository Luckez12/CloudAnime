/* CloudAnime AnimeKai v2.0.0 — animekai.li published MegaVid MAL route, Sub only. */
(function () {
  "use strict";
  var SITE = "https://megavid.buzz";
  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  var documents = Object.create(null),
    documentKeys = [];
  function positive(value) {
    var n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function log(stage, message) {
    console.log("[AnimeKai] " + stage + ": " + message);
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
    var deadline = Date.now() + 24000,
      calls = 0;
    async function text(url, extra) {
      var left = Math.min(
        url.indexOf(SITE + "/mal/") === 0 ? 10000 : 9000,
        deadline - Date.now(),
      );
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
      if (
        ids.some(function (key) {
          return !datasetById[key];
        })
      )
        return null;
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
    async function verify(url, headers) {
      var body = (await text(url, headers)).replace(/^\uFEFF/, "").trim();
      if (!body.startsWith("#EXTM3U"))
        throw Error("Source response is not HLS");
      var master = /#EXT-X-STREAM-INF:/.test(body);
      if (!master) throw Error("Source is not a master HLS");
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
      // Source API published by animekai.li's MegaVid player. Exact MAL routing
      // avoids loading the player HTML or performing any title search.
      var path = "/mal/" + mapped.id + "/" + mapped.ep + "/sub";
      var page = SITE + path;
      var api = page + "/source";
      var headers = { "User-Agent": UA, Referer: page, Origin: SITE };
      var data = await json(
        api,
        Object.assign({}, headers, { Accept: "application/json" }),
      );
      if (!data || data.status !== "ok")
        throw Error(
          "Source unavailable: " + String((data && data.status) || "unknown"),
        );
      if (
        data.type &&
        !/^(?:hls|m3u8|application\/(?:x-mpegurl|vnd.apple.mpegurl))$/i.test(
          data.type,
        )
      )
        throw Error("Source is not HLS");
      // Reject conflicting identities if an upstream starts supplying them.
      var identity = data.metadata || data;
      if (
        (identity.mal_id != null && Number(identity.mal_id) !== mapped.id) ||
        (identity.malId != null && Number(identity.malId) !== mapped.id) ||
        (identity.episode != null && Number(identity.episode) !== mapped.ep) ||
        (identity.subOrDub &&
          String(identity.subOrDub).toLowerCase() !== "sub") ||
        (identity.audioLanguage &&
          !/^(?:ja|jpn|japanese)$/i.test(identity.audioLanguage))
      )
        throw Error("Conflicting source identity/audio");
      var url = address(data.source);
      if (!url) throw Error("No HTTPS source");
      var selected = await verify(url, headers);
      var tracks = Array.isArray(data.tracks) ? data.tracks : [],
        seen = Object.create(null),
        subtitles = [];
      tracks.slice(0, 64).forEach(function (t) {
        if (!t || !/^(?:captions|subtitles)$/.test(t.kind || "")) return;
        var lang = language(t),
          u = address(t.file || t.url, page);
        if (!lang || !u || seen[u]) return;
        seen[u] = true;
        var pathname = new URL(u).pathname;
        subtitles.push({
          url: u,
          language: lang,
          name: lang === "en" ? "English" : lang === "ms" ? "Malay" : "Indo",
          mimeType: /\.(?:ass|ssa)$/i.test(pathname)
            ? "text/x-ssa"
            : /\.srt$/i.test(pathname)
              ? "application/x-subrip"
              : "text/vtt",
          headers: headers,
        });
      });
      log(
        "EXTRACT",
        "Master HLS verified; MAL/Sub route; " +
          subtitles.length +
          " subtitle tracks supplied",
      );
      return [
        {
          name: "AnimeKai",
          provider: "animekai",
          serverName: "MegaVid",
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
          subtitles: subtitles.slice(0, 16),
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
