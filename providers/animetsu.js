/* CloudAnime Animetsu v2.0.0 — animetsu.site client-engine Bee Sub adapter. */
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
                compatible(day(e.airdate || e.airDate || e.airDateUtc), released(v))) bridges.push(v);
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
        return e && /^\d+$/.test(String(e.episode)) && positive(e.episode) && compatible(day(e.airdate || e.airDate || e.airDateUtc), target);
      }).sort(function(a,b) { return Number(a.episode) - Number(b.episode); });
      // Exact dates win; +/- one day accounts only for local/UTC broadcast dates.
      var exact = list.filter(function(e) { return day(e.airdate || e.airDate || e.airDateUtc) === target; });
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


(function () {
  'use strict';
  var SITE = 'https://animetsu.site', BEE = 'https://api.aniclover.cc';
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  function log(stage, detail) { console.log('[Animetsu] ' + stage + ': ' + detail); }
  function positive(v) { var n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }
  function https(value) {
    if (typeof value !== 'string') return '';
    try { var u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch (_) { return ''; }
  }
  function cached(op, key, value) {
    if (typeof globalThis.vueoMetadataCache !== 'function') return null;
    try { return JSON.parse(globalThis.vueoMetadataCache(JSON.stringify({op:op,key:'animetsu2:'+key,value:value,ttlMs:300000}))); } catch (_) { return null; }
  }
  function compact(url, data) {
    if (url.indexOf('https://api.ani.zip/mappings?') === 0 && data && data.episodes) {
      var eps = {};
      Object.keys(data.episodes).forEach(function(k) {
        var e = data.episodes[k];
        if (e) eps[k] = {episode:e.episode,tvdbId:e.tvdbId,tvdbShowId:e.tvdbShowId,seasonNumber:e.seasonNumber,episodeNumber:e.episodeNumber,absoluteEpisodeNumber:e.absoluteEpisodeNumber,airdate:e.airdate,airDate:e.airDate,airDateUtc:e.airDateUtc};
      });
      return {mappings:data.mappings,titles:data.titles,episodeCount:data.episodeCount,episodes:eps};
    }
    if (url.indexOf('https://v3-cinemeta.strem.io/meta/series/') === 0 && data && data.meta) {
      return {meta:{id:data.meta.id,videos:(data.meta.videos||[]).map(function(e) {return {season:e.season,episode:e.episode,released:e.released,tvdb_id:e.tvdb_id};})}};
    }
    return data;
  }
  function language(track) {
    var text = [track.language,track.lang,track.srclang,track.label,track.name].filter(function(v) {return typeof v === 'string';}).join(' ').toLowerCase();
    if (/\b(?:en|eng|english)\b/.test(text)) return {code:'en',name:'English'};
    if (/\b(?:ms|msa|may|malay|bahasa melayu)\b/.test(text)) return {code:'ms',name:'Malay'};
    if (/\b(?:id|ind|indo|indonesian|bahasa indonesia)\b/.test(text)) return {code:'id',name:'Indo'};
    return null;
  }
  function japanese(data) {
    if (!data || typeof data !== 'object') return true;
    var tags = [data.audio,data.audioLanguage,data.audio_language,data.requestedAudio,data.source_type];
    return tags.every(function(v) {return v == null || v === '' || typeof v === 'string' && /^(?:ja|jp|jpn|japanese|sub|subbed)$/i.test(v.trim());});
  }
  function point(value) {
    if (!value || !Number.isFinite(Number(value.start)) || !Number.isFinite(Number(value.end)) || Number(value.start) < 0 || Number(value.end) <= Number(value.start)) return null;
    return {start:Number(value.start),end:Number(value.end)};
  }
  async function getStreams(id, type, season, episode) {
    id = String(id || ''); type = type === 'series' ? 'tv' : type;
    season = Number(season); episode = type === 'movie' ? 1 : Number(episode);
    if (!/^[1-9]\d*$/.test(id) || !['tv','movie'].includes(type) || type === 'tv' && (!Number.isInteger(season) || season < 0 || !positive(episode))) return [];
    var deadline = Date.now() + 36000, calls = 0, result = [];
    async function request(url, options, rangeProbe) {
      var budget = Math.min(10000, deadline - Date.now());
      if (budget <= 0) throw Error('Request budget exhausted');
      var timer, controller = typeof AbortController === 'function' ? new AbortController() : null;
      calls++;
      try {
        return await Promise.race([
          Promise.resolve().then(async function() {
            var opts = Object.assign({}, options || {});
            opts.headers = Object.assign({'User-Agent':UA,Referer:SITE+'/',Accept:'application/json,text/plain,*/*'},opts.headers || {});
            if (controller) opts.signal = controller.signal;
            var response = await fetch(url,opts);
            if (!response.ok) throw Error('HTTP '+response.status+' at '+new URL(url).hostname);
            if (rangeProbe && (response.status !== 206 || !response.headers || !/^bytes 0-\d+\//i.test(response.headers.get('content-range') || '') || Number(response.headers.get('content-length')) > 4096)) throw Error('MP4 server did not honor the bounded Range request');
            var body = await response.text();
            if (body.length > 4000000) throw Error('Response too large');
            return {body:body,headers:response.headers};
          }),
          new Promise(function(_,reject) {timer = setTimeout(function() {if (controller) controller.abort();reject(Error('Request timeout at '+new URL(url).hostname));},budget);})
        ]);
      } finally {clearTimeout(timer);}
    }
    async function metadata(url) {
      var hit = cached('get',url);
      if (hit) return hit;
      var data = compact(url, JSON.parse((await request(url)).body));
      if (data && !data.error) cached('put',url,data);
      return data;
    }
    async function mapAnime() {
      var key = [id,type,season,episode].join(':'), hit = cached('get','mapping:'+key);
      if (hit && positive(hit.mal_id) && positive(hit.anilist) && positive(hit.episode)) {log('CACHE','Verified episode mapping hit');return hit;}
      var bridge = cloudbankAnimeMappingFetch(async function(url) {
        var data = await metadata(url);return {ok:true,json:async function() {return data;}};
      });
      var route = type === 'movie' ? 'https://arm.haglund.dev/api/v2/tmdb?id='+id : 'https://id-mapping-api-malid.hf.space/api/resolve?id='+id+'&s='+season+'&e='+episode;
      var response = await bridge(route), mapped = response.ok ? await response.json() : null;
      if (!mapped || !positive(mapped.mal_id) || !positive(mapped.anilist) || !positive(mapped.episode)) throw Error('No verified TMDB-to-anime episode mapping; no title or season-offset guess');
      // Confirm Japanese origin independently; Sub means original audio, not always Japanese.
      var countryKey = 'origin:'+mapped.anilist, origin = cached('get',countryKey);
      var ctx = globalThis.VUEO_DISCOVERY_CONTEXT, tmdb = ctx && ctx.tmdb;
      if (typeof ctx === 'string') {try {ctx = JSON.parse(ctx);tmdb = ctx.tmdb;} catch (_) {ctx = null;}}
      var exactContext = tmdb && String(tmdb.id || ctx.tmdbId) === id && (!ctx.mediaType || ctx.mediaType === type);
      if (exactContext && typeof tmdb.original_language === 'string') {
        if (tmdb.original_language !== 'ja') throw Error('Content original language is not Japanese');
        origin = {countryOfOrigin:'JP',mal:mapped.mal_id};
      }
      if (!origin) {
        var detail = await metadata('https://api.themoviedb.org/3/'+type+'/'+id+'?api_key=439c478a771f35c05022f9feabcca01c');
        if (!detail || String(detail.id) !== id || typeof detail.original_language !== 'string') throw Error('Anime origin/identity verification unavailable');
        origin = {countryOfOrigin:detail.original_language === 'ja' ? 'JP' : '',mal:mapped.mal_id};
        cached('put',countryKey,origin);
      }
      if (origin.countryOfOrigin !== 'JP' || origin.mal !== mapped.mal_id) throw Error('Anime is not verified Japanese content');
      cached('put','mapping:'+key,mapped);
      return mapped;
    }
    try {
      var mapped = await mapAnime();
      log('MAPPING','TMDB '+id+(type === 'tv' ? ' S'+season+'E'+episode : ' movie')+' -> AniList '+mapped.anilist+' / MAL '+mapped.mal_id+' E'+mapped.episode+' via '+(mapped.mapping_method || 'movie identity'));
      // This is the active default server in animetsu.site/assets/client_engine.js.
      // /v2/api routes in the website are intercepted locally, not a server API.
      async function beeStreams() {
      var endpoint = BEE+'/api/watch/'+mapped.anilist+'/sub/'+mapped.episode;
      var data = JSON.parse((await request(endpoint)).body);
      if (data.success !== true || data.error || !japanese(data)) throw Error('Bee returned no confirmed Sub result');
      if (data.anilistId != null && Number(data.anilistId) !== mapped.anilist || data.episode != null && Number(data.episode) !== mapped.episode) throw Error('Bee response identity conflicts with request');
      // Prefer the explicit Sub branch. Never consume dub/multi branches.
      var selected = data.sub && typeof data.sub === 'object' && !Array.isArray(data.sub) ? data.sub : data;
      if (!japanese(selected)) throw Error('Bee Sub branch contains conflicting audio metadata');
      var sources = Array.isArray(selected.streams) ? selected.streams : Array.isArray(selected.sources) ? selected.sources : [];
      if (!sources.length && selected.streamUrl) sources = [{url:selected.streamUrl,type:'hls'}];
      var unique = Object.create(null);
      sources = sources.filter(function(s) {
        if (!s || !japanese(s)) return false;
        var u = https(s.url || s.file), kind = String(s.type || '').toLowerCase();
        if (!u || !(/^(?:hls|application\/vnd\.apple\.mpegurl|application\/x-mpegurl|video\/mpegurl)$/.test(kind) || /\.m3u8(?:\?|$)/i.test(u)) || unique[u]) return false;
        unique[u] = true;return true;
      }).slice(0,3);
      log('SOURCE','animetsu.site active Bee server; Sub only; HLS candidates='+sources.length);
      var headers = {'User-Agent':UA,Referer:'https://beta.zanora.xyz/',Origin:'https://beta.zanora.xyz'};
      var beeResult = (await Promise.all(sources.map(async function(source) {
        try {
          var url = https(source.url || source.file), body = (await request(url,{headers:headers})).body.trim();
          if (!/^#EXTM3U(?:\r?\n|$)/.test(body) || !/#EXT-X-(?:STREAM-INF|TARGETDURATION):/.test(body)) throw Error('Media response is not HLS');
          var renditionLines = body.split(/\r?\n/).filter(function(l) {return /^#EXT-X-MEDIA:/.test(l) && /TYPE=AUDIO(?:,|$)/.test(l);});
          var ja = renditionLines.filter(function(l) {return /LANGUAGE="(?:ja|jp|jpn|japanese)"/i.test(l);});
          if (renditionLines.length && !ja.length) throw Error('HLS audio metadata contains no Japanese rendition');
          var multiAudio = renditionLines.some(function(l) {return !/LANGUAGE="(?:ja|jp|jpn|japanese)"/i.test(l);});
          if (multiAudio) url += (url.indexOf('#') < 0 ? '#' : '&')+'vueo_hls_v1=plain&audio=ja,jp,jpn,japanese';
          var rawTracks = Array.isArray(selected.subtitles) ? selected.subtitles : Array.isArray(selected.tracks) ? selected.tracks : [];
          var seenTracks = Object.create(null), subtitles = [];
          rawTracks.forEach(function(t) {
            if (!t) return;
            var lang = language(t), link = https(t.url || t.file);
            if (!lang || !link || seenTracks[link] || /^(?:thumbnails|chapters|storyboard)$/i.test(t.kind || '')) return;
            seenTracks[link] = true;
            var hint = [t.type,t.format,t.mimeType].filter(Boolean).join(' ');
            var format = /\.srt(?:\?|$)/i.test(link) || /\b(?:srt|subrip|x-subrip)\b/i.test(hint) ? 'srt' : /\.(?:ass|ssa)(?:\?|$)/i.test(link) || /\b(?:ass|ssa|x-ssa)\b/i.test(hint) ? 'ass' : 'vtt';
            subtitles.push({url:link,name:lang.name,label:lang.name,language:lang.code,lang:lang.code,srclang:lang.code,format:format,type:format === 'vtt' ? 'text/vtt' : format === 'ass' ? 'text/x-ssa' : 'application/x-subrip',mimeType:format === 'vtt' ? 'text/vtt' : format === 'ass' ? 'text/x-ssa' : 'application/x-subrip',headers:headers});
          });
          return {name:'Animetsu',provider:'animetsu',serverName:'Bee',title:(mapped.anime_title || 'Anime')+' • Episode '+mapped.episode+' • Japanese Sub',url:url,quality:source.quality || 'Auto',type:'hls',mimeType:'application/x-mpegURL',audioType:'original',audioLanguage:'ja',headers:headers,subtitles:subtitles,intro:point(selected.intro),outro:point(selected.outro)};
        } catch(e) {log('SOURCE_FAILED',e.message);return null;}
      }))).filter(Boolean);
      return beeResult;
      }
      async function ggStreams() {
        var data = JSON.parse((await request('https://api.animetsu.site/watch/animegg/'+mapped.anilist+'/sub/animegg-'+mapped.episode)).body);
        if (data.error || Number(data.anilistId) !== mapped.anilist || Number(data.episode) !== mapped.episode || data.providerEpisode != null && Number(data.providerEpisode) !== mapped.episode || !/^(?:sub|subbed)$/i.test(data.audio || '') || !japanese(data)) throw Error('GG response identity/audio does not match request');
        var streams = (Array.isArray(data.streams) ? data.streams : []).filter(function(s) {return s && s.isActive !== false && s.type === 'mp4' && japanese(s);});
        streams.sort(function(a,b) {return (parseInt(b.quality)||0)-(parseInt(a.quality)||0);});
        if (!streams.length) throw Error('GG has no active MP4 source');
        var selected = streams[0], raw = selected.proxied_url || (selected.url === data.stream_url ? data.proxied_stream_url : '') || selected.url, url;
        try {url = https(new URL(raw,'https://api.animetsu.site/').href);} catch (_) {}
        if (!url) throw Error('GG media URL invalid');
        var headers = {'User-Agent':UA,Referer:'https://www.animegg.org/'};
        var probe = await request(url,{headers:Object.assign({},headers,{Range:'bytes=0-511'})},true);
        if (probe.body.slice(4,8) !== 'ftyp') throw Error('GG media is not an ISO MP4 file');
        log('SOURCE','GG active '+(selected.quality || 'Auto')+' MP4; 206 Range and ftyp verified');
        return [{name:'Animetsu',provider:'animetsu',serverName:'GG',title:(mapped.anime_title || 'Anime')+' • Episode '+mapped.episode+' • Japanese Sub',url:url,quality:selected.quality || 'Auto',type:'mp4',mimeType:'video/mp4',audioType:'original',audioLanguage:'ja',headers:headers,subtitles:[]}];
      }
      var groups = await Promise.all([beeStreams,ggStreams].map(async function(extract) {try {return await extract();} catch(e) {log('SOURCE_FAILED',(extract === beeStreams ? 'Bee: ' : 'GG: ')+e.message);return [];}}));
      result = groups[0].concat(groups[1]);
    } catch(e) {log('NO_RESULT',e.message);}
    log('RESULT',result.length+' Japanese Sub sources, '+calls+' HTTP calls');
    return result;
  }
  module.exports = {getStreams:getStreams};
  if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
})();
