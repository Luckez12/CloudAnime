/* CloudAnime AniZone v2.0.0: website title first; mapping only on miss. */
/* CLOUDANIME_SUB_ONLY_V1: inspect upstream labels before display formatting. */
function cloudAnimeAudioDecision(stream) {
  if (!stream || typeof stream !== 'object') return 'invalid';
  function clean(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
  function japanese(value) { return /^(ja|jp|jpn|japanese|日本語)$/.test(clean(value)); }
  var audio = clean(stream.audioLanguage || stream.audio_language || (typeof stream.audio === 'string' ? stream.audio : stream.audio && (stream.audio.language || stream.audio.lang))); 
  var tracks = Array.isArray(stream.audioLanguages) ? stream.audioLanguages : Array.isArray(stream.audioTracks) ? stream.audioTracks.map(function(track) { return track && (track.language || track.lang); }) : [];
  if (audio && !japanese(audio)) return 'dub-or-unknown-audio';
  if (tracks.length && !tracks.every(japanese)) return 'mixed-or-dub-audio';
  var title = typeof stream.title === 'string' ? stream.title : '';
  var name = typeof stream.name === 'string' ? stream.name : '';
  // Content titles are not language evidence (e.g. a title containing "Dub").
  var context = typeof globalThis !== 'undefined' && globalThis.VUEO_DISCOVERY_CONTEXT;
  var tmdb = context && context.tmdb || {};
  var contentTitles = [tmdb.title, tmdb.name, tmdb.original_title, tmdb.original_name, context && context.title];
  contentTitles.forEach(function(value) {
    if (typeof value === 'string' && value) title = title.split(value).join('');
      name = name.split(value).join('');
  });
  var label = [name, title, stream.audioType, stream.audioFormat, stream.subDub,
    stream.dubSub, stream.version, stream.audioLabel].map(clean).join(' ');
  if (/\b(dub|dubbed|dual[ -]?audio|multi[ -]?audio|multilingual)\b/.test(label)) return 'dub-or-mixed';
  if (/\b(hindi|tamil|telugu|korean|chinese|mandarin|french|arabic|spanish|portuguese)[ -]audio\b/.test(label)) return 'foreign-audio';
  if (/\[(?:english|hindi|tamil|telugu|korean|chinese|mandarin|french|arabic|spanish|portuguese)\]/.test(label)) return 'foreign-audio';
  if (/\benglish[ -]audio\b/.test(label)) return 'dub';
  if (/🌍\s*(english|hindi|tamil|telugu|korean|chinese|mandarin|french|arabic|spanish|portuguese)\b/.test(label)) return 'foreign-audio';
  var generic = clean(stream.language || stream.lang);
  if (generic && !japanese(generic) && !/^(sub|subbed|dub|dubbed)$/.test(generic)) return 'dub-or-unknown-audio';
  if (/^(dub|dubbed)$/.test(generic)) return 'dub';
  if (japanese(audio) || (tracks.length && tracks.every(japanese)) || japanese(generic)) return 'sub';
  if (/\b(sub|subbed|subtitled|hardsub|softsub)\b/.test(label) || /^(sub|subbed)$/.test(generic)) return 'sub';
  if (/\b(japanese|jpn)\b/.test(label) || /🇯🇵/.test(label)) return 'sub';
  return 'unknown-audio';
}

function cloudAnimeSubtitleLanguage(track) {
  var values = [track.language, track.lang, track.srclang, track.name, track.label];
  for (var i = 0; i < values.length; i++) {
    var value = typeof values[i] === 'string' ? values[i].trim().toLowerCase() : '';
    if (/^(en|eng|english)(?:\b|[-_])/.test(value)) return 'English';
    if (/^(ms|msa|may|malay|bahasa melayu)(?:\b|[-_])/.test(value)) return 'Malay';
    if (/^(id|ind|indo|indonesian|bahasa indonesia)(?:\b|[-_])/.test(value)) return 'Indo';
  }
  return '';
}

function cloudAnimeFilterStreams(streams, providerId) {
  if (!Array.isArray(streams)) return [];
  var rejected = 0;
  var result = streams.filter(function(stream) {
    var decision = cloudAnimeAudioDecision(stream);
    if (decision !== 'sub') { rejected++; return false; }
    return true;
  }).map(function(stream) {
    var output = Object.assign({}, stream);
    if (Array.isArray(stream.subtitles)) {
      output.subtitles = stream.subtitles.filter(function(track) {
        return track && typeof track.url === 'string' && /^https?:\/\//i.test(track.url) && cloudAnimeSubtitleLanguage(track);
      }).map(function(track) {
        var label = cloudAnimeSubtitleLanguage(track);
        return Object.assign({}, track, { name: label, language: label === 'English' ? 'en' : label === 'Malay' ? 'ms' : 'id' });
      });
    }
    return output;
  });
  if (rejected && typeof console !== 'undefined' && console.log) {
    console.log('[CloudAnime:' + providerId + '] Sub-only: kept ' + result.length + ', excluded ' + rejected + ' dub/mixed/unknown audio results');
  }
  return result;
}

// Imported provider: anizone; upstream commit 3f09a6ff4360498895e622877af7a32212f75038
/* VUEO_SHARED_DISCOVERY_CONTEXT_V1 */
function vueoSharedTmdb(url, fallback) {
  function trace(stage, details) {
    try {
      if (typeof globalThis !== "undefined" && typeof globalThis.vueoTrace === "function") {
        globalThis.vueoTrace(stage, details);
      }
    } catch (_) {}
  }
  function normalize(raw) {
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (_) { return null; }
    }
    if (!raw || typeof raw !== "object" || raw.error) return null;
    var tmdb = raw.tmdb;
    if (!tmdb || typeof tmdb !== "object") {
      if (!raw.title || (raw.mediaType !== "movie" && raw.mediaType !== "tv")) return null;
      var alternatives = Array.isArray(raw.aliases) ? raw.aliases.map(function(alias) {
        return { title: String(alias), iso_3166_1: "" };
      }) : [];
      tmdb = {
        id: raw.tmdbId,
        title: raw.mediaType === "movie" ? raw.title : undefined,
        name: raw.mediaType === "tv" ? raw.title : undefined,
        original_title: raw.mediaType === "movie" ? (raw.originalTitle || raw.title) : undefined,
        original_name: raw.mediaType === "tv" ? (raw.originalTitle || raw.title) : undefined,
        release_date: raw.mediaType === "movie" && raw.year ? String(raw.year) + "-01-01" : "",
        first_air_date: raw.mediaType === "tv" && raw.year ? String(raw.year) + "-01-01" : "",
        external_ids: { imdb_id: raw.imdbId || "" },
        alternative_titles: { titles: alternatives, results: alternatives }
      };
    }
    var expected=/\/3\/(movie|tv)\/(\d+)(?:\?|$)/.exec(url);
    var hintedType=raw.mediaType||raw.type;
    if(expected && (String(tmdb.id||raw.tmdbId)!==expected[2] || hintedType && (hintedType==='series'?'tv':hintedType)!==expected[1])) return null;
    if (!tmdb.title && !tmdb.name) return null;
    trace("METADATA", { shared: true, title: raw.title || tmdb.title || tmdb.name || "",
      year: raw.year || "", imdbId: raw.imdbId || "",
      aliases: Array.isArray(raw.aliases) ? raw.aliases.length : 0 });
    return tmdb;
  }
  function local() {
    trace("METADATA_FALLBACK", { shared: false });
    return Promise.resolve().then(fallback);
  }
  try {
    if (typeof globalThis !== "undefined") {
      var direct = normalize(globalThis.VUEO_DISCOVERY_CONTEXT);
      if (direct) return Promise.resolve(direct);
      if (typeof globalThis.vueoDiscoveryContext === "function") {
        return Promise.resolve().then(function() {
          return globalThis.vueoDiscoveryContext(url);
        }).then(function(raw) {
          var shared = normalize(raw);
          return shared || local();
        }, local);
      }
    }
  } catch (_) {}
  return local();
}


/* VUEO_TITLE_PROFILE_V1 */
function buildTitleProfile(tmdb) {
  var primary = String(tmdb.title || tmdb.name || "").trim();
  var aliases = [];
  function add(value) {
    value = String(value || "").trim();
    if (value && aliases.indexOf(value) === -1) aliases.push(value);
  }
  add(primary);
  add(tmdb.original_title || tmdb.original_name);
  var alternate = tmdb.alternative_titles || {};
  (alternate.titles || alternate.results || []).forEach(function(item) { add(item.title); });
  return { title: primary, aliases: aliases };
}


/* CLOUDBANK_NUVIO_ADAPTER_V1 */
function cloudbankWrapProvider(provider, providerId, supportedTypes) {
  var upstream = provider.getStreams;
  var adapted = {};
  Object.keys(provider).forEach(function(key) { adapted[key] = provider[key]; });
  adapted.getStreams = function(tmdbId, mediaType, season, episode) {
    var args = Array.prototype.slice.call(arguments);
    var type = mediaType === "series" ? "tv" : mediaType;
    if (supportedTypes.indexOf(type) === -1 || !String(tmdbId || "").trim()) return Promise.resolve([]);
    if (type === "tv" && (!Number.isInteger(Number(season)) || Number(season) < 0 ||
        !Number.isInteger(Number(episode)) || Number(episode) < 1)) return Promise.resolve([]);
    args[0] = String(tmdbId);
    args[1] = type;
    if (type === "tv") { args[2] = Number(season); args[3] = Number(episode); }
    return new Promise(function(resolve) {
      var finished = false;
      var timer = setTimeout(function() { finish([]); }, 36000);
      function finish(value) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        var seen = Object.create(null);
        var streams = Array.isArray(value) ? value.filter(function(stream) {
          if (!stream || typeof stream.url !== "string" || !/^(https?:\/\/|magnet:)/i.test(stream.url)) return false;
          if (cloudAnimeAudioDecision(stream) !== "sub") return false;
          // Preserve separate audio/server entries sharing the same media URL.
          var key = JSON.stringify([stream.url, stream.name, stream.headers, stream.subtitles]);
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        }) : [];
        resolve(streams);
      }
      Promise.resolve().then(function() { return upstream.apply(provider, args); }).then(finish, function() { finish([]); });
    });
  };
  return adapted;
}

function cloudbankMetadataFetch(nativeFetch) {
  return function(url, options) {
    var text = typeof url === "string" ? url : url && url.url;
    var match = typeof text === "string" && /^https:\/\/api\.themoviedb\.org\/3\/(movie|tv)\/(\d+)(?:\?|$)/.exec(text);
    var method = options && options.method ? String(options.method).toUpperCase() : "GET";
    if (!match || method !== "GET") return nativeFetch(url, options);
    // Shared metadata covers details only; search/find/season/episode requests stay upstream.
    var response;
    return vueoSharedTmdb(text, function() {
      return nativeFetch(url, options).then(function(value) {
        response = value;
        if (!value.ok) throw new Error("TMDB HTTP " + value.status);
        return value.json();
      });
    }).then(function(tmdb) {
      var profile = buildTitleProfile(tmdb);
      if (!profile.title) throw new Error("TMDB title unavailable");
      var body = JSON.stringify(tmdb);
      return {
        ok: true, status: 200, statusText: "OK", url: text,
        headers: response ? response.headers : { get: function(name) {
          return String(name).toLowerCase() === "content-type" ? "application/json" : null;
        } },
        json: function() { return Promise.resolve(JSON.parse(body)); },
        text: function() { return Promise.resolve(body); }
      };
    });
  };
}

/* CLOUDBANK_ANIME_MAPPING_START */
/* Cloudbank anime mapping adapter. No Node globals or runtime imports. */
function cloudbankAnimeMappingFetch(nativeFetch) {
  var cache = Object.create(null), cacheKeys = [], tmdbKey = "439c478a771f35c05022f9feabcca01c", documents = Object.create(null), documentKeys = [], malTitles = Object.create(null), titleKeys = [];
  function response(data, status) {
    var body = JSON.stringify(data);
    return { ok: status === 200, status: status, statusText: status === 200 ? "OK" : "Not Found",
      headers: { get: function(n) { return String(n).toLowerCase() === "content-type" ? "application/json" : null; } },
      json: function() { return Promise.resolve(JSON.parse(body)); }, text: function() { return Promise.resolve(body); },
      clone: function() { return response(data, status); } };
  }
  function loadJson(url) {
    var timer, settled = false;
    return new Promise(function(resolve) {
      function finish(value) { if (settled) return; settled = true; clearTimeout(timer); resolve(value); }
      timer = setTimeout(function() { finish(null); }, 8000);
      Promise.resolve().then(function() { return nativeFetch(url); }).then(function(r) {
        return r.ok ? r.json() : null;
      }).then(finish, function() { finish(null); });
    });
  }
  function json(url) {
    var hit = documents[url];
    if (hit && Date.now() - hit.time < 300000) return hit.promise;
    var entry = { time: Date.now(), promise: null };
    entry.promise = loadJson(url).then(function(data) {
      if (!data) delete documents[url];
      return data;
    });
    documents[url] = entry;
    documentKeys.push(url);
    if (documentKeys.length > 20) delete documents[documentKeys.shift()];
    return entry.promise;
  }
  function positive(value) { var n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
  function day(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ""; }
  function airedDates(e) {
    var seen=Object.create(null);
    return [e.airDate,e.airDateUtc,e.airdate].map(day).filter(function(d) {if(!d||seen[d])return false;seen[d]=true;return true;});
  }
  function compatible(a, b) {
    if (!a || !b) return false;
    return Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) <= 86400000;
  }
  async function resolve(id, season, episode, movie) {
    var isImdb = /^tt\d+$/.test(id);
    if (!isImdb && !positive(id)) return null;
    var route = isImdb ? "imdb" : "themoviedb";
    var armPromise = json("https://arm.haglund.dev/api/v2/" + route + "?id=" + encodeURIComponent(id));
    // TMDB episode dates take precedence over Cinemeta's alternative season numbering.
    var metaPromise = Promise.resolve(null);
    var rows = await armPromise;
    if (!Array.isArray(rows)) return null;
    rows = rows.filter(function(r) {
      return r && positive(r.myanimelist) && (isImdb ? r.imdb === id : String(r.themoviedb) === id) &&
        (movie ? r.media === "MOVIE" && r["themoviedb-season"] == null :
          r.media !== "MOVIE" && (r["themoviedb-season"] == null || Number(r["themoviedb-season"]) === season));
    });
    // Prefer explicit season identities; show-wide rows are a separate fallback.
    if (!movie && rows.some(function(r) { return r["themoviedb-season"] != null; })) {
      rows = rows.filter(function(r) { return r["themoviedb-season"] != null; });
    }
    var showWide = !movie && rows.length > 0 && rows.every(function(r) { return r["themoviedb-season"] == null; });
    var seen = Object.create(null);
    rows = rows.filter(function(r) { var key = r.myanimelist; if (seen[key]) return false; seen[key] = true; return true; });
    if (!rows.length || rows.length > 6) return null;
    if (movie) {
      if (rows.length !== 1) return null;
      var movieData = await json("https://api.ani.zip/mappings?mal_id=" + rows[0].myanimelist);
      if (!movieData || !movieData.mappings || movieData.mappings.type !== "MOVIE" || Number(movieData.mappings.mal_id) !== Number(rows[0].myanimelist) || String(movieData.mappings.themoviedb_id) !== String(rows[0].themoviedb) || Number(movieData.mappings.anilist_id) !== Number(rows[0].anilist)) return null;
      var movieTitles = movieData.titles || {};
      return { mal_id: positive(rows[0].myanimelist), anilist: positive(movieData.mappings.anilist_id), mal_episode: 1, episode: 1,
        titles: Object.keys(movieTitles).map(function(k) { return movieTitles[k]; }).filter(Boolean),
        anime_title: movieTitles.en || movieTitles['x-jat'] || '', expectedEpisodes: 1, animeplanet_slug: rows[0]['anime-planet'] || '' };
    }
    if (!isImdb && /^tt\d+$/.test(rows[0].imdb || "")) {
      metaPromise = Promise.resolve(null);
    }
    var tmdbId = positive(rows[0].themoviedb), target = "", dayIndex = 0;
    var episodeUrl = tmdbKey && tmdbId ? "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "?api_key=" + encodeURIComponent(tmdbKey) : "";
    var seasonPromise = episodeUrl ? json(episodeUrl) : Promise.resolve(null);
    var datasetsPromise = Promise.all(rows.map(function(r) { return json("https://api.ani.zip/mappings?mal_id=" + r.myanimelist); }));
    var seasonData = await seasonPromise, metaData = await metaPromise;
    if ((!seasonData || !Array.isArray(seasonData.episodes)) && /^tt\d+$/.test(rows[0].imdb || "")) metaData = await json("https://v3-cinemeta.strem.io/meta/series/" + rows[0].imdb + ".json");
    var videos = seasonData && Array.isArray(seasonData.episodes) ? seasonData.episodes :
      metaData && metaData.meta && Array.isArray(metaData.meta.videos) ? metaData.meta.videos : [];
    function number(v) { return Number(v.episode_number != null ? v.episode_number : v.episode != null ? v.episode : v.number); }
    function seasonOf(v) { return Number(v.season_number != null ? v.season_number : v.season); }
    function released(v) { return day(v.air_date || v.released || v.firstAired); }
    var datasets = await datasetsPromise;
    var selected = videos.find(function(v) { return seasonOf(v) === season && number(v) === episode; });
    var mappingMethod = "air-date";
    // VUEO may send an absolute anime episode alongside a TMDB season (S23 E1156).
    // Bridge it only through the same show and a unique episode identity/date in
    // independent episode metadata. Never reinterpret relative episodes as offsets.
    if (!selected && showWide) {
      if (seasonData && /^tt\d+$/.test(rows[0].imdb || "")) {
        metaData = await json("https://v3-cinemeta.strem.io/meta/series/" + rows[0].imdb + ".json");
        if (metaData && metaData.meta && Array.isArray(metaData.meta.videos)) videos = metaData.meta.videos;
      }
      var bridges = [];
      datasets.forEach(function(data, i) {
        if (!data || !data.mappings || data.mappings.type === "MOVIE" || Number(data.mappings.mal_id) !== Number(rows[i].myanimelist) ||
            String(data.mappings.themoviedb_id) !== String(tmdbId) || !data.episodes) return;
        Object.keys(data.episodes).forEach(function(k) {
          var e = data.episodes[k];
          if (!e || positive(e.episode) !== episode || positive(e.absoluteEpisodeNumber) !== episode || !positive(e.tvdbId)) return;
          videos.forEach(function(v) {
            if (seasonOf(v) === season && positive(v.tvdb_id) === positive(e.tvdbId) &&
                airedDates(e).some(function(d) {return compatible(d,released(v));})) bridges.push(v);
          });
        });
      });
      if (bridges.length === 1) { selected = bridges[0]; mappingMethod = "absolute-episode+identity+air-date"; }
    }
    if (!selected || !(target = released(selected))) return null;
    dayIndex = videos.filter(function(v) {
      return released(v) === target && (seasonOf(v) < seasonOf(selected) || seasonOf(v) === seasonOf(selected) && number(v) < number(selected));
    }).length;
    var matches = [];
    datasets.forEach(function(data, i) {
      if (!data || !data.mappings || data.mappings.type === "MOVIE" || Number(data.mappings.mal_id) !== Number(rows[i].myanimelist) || String(data.mappings.themoviedb_id) !== String(rows[i].themoviedb) || Number(data.mappings.anilist_id) !== Number(rows[i].anilist) || !data.episodes) return;
      var list = Object.keys(data.episodes).map(function(k) { return data.episodes[k]; }).filter(function(e) {
        return e && /^\d+$/.test(String(e.episode)) && positive(e.episode) && airedDates(e).some(function(d) {return compatible(d,target);});
      }).sort(function(a,b) { return Number(a.episode) - Number(b.episode); });
      // Exact dates win; +/- one day accounts only for local/UTC broadcast dates.
      var exact = list.filter(function(e) { return airedDates(e).includes(target); });
      if (exact.length) list = exact;
      if (!list[dayIndex] || list.length > 1 && dayIndex === 0 &&
          videos.filter(function(v) { return released(v) === target; }).length < list.length) return;
      var titles = data.titles || {}, ep = Number(list[dayIndex].episode);
      matches.push({ mal_id: Number(rows[i].myanimelist), anilist: positive(rows[i].anilist),
        mal_episode: ep, episode: ep, anime_title: titles.en || titles["x-jat"] || titles.ja || "",
        titles: Object.keys(titles).map(function(k) { return titles[k]; }).filter(Boolean), expectedEpisodes: positive(data.episodeCount), animeplanet_slug: rows[i]["anime-planet"] || "", air_date: target, mapping_method: mappingMethod });
    });
    return matches.length === 1 ? matches[0] : null;
  }
  return function(url, options) {
    var text = typeof url === "string" ? url : url && url.url, u;
    try { u = new URL(text); } catch (_) { return nativeFetch(url, options); }
    var method = options && options.method ? String(options.method).toUpperCase() : "GET";
    if (u.hostname === "api.themoviedb.org" && u.searchParams.get("api_key")) tmdbKey = u.searchParams.get("api_key");
    var malDetail = /^\/v4\/anime\/(\d+)$/.exec(u.pathname);
    if (method === "GET" && u.hostname === "api.jikan.moe" && malDetail && malTitles[malDetail[1]]) {
      return Promise.resolve(response({ data: { mal_id: Number(malDetail[1]), title: malTitles[malDetail[1]] } }, 200));
    }
    var legacy = u.hostname === "id-mapping-api-malid.hf.space" && u.pathname === "/api/resolve";
    var anikoto = u.hostname === "arm.haglund.dev" && u.pathname === "/api/v2/tmdb";
    if (method !== "GET" || !legacy && !anikoto) return nativeFetch(url, options);
    var id = u.searchParams.get("id") || "", movie = anikoto && !u.searchParams.has("s");
    var season = Number(u.searchParams.get("s")), episode = positive(u.searchParams.get("e"));
    if (!movie && (!Number.isInteger(season) || season < 0 || !episode || !u.searchParams.has("s")))
      return Promise.resolve(response({ error: "Invalid anime episode" }, 404));
    var key = JSON.stringify([id, movie, season, episode]);
    if (!cache[key]) {
      cache[key] = resolve(id, season, episode, movie).then(function(data) {
        if (!data) delete cache[key];
        if (data && data.anime_title) {
          if (!malTitles[data.mal_id]) titleKeys.push(data.mal_id);
          malTitles[data.mal_id] = data.anime_title;
          if (titleKeys.length > 32) delete malTitles[titleKeys.shift()];
        }
        return data;
      }, function() { delete cache[key]; return null; });
      cacheKeys.push(key);
      if (cacheKeys.length > 32) delete cache[cacheKeys.shift()];
    }
    return cache[key].then(function(data) { return response(data || { error: "Verified anime mapping unavailable" }, data ? 200 : 404); });
  };
}

/* CLOUDBANK_ANIME_MAPPING_END */

(function() {
  var originalModule = { exports: {} };
  var originalRequire = typeof require === "function" ? require : null;
  function portableRequire(name) {
    if (name !== "crypto-js" && name !== "cheerio-without-node-native") throw new Error("Unsupported embedded module: " + name);
    if (!originalRequire) throw new Error("Runtime module unavailable: " + name);
    return originalRequire(name);
  }
  (function(module, exports, require, fetch, self) {
/* CLOUDBANK_UPSTREAM_SOURCE_START */
/**
 * anizone - Built from src/anizone/
 * Generated: 2026-09-25T19:36:47.745Z
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/anizone/index.js
var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

// src/anizone/constants.js
var MAIN_URL = "https://anizone.to";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://anizone.to/"
};
var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";

// src/anizone/utils.js
var HEX_ESCAPE = /\\x([0-9a-fA-F]{2})/g;
var INVALID_BACKSLASH = /\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g;
function sanitizeJson(raw) {
  if (!raw)
    return "";
  return raw.replace(/\\u0022/g, '"').replace(/\\u0026/g, "&").replace(/\\'/g, "'").replace(/\\\//g, "/").replace(/\\\\/g, "\\").replace(/\\&/g, "&").replace(/\\'/g, "'").replace(/\\0/g, "\\u0000").replace(HEX_ESCAPE, (_, hex) => "\\u00" + hex).replace(INVALID_BACKSLASH, "");
}
function parseXDataJson(rawArg) {
  const sanitized = sanitizeJson(rawArg);
  return JSON.parse(sanitized);
}
var fastDeadline = 0;
function fetchWithTimeout(_0) {
  return __async(this, arguments, function* (url, options = {}, timeoutMs = 8e3) {
    if(fastDeadline){timeoutMs=Math.min(timeoutMs,fastDeadline-Date.now());if(timeoutMs<=0)throw Error("AniZone request budget exhausted");}
    const mergedHeaders = __spreadValues({
      "User-Agent": HEADERS["User-Agent"],
      "Referer": HEADERS["Referer"]
    }, options.headers || {});
    const fetchOptions = __spreadProps(__spreadValues({
      skipSizeCheck: true
    }, options), {
      headers: mergedHeaders
    });
    if (typeof setTimeout !== "function") {
      return fetch(url, fetchOptions);
    }
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    });
    try {
      const res = yield Promise.race([
        fetch(url, fetchOptions),
        timeoutPromise
      ]);
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  });
}
function fetchText(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    const finalUrl = url.startsWith("http") ? url : `${MAIN_URL}${url}`;
    try {
      const response = yield fetchWithTimeout(finalUrl, options, 1e4);
      if (!response.ok)
        return "";
      return yield response.text();
    } catch (e) {
      return "";
    }
  });
}
function fetchWithCookies(_0) {
  return __async(this, arguments, function* (url, options = {}) {
    var _a, _b;
    const finalUrl = url.startsWith("http") ? url : `${MAIN_URL}${url}`;
    try {
      const response = yield fetchWithTimeout(finalUrl, options, 1e4);
      if (!response.ok)
        return { text: "", cookies: "", ok: false };
      const text = yield response.text();
      let cookies = "";
      try {
        if (typeof ((_a = response.headers) == null ? void 0 : _a.getSetCookie) === "function") {
          cookies = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
        } else if ((_b = response.headers) == null ? void 0 : _b.get) {
          cookies = response.headers.get("set-cookie") || "";
        }
      } catch (_) {
      }
      return { text, cookies, ok: true };
    } catch (e) {
      return { text: "", cookies: "", ok: false };
    }
  });
}
function parseCards(html, $) {
  const cards = [];
  const itemsMatch = html.match(/items:\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
  if (itemsMatch) {
    try {
      const parsed = parseXDataJson(itemsMatch[1]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || !item.slug)
            continue;
          const titles = /* @__PURE__ */ new Set();
          if (item.main_title)
            titles.add(item.main_title);
          if (item.title_list && typeof item.title_list === "object") {
            Object.values(item.title_list).forEach((t) => {
              if (t)
                titles.add(t);
            });
          }
          cards.push({
            slug: item.slug,
            url: item.url || `/anime/${item.slug}`,
            titles: Array.from(titles),kind:item.type||"",year:item.start_year,count:Number(item.episode_count)||0
          });
        }
      }
    } catch (e) {
    }
  }
  if (cards.length === 0) {
    $('[x-data*="anmTitles"]').each((i, el) => {
      const href = $(el).find('a[href*="/anime/"]').first().attr("href");
      if (!href)
        return;
      const parts = href.split("/");
      const slug = parts[parts.length - 1] || parts[parts.length - 2];
      const titles = /* @__PURE__ */ new Set();
      const xData = $(el).attr("x-data") || "";
      const jsonMatch = xData.match(/JSON\.parse\('((?:[^'\\]|\\.)*)'\)/);
      if (jsonMatch) {
        try {
          const parsed = parseXDataJson(jsonMatch[1]);
          Object.values(parsed).forEach((t) => {
            if (t)
              titles.add(t);
          });
        } catch (e) {
        }
      }
      cards.push({ slug, titles: Array.from(titles) });
    });
  }
  return cards;
}
function parseVidstackFromHtml(html, $) {
  const vidMatch = html.match(/vidstackPlayer\(JSON\.parse\('((?:[^'\\]|\\.)*)'\)\)/);
  if (vidMatch) {
    try {
      const data = parseXDataJson(vidMatch[1]);
      const masterUrl2 = data.src ? data.src.replace(/\\/g, "") : null;
      const subtitles2 = (data.subtitles || []).map((s) => ({
        url: s.file ? s.file.replace(/\\/g, "") : "",
        name: s.title || s.language || "English",
        language: s.language || "en"
      })).filter((s) => s.url);
      if (masterUrl2)
        return { masterUrl: masterUrl2, subtitles: subtitles2 };
    } catch (e) {
    }
  }
  let masterUrl = $("media-player").attr("src");
  if (!masterUrl) {
    const urlMatch = html.match(/https:\/\/[^"']+\/master\.m3u8/);
    if (urlMatch)
      masterUrl = urlMatch[0];
  }
  const subtitles = [];
  $("track").each((i, el) => {
    const src = $(el).attr("src");
    const kind = $(el).attr("kind");
    if (src && (kind === "subtitles" || kind === "captions" || src.endsWith(".ass") || src.endsWith(".vtt"))) {
      subtitles.push({
        url: src,
        name: $(el).attr("label") || "English",
        language: $(el).attr("srclang") || "en"
      });
    }
  });
  return { masterUrl, subtitles };
}
function parseAudioFormat(btnText) {
  const lower = btnText.toLowerCase();
  const hasJap = lower.includes("japanese") || lower.includes("jpn") || lower.includes("ja");
  const hasEng = lower.includes("english") || lower.includes("eng") || lower.includes("en");
  if (hasEng && hasJap)
    return "Dual Audio";
  if (hasEng)
    return "Dub";
  if (hasJap)
    return "Sub";
  if (lower.includes("multi"))
    return "Multi-Audio";
  return "Sub";
}
function searchCards(query) {
  return __async(this, null, function* () {
    if (!query)
      return [];
    const searchUrl = `/anime?search=${encodeURIComponent(query)}&sort=title-asc`;
    const searchHtml = yield fetchText(searchUrl);
    if (!searchHtml)
      return [];
    const $search = import_cheerio_without_node_native.default.load(searchHtml);
    return parseCards(searchHtml, $search);
  });
}
function fastNorm(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/(\d+)(?:st|nd|rd|th)\s+season/g, 'season $1')
    .replace(/第\s*(\d+)\s*期/g, 'season $1')
    .replace(/[\s:：\-–—_.,!?"'’()\[\]{}\/\\・]+/g, '');
}
function fastCache(op,key,value) {
  if (typeof globalThis.vueoMetadataCache !== 'function') return null;
  try {return JSON.parse(globalThis.vueoMetadataCache(JSON.stringify({op,key:'anizone200:'+key,value,ttlMs:300000})));} catch(_) {return null;}
}
function fastExact(cards,names,type,season,year,mappedEpisode,verifiedMapping) {
  const keys=[];
  names.filter(Boolean).forEach(t=>{
    if (season > 1 && !verifiedMapping) {
      keys.push(fastNorm(t+' Season '+season));
      if (new RegExp('(?:season\\s*'+season+'|'+season+'(?:nd|rd|th)\\s*season)','i').test(t))keys.push(fastNorm(t));
    } else keys.push(fastNorm(t));
  });
  const found=cards.filter(c=>{
    if(c.kind && ((type==='movie') !== /movie/i.test(c.kind)))return false;
    if(year && c.year && Number(year)!==Number(c.year))return false;
    if(c.count && mappedEpisode>c.count)return false;
    return c.titles.some(t=>keys.includes(fastNorm(t)));
  });
  const unique=found.filter((c,i,a)=>a.findIndex(x=>x.slug===c.slug)===i);
  return unique.length===1?unique[0]:null;
}
async function fastSearch(names,type,season,year,ep,verifiedMapping) {
  const seen=new Set();
  for(const title of names.filter(Boolean).slice(0,3)) {
    const hasSeason=new RegExp('(?:season\\s*'+season+'|'+season+'(?:nd|rd|th)\\s*season)','i').test(title);
    const query=season>1&&!verifiedMapping&&!hasSeason?title+' Season '+season:title;
    if(seen.has(fastNorm(query)))continue;seen.add(fastNorm(query));
    console.log('[AniZone] SEARCH: Website title query; '+query);
    const cards=await searchCards(query);
    const match=fastExact(cards,names,type,season,year,ep,verifiedMapping);
    if(match)return {slug:match.slug,count:match.count,episode:ep,title:match.titles[0]||title,direct:!verifiedMapping};
  }
  return null;
}
async function fastResolve(id,type,season,ep) {
  const key=id+':'+type+':'+season;
  const cached=fastCache('get','entry:'+key);
  if(cached&&cached.slug&&cached.direct&&(!cached.count||ep<=cached.count)) {
    console.log('[AniZone] ROUTE: Cached website ID; no metadata/search');
    return Object.assign({},cached,{episode:ep,cacheKey:key});
  }
  console.log('[AniZone] ROUTE: Website has no TMDB-direct route; trying title first');
  let detail=null;
  try {
    const r=await fetchWithTimeout('https://api.themoviedb.org/3/'+type+'/'+id+'?api_key='+TMDB_API_KEY,{},5000);
    if(r.ok)detail=await r.json();
  }catch(_){}
  const names=[];
  function add(t){if(typeof t==='string'&&t.trim()&&!names.includes(t.trim()))names.push(t.trim());}
  if(detail) {
    add(detail.name||detail.title);add(detail.original_name||detail.original_title);
    const alt=detail.alternative_titles||{};(alt.titles||alt.results||[]).forEach(t=>add(t.title));
  }
  const date=detail&&(type==='movie'?detail.release_date:detail.first_air_date);
  const year=/^\d{4}-/.test(String(date||''))?String(date).slice(0,4):null;
  let route=type==='tv'&&season===0?null:await fastSearch(names,type,season,season<=1||type==='movie'?year:null,ep,false);
  if(route){route.cacheKey=key;console.log('[AniZone] ROUTE: Exact title/season match; mapping skipped');return route;}
  console.log('[AniZone] ROUTE: Title route unavailable/ambiguous; mapping fallback');
  const bridge=cloudbankAnimeMappingFetch(fetchWithTimeout);
  const path=type==='movie'?'https://arm.haglund.dev/api/v2/tmdb?id='+id:'https://id-mapping-api-malid.hf.space/api/resolve?id='+id+'&s='+season+'&e='+ep;
  const r=await bridge(path),m=r.ok?await r.json():null;
  if(!m||!m.anilist||!m.episode)return null;
  const aliases=[m.anime_title].filter(Boolean);
  let mappedYear=null;
  try {
    const r=await fetchWithTimeout('https://api.ani.zip/mappings?mal_id='+m.mal_id,{},4000);
    if(r.ok){const d=await r.json();if(d.mappings&&Number(d.mappings.anilist_id)===Number(m.anilist)) {
      Object.values(d.titles||{}).forEach(t=>{if(t&&!aliases.includes(t))aliases.push(t);});
      const e=d.episodes&&(d.episodes[1]||d.episodes['1']);mappedYear=e&&String(e.airDate||e.airdate||e.airDateUtc||'').slice(0,4);
    }}
  }catch(_){}
  // Mapping identifies the anime entry and episode; never guess a season offset.
  route=await fastSearch(aliases,type,1,mappedYear,Number(m.episode),true);
  if(route)route.cacheKey=key;
  return route;
}
function fastPageAudio(html) {
  const $=import_cheerio_without_node_native.default.load(html);
  const label=$('div').filter((i,e)=>$(e).children().first().text().trim()==='Audio:').first().text().trim().replace(/\s+/g,' ');
  return /^Audio:\s*(?:Japanese|JPN|ja)$/i.test(label);
}
async function fastValidate(stream) {
  try {
    if(!stream||!/^https:\/\//i.test(stream.url))return null;
    const r=await fetchWithTimeout(stream.url,{headers:HEADERS},7000);
    if(!r.ok){console.log('[AniZone] SOURCE_FAILED: HTTP '+r.status+' at '+new URL(stream.url).hostname);return null;}
    const body=(await r.text()).trim();
    if(!/^#EXTM3U(?:\r?\n|$)/.test(body)||!/#EXT-X-(?:STREAM-INF|TARGETDURATION):/.test(body))return null;
    const audio=body.split(/\r?\n/).filter(l=>/^#EXT-X-MEDIA:/.test(l)&&/TYPE=AUDIO(?:,|$)/.test(l));
    if(audio.length ? !audio.some(l=>/LANGUAGE="(?:ja|jp|jpn|japanese)"/i.test(l)) : !stream.japanesePageAudio)return null;
    const multi=audio.some(l=>!/LANGUAGE="(?:ja|jp|jpn|japanese)"/i.test(l));
    if(multi)stream.url+=(stream.url.includes('#')?'&':'#')+'vueo_hls_v1=plain&audio=ja,jp,jpn,japanese';
    stream.audioLanguage='ja';stream.audioType='original';stream.type='hls';stream.mimeType='application/x-mpegURL';stream.serverName='AniZone';
    delete stream.japanesePageAudio;stream.quality='Auto';stream.title+=' [Japanese Sub]';
    stream.subtitles=(stream.subtitles||[]).filter(t=>!/dubtitle/i.test(t.name||'')).map(t=>{
      const format=/\.ass(?:\?|$)/i.test(t.url)?'ass':/\.srt(?:\?|$)/i.test(t.url)?'srt':'vtt';
      return Object.assign({},t,{format,mimeType:format==='ass'?'text/x-ssa':format==='srt'?'application/x-subrip':'text/vtt',headers:HEADERS});
    });
    return stream;
  }catch(e){console.log('[AniZone] SOURCE_FAILED: HLS validation '+String(e.message||'failed').replace(/https?:\/\/\S+/g,'[URL]'));return null;}
}

function getStreams(tmdbId, mediaType = "tv", season = 1, episode = 1) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    try {
      if(!/^[1-9]\d*$/.test(String(tmdbId)))return [];
      console.log(`[AniZone] Querying streams for TMDB: ${tmdbId}, Type: ${mediaType}, S${season}E${episode}`);
      fastDeadline=Date.now()+35000;
      const route = yield fastResolve(String(tmdbId),mediaType,Number(season),mediaType==='movie'?1:Number(episode));
      if(!route){console.log('[AniZone] NO_RESULT: No unique verified title/episode route');return [];}
      const animeSlug=route.slug, mappedEp=route.episode, animeTitle=route.title;
      console.log('[AniZone] MATCH: Website '+animeSlug+' E'+mappedEp+' via '+(route.direct?'title/cache':'mapping fallback'));
      const episodeUrl = `/anime/${animeSlug}/${mappedEp}`;
      const epResponse = yield fetchWithCookies(episodeUrl);
      if (!epResponse.ok || !epResponse.text) {
        console.log(`[AniZone] Failed to load episode page: ${episodeUrl}`);
        return [];
      }
      const epHtml = epResponse.text;
      const $ep = import_cheerio_without_node_native.default.load(epHtml);
      const snapshotData=$ep('[wire\\:snapshot]').first().attr('wire:snapshot');
      if(snapshotData){try {const state=JSON.parse(snapshotData).data;
        if(state&&state.anime_slug&&(state.anime_slug!==animeSlug||String(state.episode_slug)!==String(mappedEp)))return [];
      }catch(_){return [];}}
      const streams = [];
      const defaultStream = parseVidstackFromHtml(epHtml, $ep);
      const serverButtons = $ep('button[wire\\:click*="setVideo"]');
      let defaultFormat = "Sub";
      let defaultServerName = "AniZone";
      if (serverButtons.length > 0) {
        const firstBtn = serverButtons.first();
        const btnText = firstBtn.text().replace(/\s+/g, " ").trim();
        defaultFormat = parseAudioFormat(btnText);
        const nameMatch = btnText.match(/^([A-Za-z0-9_-]+)/);
        if (nameMatch)
          defaultServerName = nameMatch[1];
      }
      if(defaultStream.masterUrl) {
        const valid=yield fastValidate({name:'AniZone',title:animeTitle+' - Episode '+mappedEp,url:defaultStream.masterUrl,japanesePageAudio:fastPageAudio(epHtml),headers:HEADERS,subtitles:defaultStream.subtitles});
        if(valid){if(route.direct)fastCache('put','entry:'+route.cacheKey,route);console.log('[AniZone] READY: First verified Japanese HLS source');return [valid];}
      }
      if (serverButtons.length > 1) {
        const csrfToken = $ep("script[data-csrf]").attr("data-csrf");
        const snapshotEl = $ep("main > div[wire\\:snapshot], main > ul[wire\\:snapshot], [wire\\:snapshot]");
        const snapshot = snapshotEl.attr("wire:snapshot");
        if (csrfToken && snapshot && epResponse.cookies) {
          for (let i = 1; i < serverButtons.length; i++) {
            const btn = serverButtons.eq(i);
            const clickAttr = btn.attr("wire:click") || "";
            const vMatch = clickAttr.match(/setVideo\((\d+)\)/);
            if (!vMatch)
              continue;
            const videoId = parseInt(vMatch[1], 10);
            const btnText = btn.text().replace(/\s+/g, " ").trim();
            const sFormat = parseAudioFormat(btnText);
            const nameMatch = btnText.match(/^([A-Za-z0-9_-]+)/);
            const sName = nameMatch ? nameMatch[1] : `Server ${i + 1}`;
            try {
              const payload = {
                _token: csrfToken,
                components: [
                  {
                    snapshot,
                    updates: {},
                    calls: [{ path: "", method: "setVideo", params: [videoId] }]
                  }
                ]
              };
              const postRes = yield fetchWithTimeout(`${MAIN_URL}/livewire/update`, {
                method: "POST",
                headers: {
                  "Accept": "*/*",
                  "Content-Type": "application/json",
                  "X-Livewire": "",
                  "X-CSRF-TOKEN": csrfToken,
                  "Origin": MAIN_URL,
                  "Referer": `${MAIN_URL}${episodeUrl}`,
                  "Cookie": epResponse.cookies
                },
                body: JSON.stringify(payload)
              }, 8e3);
              if (postRes.ok) {
                const postData = yield postRes.json();
                const liveHtml = (_c = (_b = (_a = postData.components) == null ? void 0 : _a[0]) == null ? void 0 : _b.effects) == null ? void 0 : _c.html;
                if (liveHtml) {
                  const $live = import_cheerio_without_node_native.default.load(liveHtml);
                  const extraStream = parseVidstackFromHtml(liveHtml, $live);
                  if (extraStream.masterUrl && extraStream.masterUrl !== defaultStream.masterUrl) {
                    const valid=yield fastValidate({name:'AniZone',title:animeTitle+' - Episode '+mappedEp,url:extraStream.masterUrl,japanesePageAudio:fastPageAudio(liveHtml),headers:HEADERS,subtitles:extraStream.subtitles.length?extraStream.subtitles:defaultStream.subtitles});
                    if(valid){if(route.direct)fastCache('put','entry:'+route.cacheKey,route);return [valid];}
                  }
                }
              }
            } catch (e) {
            }
          }
        }
      }
      fastCache('put','entry:'+route.cacheKey,{invalid:true});
      console.log(`[AniZone] Total streams found: ${streams.length}`);
      return streams;
    } catch (error) {
      console.log(`[AniZone] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };

/* CLOUDBANK_UPSTREAM_SOURCE_END */
  })(originalModule, originalModule.exports, portableRequire, cloudbankMetadataFetch(fetch), typeof globalThis !== "undefined" ? globalThis : global);
  if (typeof originalModule.exports.getStreams !== "function") throw new Error("Upstream getStreams missing");
  module.exports = cloudbankWrapProvider(originalModule.exports, "anizone", ["movie", "tv"]);
  if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
  if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
  if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
})();

/* CLOUDBANK_PLAYIMDB_DISPLAY_START */
/* CLOUDBANK_PLAYIMDB_DISPLAY_V1
 * Embedded in each provider: the app downloads standalone JavaScript files.
 * Presentation only. No network requests and no changes to playback fields.
 */
function cloudbankDisplayInstall(provider, providerName, providerId) {
  if (providerId === "playimdb") return provider; // Reference output stays exactly upstream.
  var details = Object.create(null);
  var keys = [];
  function remember(key, value) {
    if (!details[key]) keys.push(key);
    details[key] = value;
    while (keys.length > 16) delete details[keys.shift()];
  }
  if (typeof vueoSharedTmdb === "function") {
    var shared = vueoSharedTmdb;
    vueoSharedTmdb = function(url, fallback) {
      var match = /\/3\/(movie|tv)\/(\d+)(?:\?|$)/.exec(String(url));
      return Promise.resolve(shared(url, fallback)).then(function(value) {
        if (match && value && typeof value === "object") remember(match[1] + "/" + match[2], value);
        return value;
      });
    };
  }
  function clean(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE0F\u200D]/g, "").replace(/\s+/g, " ").trim();
  }
  function usable(value) {
    var text = clean(value);
    return /^(?:unknown(?: title)?|n\/?a|none|null|undefined|auto|stream|original[- ]audio)$/i.test(text) ? "" : text;
  }
  function unique(list) {
    return list.filter(function(value, index) { return value && list.indexOf(value) === index; });
  }
  var languages = { en: "English", eng: "English", english: "English", ms: "Malay", msa: "Malay", may: "Malay", malay: "Malay", id: "Indonesian", ind: "Indonesian", indo: "Indonesian", indonesian: "Indonesian", hi: "Hindi", hin: "Hindi", hindi: "Hindi", ta: "Tamil", tam: "Tamil", tamil: "Tamil", te: "Telugu", tel: "Telugu", telugu: "Telugu", ja: "Japanese", jpn: "Japanese", japanese: "Japanese", ko: "Korean", kor: "Korean", korean: "Korean", zh: "Chinese", zho: "Chinese", chi: "Chinese", chinese: "Chinese", es: "Spanish", spa: "Spanish", spanish: "Spanish", fr: "French", fra: "French", fre: "French", french: "French", de: "German", deu: "German", ger: "German", german: "German", ar: "Arabic", ara: "Arabic", arabic: "Arabic", pt: "Portuguese", por: "Portuguese", portuguese: "Portuguese", ru: "Russian", rus: "Russian", russian: "Russian", it: "Italian", ita: "Italian", italian: "Italian", th: "Thai", tha: "Thai", thai: "Thai", vi: "Vietnamese", vie: "Vietnamese", vietnamese: "Vietnamese", ml: "Malayalam", mal: "Malayalam", malayalam: "Malayalam", bn: "Bengali", ben: "Bengali", bengali: "Bengali", tr: "Turkish", tur: "Turkish", turkish: "Turkish" };
  function language(value) {
    var text = clean(value).toLowerCase().replace(/[-_](?:us|gb|my|id|cn|tw|br|pt)$/, "");
    return languages[text] || "";
  }
  function metadata(id, type) {
    if (details[type + "/" + id]) return details[type + "/" + id];
    var raw = typeof globalThis !== "undefined" ? globalThis.VUEO_DISCOVERY_CONTEXT : null;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (_) { raw = null; } }
    if (!raw || typeof raw !== "object") return {};
    var tmdb = raw.tmdb || raw;
    var contextId = raw.tmdbId || tmdb.id;
    if (String(contextId) !== String(id) || (raw.mediaType && raw.mediaType !== type)) return {};
    return tmdb;
  }
  function format(stream, index, meta, type, season, episode) {
    if (!stream || typeof stream !== "object" || !stream.url) return stream;
    var output = Object.assign({}, stream);
    var originalTitle = typeof stream.title === "string" ? stream.title : "";
    var displayTitle = usable(meta.title || meta.name);
    var year = /\b(?:19|20)\d{2}\b/.exec(clean(meta.release_date || meta.first_air_date || meta.year));
    var lines = [];
    if (displayTitle) {
      if (year) displayTitle += " (" + year[0] + ")";
      if (type === "tv" && Number.isInteger(Number(season)) && Number(season) >= 0 && Number(episode) >= 1) {
        displayTitle += " · S" + (Number(season) < 10 ? "0" : "") + Number(season) + "E" + (Number(episode) < 10 ? "0" : "") + Number(episode);
      }
      lines.push(displayTitle);
    } else {
      // Keep a source-provided content title when it is recognisable as one.
      var first = clean(originalTitle.split(/\r?\n/)[0]);
      var providerLabel = clean(providerName.replace(/\s+V\d+$/i, ""));
      var isProviderTitle = providerLabel && first.toLowerCase().indexOf(providerLabel.toLowerCase()) === 0;
      var isTechnicalTitle = /^(?:\d{3,4}p|4k|Server\s+\d+|Unknown|Subtitles:|WEB[- ]DL|BluRay|HLS|M3U8|MP4|DASH)\b/i.test(first);
      if (first && /[A-Za-z\u0080-\uFFFF]/.test(first) && !isProviderTitle && !isTechnicalTitle) lines.push(first);
    }
    var text = [stream.name, originalTitle, stream.fileName, stream.filename, stream.videoCodec, stream.codec, stream.audioCodec, stream.audioChannels, stream.releaseSource, stream.sourceQuality, stream.hdr].map(clean).join(" ");
    // Film titles containing words such as English or BluRay are not technical metadata.
    var contentTitle = clean(meta.title || meta.name) || (lines.length ? lines[0] : "");
    if (contentTitle) text = text.split(contentTitle).join("");
    var quality = usable(stream.quality);
    var resolution = /\b(2160|1440|1080|720|576|480|360|240|144)p?\b/i.exec(quality);
    if (!resolution) resolution = /\b(2160|1440|1080|720|576|480|360|240|144)p\b/i.exec(text);
    var qualityLabel = resolution ? (resolution[1] === "2160" ? "4K" : resolution[1] + "p") : (/\b4k\b/i.test(quality + " " + text) ? "4K" : "");
    var audioLang = language(stream.audioLanguage || stream.language || stream.lang);
    var audioLanguages = Array.isArray(stream.audioLanguages) ? unique(stream.audioLanguages.map(language)) : [];
    if (!audioLang && audioLanguages.length === 1) audioLang = audioLanguages[0];
    var explicitAudio = /\b(English|Malay|Indonesian|Hindi|Tamil|Telugu|Japanese|Korean|Chinese|Spanish|French|Arabic)[ -]Audio\b/i.exec(text);
    if (!audioLang && explicitAudio) audioLang = language(explicitAudio[1]);
    var labelledAudio = /🌍\s*([^|\n]+)/.exec(originalTitle);
    if (!audioLang && labelledAudio) audioLang = language(labelledAudio[1]);
    var filenameAudio = /(?:^|[._ -])(English|Malay|Indonesian|Hindi|Tamil|Telugu|Japanese|Korean|Chinese)(?=[._ -]|$)/i.exec(clean(stream.fileName || stream.filename));
    if (!audioLang && filenameAudio) audioLang = language(filenameAudio[1]);
    // MovieBlast exposes its language as a trailing parenthesised code.
    var parenthesised = /\(([A-Za-z]{2,3})\)\s*$/.exec(clean(originalTitle));
    if (!audioLang && parenthesised) audioLang = language(parenthesised[1]);
    var audioLabel = audioLang ? audioLang + " Audio" : "";
    if (audioLanguages.length > 1) audioLabel = "Multi Audio (" + audioLanguages.join(", ") + ")";
    if (/^original$/i.test(clean(stream.audioLanguage)) || /\boriginal[- ]audio\b/i.test(text)) audioLabel = "Original Audio";
    if (/\bdual[- ]audio\b/i.test(text)) audioLabel = "Dual Audio" + (audioLang ? " (" + audioLang + ")" : "");
    else if (/\b(?:multi[- ]audio|multilingual)\b/i.test(text)) audioLabel = "Multi Audio" + (audioLang ? " (" + audioLang + ")" : "");
    var server = usable(stream.serverName || stream.server || stream.sourceName);
    var labelledServer = /📌\s*([^|\n]+)/.exec(originalTitle);
    if (!server && labelledServer) server = usable(labelledServer[1]);
    if (!server) {
      server = clean(stream.name);
      [providerName, providerName.replace(/\s+V\d+$/i, ""), providerId, providerId.replace(/-v\d+$/, "")].forEach(function(label) {
        label = clean(label);
        if (!label) return;
        if (server.toLowerCase().indexOf(label.toLowerCase()) === 0) server = server.slice(label.length).trim();
      });
      if (!server) {
        var titleServer = clean(originalTitle);
        var baseLabel = clean(providerName.replace(/\s+V\d+$/i, ""));
        if (baseLabel && titleServer.toLowerCase().indexOf(baseLabel.toLowerCase() + " - ") === 0) {
          server = titleServer.slice(baseLabel.length + 3).replace(/\([A-Za-z]{2,3}\)\s*$/, "").trim();
        }
      }
      server = server.replace(/\b\d{3,4}p\b|\b(?:4k|FHD|UHD|Auto)\b/gi, "")
        .replace(/\((?:English|Hindi|Tamil|Telugu|Malay|Indonesian|EN|HI|TA|TE|MS|ID)\)/gi, "").trim();
      // Keep descriptive host names; omit names consisting of quality/audio labels.
      if (/\b(?:\d{3,4}p|4k|audio|FHD|UHD|HLS|M3U8|MP4|BluRay|WEB-DL)\b/i.test(server)) {
        var numbered = /\bServer\s+\d+\b/i.exec(server);
        server = numbered ? numbered[0] : "";
      }
      server = usable(server.replace(/^[|·: -]+|[|·: -]+$/g, ""));
      if (server.length > 80) server = "";
    }
    if (!server) server = "Server " + (index + 1);
    var path = String(stream.url).split(/[?#]/)[0];
    var formatLabel = /\.m3u8$/i.test(path) ? "HLS" : /\.mp4$/i.test(path) ? "MP4" : /\.mkv$/i.test(path) ? "MKV" : /\.mpd$/i.test(path) ? "DASH" : "";
    if (!formatLabel) {
      var declared = clean(stream.format || stream.mimeType || stream.type);
      if (/^(?:hls|m3u8|application\/(?:vnd\.apple\.mpegurl|x-mpegurl))$/i.test(declared)) formatLabel = "HLS";
      else if (/^(?:mp4|video\/mp4)$/i.test(declared)) formatLabel = "MP4";
      else if (/^(?:dash|application\/dash\+xml)$/i.test(declared)) formatLabel = "DASH";
    }
    var minutes = Number(stream.runtimeMinutes || (type === "movie" ? meta.runtime : 0));
    var duration = minutes > 0 && Number.isFinite(minutes) ? Math.round(minutes) + " min" : "";
    if (!duration) { var dm = /\b(\d+)\s*min(?:utes)?\b/i.exec(clean(stream.duration) + " " + text); if (dm && Number(dm[1]) > 0) duration = dm[1] + " min"; }
    var firstLine = lines.length ? "🎬 " + lines[0] : "";
    // Match PlayIMDb's original typography and order, without its guessed defaults.
    if (displayTitle) {
      firstLine = type === "tv" ? "🎬 " + usable(meta.title || meta.name) + " - S" + Number(season) + "E" + Number(episode) + (year ? " (" + year[0] + ")" : "") :
        "🎬 " + usable(meta.title || meta.name) + (year ? " - " + year[0] : "");
    }
    var qualityDisplay = qualityLabel === "4K" ? "2160P" : qualityLabel.toUpperCase();
    var audioDisplay = audioLabel.replace(/[- ]Audio/g, "").trim();
    var infoLine = [qualityDisplay ? "💎 " + qualityDisplay : "", audioDisplay ? "🌍 " + audioDisplay : ""].filter(Boolean).join(" | ");
    var bottomLine = [formatLabel ? "🎞️ " + (formatLabel === "HLS" ? "M3U8" : formatLabel) : "", duration ? "⏱️ " + duration : "", "📌 " + server].filter(Boolean).join(" | ");
    var nameQuality = qualityLabel === "4K" ? "4K UHD" : qualityLabel === "1080p" ? "1080p FHD" : qualityLabel === "720p" ? "720p HD" : qualityLabel;
    output.name = ["🟡 " + providerName, nameQuality, audioLabel ? audioLabel.replace(/ Audio/g, "-Audio") : ""].filter(Boolean).join(" | ");
    output.title = [firstLine, infoLine, bottomLine].filter(Boolean).join("\n");
    return output;
  }
  var original = provider.getStreams;
  var adapted = Object.assign({}, provider);
  adapted.getStreams = function(id, type, season, episode) {
    var args = arguments;
    var mediaType = type === "series" ? "tv" : type;
    return Promise.resolve().then(function() { return original.apply(provider, args); }).then(function(streams) {
      if (!Array.isArray(streams)) return streams;
      var meta = metadata(id, mediaType);
      streams = cloudAnimeFilterStreams(streams, "anizone");
      streams = cloudAnimeMinimumResolution(streams, "anizone");
      return streams.map(function(stream, index) {
        try { return format(stream, index, meta, mediaType, season, episode); } catch (_) { return stream; }
      });
    });
  };
  return adapted;
}
module.exports = cloudbankDisplayInstall(module.exports, "AniZone", "anizone");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
/* CLOUDBANK_PLAYIMDB_DISPLAY_END */

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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "anizone");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
