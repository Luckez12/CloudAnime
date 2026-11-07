/* CloudAnime AnimeKai v2.0.4 — animekai.li published MegaVid MAL route, Sub only. */
(function () {
  "use strict";
  var SITE = "https://megavid.buzz";
  var CATALOGUE = "https://animekai.li";
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
    function scope() {
      return { stopped: false, pending: new Set(), cancel: function() {
        this.stopped = true;
        this.pending.forEach(function(cancel) { cancel(); });
        this.pending.clear();
      }};
    }
    async function text(url, extra, task) {
      if (task && task.stopped) throw Error("Race request cancelled");
      var left = Math.min(
        url.indexOf(SITE + "/mal/") === 0 ? 10000 : 9000,
        deadline - Date.now(),
      );
      if (left <= 0) throw Error("Request budget exhausted");
      var timer, cancel,
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
            cancel = function() {
              if (controller) controller.abort();
              reject(Error("Race request cancelled"));
            };
            if (task) task.pending.add(cancel);
            timer = setTimeout(function () {
              if (controller) controller.abort();
              reject(Error("HTTP timeout at " + new URL(url).hostname));
            }, left);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        if (task && cancel) task.pending.delete(cancel);
      }
    }
    async function json(url, headers, task) {
      var body = (await text(url, headers, task)).replace(/^\uFEFF/, "").trim();
      if (body.charAt(0) === "<") {
        log("RESPONSE", new URL(url).hostname + new URL(url).pathname + ": HTML received where JSON expected");
        throw Error("HTML response instead of source JSON");
      }
      try { return JSON.parse(body); }
      catch (_) { throw Error("Invalid JSON at " + new URL(url).hostname + new URL(url).pathname); }
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
              slugHint: movies[0]["anime-planet"],
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
          slugHint: exact[0]["anime-planet"],
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
            slugHint: r["anime-planet"],
          });
        });
      });
      return matches.length === 1 ? matches[0] : null;
    }
    async function verify(url, headers, task) {
      var body = (await text(url, headers, task)).replace(/^\uFEFF/, "").trim();
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
    function attributes(tag) {
      var out = Object.create(null), match;
      var re = /([\w-]+)\s*=\s*(["'])(.*?)\2/g;
      while ((match = re.exec(tag))) out[match[1].toLowerCase()] = match[3]
        .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      return out;
    }
    async function episodeServer(mapped) {
      // ARM slug is only a catalogue lookup hint, never identity proof.
      // The episode snapshot must publish the requested episode and bind its
      // player URL to the exact mapped MAL ID, local episode and Sub route.
      var hint = typeof mapped.slugHint === "string" ? mapped.slugHint : "";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(hint))
        throw Error("No catalogue slug hint; cannot verify website episode");
      var page = CATALOGUE + "/watch/" + hint +
        (mapped.ep === 1 ? "" : "/ep-" + mapped.ep);
      var html = await text(page, { Referer: CATALOGUE + "/" });
      var tags = html.match(/<[a-z][^>]*>/gi) || [];
      var watch = null, published = false, players = [];
      tags.forEach(function(tag) {
        var attrs = attributes(tag);
        if (attrs.id === "watch-page") watch = attrs;
        if (Number(attrs["data-number"]) === mapped.ep &&
            attrs["data-published"] === "1" && attrs["data-has-sub"] === "1") published = true;
        if (attrs["data-server-url"] && attrs["data-lang"] === "sub") players.push(attrs);
      });
      if (!watch || watch["data-anime"] !== hint ||
          Number(watch["data-episode"]) !== mapped.ep || !published)
        throw Error("Requested episode not published or website selected another episode");
      var selected = [], seen = Object.create(null);
      players.forEach(function(attrs) {
        if (/no[- ]?sub|dub\?/i.test(attrs["data-label"] || "")) return;
        var href = address(attrs["data-server-url"], page);
        if (!href) return;
        var u = new URL(href), kind, route;
        // Server 3 (/aniwave/) is excluded even when its route claims the right identity.
        if (u.origin === SITE) {
          kind = "MegaVid";
          route = /^\/mal\/(\d+)\/(\d+)\/sub\/?$/.exec(u.pathname);
        } else if (u.origin === "https://megaplay.buzz") {
          kind = "MegaPlay";
          route = /^\/stream\/mal\/(\d+)\/(\d+)\/sub\/?$/.exec(u.pathname);
        }
        if (!route || Number(route[1]) !== mapped.id || Number(route[2]) !== mapped.ep || seen[kind]) return;
        u.search = ""; u.hash = ""; seen[kind] = true;
        selected.push({url: u.href.replace(/\/$/, ""), kind: kind, origin: u.origin});
      });
      if (!selected.length) throw Error("No supported Sub server bound to the requested MAL/episode");
      log("EPISODE", "Website published exact MAL " + mapped.id + " episode " + mapped.ep + "; " + selected.length + " eligible servers; Server 3 excluded");
      return selected;
    }
    function decryptMega(data) {
      if (!data || typeof data !== "object") throw Error("Invalid MegaPlay payload");
      if (typeof data.enc !== "string") return data;
      if (data.enc.length > 1000000 || !/^[A-Za-z0-9_+/=-]+$/.test(data.enc)) throw Error("Invalid source ciphertext");
      var C = require("crypto-js");
      var key = C.enc.Hex.parse(C.enc.Utf8.parse("i?LMTAx0Q6,:}50U").toString(C.enc.Hex).padEnd(64, "0"));
      var plain = C.AES.decrypt({ciphertext:C.enc.Base64.parse(data.enc.replace(/-/g,"+").replace(/_/g,"/"))}, key,
        {iv:C.enc.Utf8.parse("W0;27ToaUpl_P%'c"), mode:C.mode.CBC, padding:C.pad.Pkcs7}).toString(C.enc.Utf8);
      var decoded = JSON.parse(plain);
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw Error("Invalid decoded source");
      return Object.assign({}, data, decoded);
    }
    function validateIdentity(data, mapped) {
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
    }
    async function extractCandidate(mapped, server, task) {
      var page = server.url;
      var headers = { "User-Agent": UA, Referer: page, Origin: server.origin };
      var data;
      if (server.kind === "MegaPlay") {
        var html = await text(page, {Referer: CATALOGUE + "/"}, task);
        if (!/\btype\s*:\s*["']sub["']/.test(html)) throw Error("MegaPlay did not confirm Sub channel");
        var player = (html.match(/<[a-z][^>]*>/gi) || []).map(attributes).find(function(t) { return t.id === "megaplay-player"; });
        var playerId = player && player["data-id"];
        if (!/^\d{1,12}$/.test(playerId || "") || !positive(playerId)) throw Error("MegaPlay episode player unavailable");
        data = decryptMega(await json(server.origin + "/stream/getSources?id=" + playerId + "&id=" + playerId,
          Object.assign({}, headers, {"X-Requested-With":"XMLHttpRequest", Accept:"application/json"}), task));
        validateIdentity(data, mapped);
        var raw = [];
        if (typeof data.file === "string") raw.push(data.file);
        if (data.sources) raw = raw.concat(Array.isArray(data.sources) ? data.sources : [data.sources]);
        var selected = null;
        for (var i = 0; i < Math.min(raw.length, 3); i++) {
          var u = address(typeof raw[i] === "string" ? raw[i] : raw[i] && (raw[i].file || raw[i].url), page);
          if (!u) continue;
          try { selected = await verify(u, headers, task); break; }
          catch (error) { if (task.stopped) throw error; log("SOURCE", "MegaPlay: " + error.message); }
        }
        if (!selected) throw Error("MegaPlay has no verified HLS source");
        return result(mapped, server, selected, data, headers);
      }
      var api = page + "/source?noax=1";
      log("SOURCE", "MegaVid API " + new URL(api).pathname + "?noax=1");
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          data = await json(api, Object.assign({}, headers, {Accept:"application/json"}), task);
          break;
        } catch (error) {
          if (task.stopped || attempt || !/HTML response|HTTP 5\d\d|HTTP timeout/.test(error.message)) throw error;
          log("RETRY", "MegaVid temporary response; one retry");
        }
      }
      if (!data || data.status !== "ok")
        throw Error(
          "Source unavailable: " + String((data && data.status) || "unknown"),
        );
      // The website's own fallback bypasses the Animex relay. Some later
      // segments on that relay return HTTP403 although the master is valid.
      if (data.animex === true)
        throw Error(
          "Website fallback unavailable; rejected relay not returned",
        );
      if (
        data.type &&
        !/^(?:hls|m3u8|application\/(?:x-mpegurl|vnd.apple.mpegurl))$/i.test(
          data.type,
        )
      )
        throw Error("Source is not HLS");
      validateIdentity(data, mapped);
      var url = address(data.source);
      if (!url) throw Error("No HTTPS source");
      var selected = await verify(url, headers, task);
      return result(mapped, server, selected, data, headers);
    }
    function result(mapped, server, selected, data, headers) {
      var page = server.url;
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
        server.kind + "; website episode/server matched; master HLS verified; " +
          subtitles.length +
          " subtitle tracks supplied",
      );
      return [
        {
          name: "AnimeKai",
          provider: "animekai",
          serverName: server.kind,
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
    async function extract(mapped) {
      var servers = await episodeServer(mapped);
      var jobs = servers.map(function(server) { return {server:server, task:scope()}; });
      return new Promise(function(resolve) {
        var remaining = jobs.length, finished = false;
        jobs.forEach(function(job) {
          extractCandidate(mapped, job.server, job.task).then(function(streams) {
            if (finished) return;
            finished = true;
            jobs.forEach(function(other) { if (other !== job) other.task.cancel(); });
            log("RACE", job.server.kind + " won with verified HLS; other requests cancelled");
            resolve(streams);
          }).catch(function(error) {
            if (finished) return;
            log("SERVER", job.server.kind + ": " + error.message);
            if (--remaining === 0) { finished = true; jobs.forEach(function(j) {j.task.cancel();}); resolve([]); }
          });
        });
      });
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

/* CLOUDANIME_MINIMUM_RESOLUTION_V1: standalone in every provider; no app changes or HTTP probes. */
function cloudAnimeResolutionHeight(stream) {
  function height(value, bare) {
    if (typeof value === 'number') return isFinite(value) && value > 0 ? value : null;
    if (typeof value !== 'string') return null;
    var text = value.trim(), match = /(?:^|[^0-9])(\d{2,5})\s*[x×]\s*(\d{2,5})(?![0-9])/i.exec(text);
    if (match) return +match[2];
    match = /(?:^|[^a-z0-9])(\d{2,5})\s*[pi](?=$|[^a-z0-9])/i.exec(text);
    if (match) return +match[1];
    if (bare && /^\d{2,5}$/.test(text)) return +text;
    if (bare && /^(?:sd|standard[ -]definition)$/i.test(text)) return 480;
    if (bare && /^(?:hd|fhd|full[ -]?hd|uhd|[248]k)$/i.test(text)) return 720;
    return null;
  }
  if (!stream || typeof stream !== 'object') return null;
  // Published dimensions take priority over broad display labels.
  var value = height(stream.height, true);
  if (value !== null) return value;
  var fields = ['resolution', 'quality', 'sourceQuality', 'qualityLabel'];
  for (var i = 0; i < fields.length; i++) {
    value = height(stream[fields[i]], true);
    if (value !== null) return value;
  }
  // Only explicit resolution syntax in labels/files; never infer from URL IDs,
  // episode numbers, file sizes or bitrate. Auto/Unknown alone remain allowed.
  var labels = ['name', 'title', 'fileName', 'filename'];
  var context = typeof globalThis !== 'undefined' && globalThis.VUEO_DISCOVERY_CONTEXT;
  var tmdb = context && context.tmdb || {};
  var titles = [tmdb.title, tmdb.name, tmdb.original_title, tmdb.original_name, context && context.title];
  for (var j = 0; j < labels.length; j++) {
    var label = typeof stream[labels[j]] === 'string' ? stream[labels[j]] : '';
    titles.forEach(function(title) { if (typeof title === 'string' && title) label = label.split(title).join(''); });
    value = height(label, false);
    if (value !== null) return value;
  }
  return null;
}
function cloudAnimeMinimumResolution(streams, providerId) {
  if (!Array.isArray(streams)) return streams;
  var rejected = 0;
  var result = streams.filter(function(stream) {
    var height = cloudAnimeResolutionHeight(stream);
    if (height !== null && height < 720) { rejected++; return false; }
    return true;
  });
  if (rejected && typeof console !== 'undefined' && console.log) {
    console.log('[CloudAnime][' + providerId + '] QUALITY_FILTER: rejected ' + rejected + ' below 720p; Auto/Unknown allowed');
  }
  return result;
}
function cloudAnimeInstallMinimumResolution(provider, providerId) {
  if (!provider || typeof provider.getStreams !== 'function') return provider;
  var original = provider.getStreams;
  var adapted = Object.assign({}, provider);
  adapted.getStreams = function() {
    var args = arguments, receiver = this;
    return Promise.resolve().then(function() { return original.apply(receiver, args); })
      .then(function(streams) { return cloudAnimeMinimumResolution(streams, providerId); });
  };
  return adapted;
}
/* CLOUDANIME_MINIMUM_RESOLUTION_END */

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "animekai");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
