/* CloudAnime Animetsu v2.1.3 — animetsu.site client-engine Bee Sub adapter. */
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
  function allowedQuality(value) {
    var q=String(value==null?'':value).trim().toLowerCase();
    if(!q||/^(?:auto|unknown|default|source)$/.test(q))return true;
    var dim=q.match(/\b\d{3,4}\s*[x×]\s*(\d{3,4})\b/),p=q.match(/(?:^|[^0-9])(\d{3,4})\s*p?\b/);
    if(dim)return Number(dim[1])>=720;
    if(p)return Number(p[1])>=720;
    return !/\b(?:sd|low)\b/.test(q);
  }
  function cached(op, key, value) {
    if (typeof globalThis.vueoMetadataCache !== 'function') return null;
    try { return JSON.parse(globalThis.vueoMetadataCache(JSON.stringify({op:op,key:'animetsu211:'+key,value:value,ttlMs:300000}))); } catch (_) { return null; }
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
    var deadline = Date.now() + 36000, calls = 0, result = [], sourceSettled = false, pendingRequests = new Set();
    async function request(url, options, maxMs, mediaProbe) {
      var budget = Math.min(maxMs || 10000, deadline - Date.now());
      if (budget <= 0) throw Error('Request budget exhausted');
      var timer, cancel, controller = typeof AbortController === 'function' ? new AbortController() : null;
      var cancelled = new Promise(function(_,reject) {cancel = function() {if (controller) controller.abort();reject(Error('Cancelled after another server completed'));};});
      pendingRequests.add(cancel);calls++;
      try {
        return await Promise.race([cancelled,
          Promise.resolve().then(async function() {
            var opts = Object.assign({}, options || {});
            opts.headers = Object.assign({'User-Agent':UA,Referer:SITE+'/',Accept:'application/json,text/plain,*/*'},opts.headers || {});
            if (controller) opts.signal = controller.signal;
            var response = await fetch(url,opts);
            if (!response.ok) throw Error('HTTP '+response.status+' at '+new URL(url).hostname);
            if(mediaProbe && response.status!==206)throw Error('MP4 probe requires a bounded partial response');
            var body = await response.text();
            if (body.length > 4000000) throw Error('Response too large');
            return {body:body,headers:response.headers,status:response.status};
          }),
          new Promise(function(_,reject) {timer = setTimeout(function() {if (controller) controller.abort();reject(Error('Request timeout at '+new URL(url).hostname));},budget);})
        ]);
      } finally {clearTimeout(timer);pendingRequests.delete(cancel);}
    }
    async function metadata(url, maxMs) {
      var hit = cached('get',url);
      if (hit) return hit;
      var data = compact(url, JSON.parse((await request(url,undefined,maxMs)).body));
      if (data && !data.error && (!Array.isArray(data) || data.length)) cached('put',url,data);
      return data;
    }
    async function sharedDetails() {
      var ctx=globalThis.VUEO_DISCOVERY_CONTEXT;
      if (typeof ctx==='string') {try {ctx=JSON.parse(ctx);} catch (_) {ctx=null;}}
      if (!ctx && typeof globalThis.vueoDiscoveryContext==='function') {
        try {ctx=await globalThis.vueoDiscoveryContext('https://api.themoviedb.org/3/'+type+'/'+id);if(typeof ctx==='string')ctx=JSON.parse(ctx);} catch (_) {ctx=null;}
      }
      var d=ctx&&ctx.tmdb;
      var contextId=ctx&&(ctx.tmdbId || d&&d.id), contextType=ctx&&(ctx.mediaType||ctx.type);
      if (String(contextId)===id && (!contextType || contextType===type || contextType==='series'&&type==='tv')) {
        d=Object.assign({},d||{});
        d.id=Number(id);d.name=d.name||ctx.title;d.original_name=d.original_name||ctx.originalTitle;
        d._aliases=Array.isArray(ctx.aliases)?ctx.aliases:[];
        if (d.name||d.title) {log('METADATA','Using title already supplied by VUEO');return d;}
      }
      return metadata('https://api.themoviedb.org/3/'+type+'/'+id+'?api_key=439c478a771f35c05022f9feabcca01c');
    }
    function normTitle(v) {
      var s=String(v||'').toLowerCase();if(s.normalize)s=s.normalize('NFKC');
      s=s.replace(/(\d+)(?:st|nd|rd|th)\s+season/g,'season $1').replace(/第(\d+)期/g,'season $1');
      return s.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g,'');
    }
    async function titleSearch(detail) {
      var names=[detail.name,detail.title,detail.original_name,detail.original_title].concat(detail._aliases||[]);
      var alt=detail.alternative_titles||{};(alt.results||alt.titles||[]).forEach(function(a) {if(a&&a.title)names.push(a.title);});
      names=names.filter(function(n,i,a) {return typeof n==='string'&&n.trim()&&a.indexOf(n)===i;});
      if(!names.length)return null;
      var query=names[0],keys;
      if(type==='tv'&&season>1) {
        query+=' Season '+season;
        keys=names.map(function(n) {return normTitle(n+' Season '+season);});
        names.filter(function(n) {return /season\s*\d+|\d+(?:st|nd|rd|th)\s+season|第\d+期/i.test(n);}).forEach(function(n) {keys.push(normTitle(n));});
      } else keys=names.map(normTitle);
      function accept(c) {
        return c&&positive(c.ani||c.mal)&&(type==='movie'?c.format==='MOVIE':['TV','TV_SHORT','ONA'].includes(c.format))&&c.names.some(function(n) {return keys.includes(normTitle(n));});
      }
      var candidates=[];
      log('SEARCH',"Title query='"+query+"'; website catalogue route");
      try {
        var payload=JSON.parse((await request('https://graphql.anilist.co',{
          method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify({query:'query($search:String!){Page(perPage:6){media(search:$search,type:ANIME){id idMal format title{romaji english native} synonyms}}}',variables:{search:query}})
        },3500)).body);
        var entries=payload&&payload.data&&payload.data.Page&&payload.data.Page.media;
        candidates=(Array.isArray(entries)?entries:[]).filter(Boolean).map(function(a) {var t=a.title||{};return {ani:positive(a.id),mal:positive(a.idMal),format:a.format,names:[t.english,t.romaji,t.native].concat(a.synonyms||[])};}).filter(accept);
      } catch(e) {log('SEARCH','AniList catalogue unavailable; trying website Jikan search');}
      if(!candidates.length) {
        try {
          var data=await metadata('https://api.jikan.moe/v4/anime?q='+encodeURIComponent(query),3500);
          candidates=(data&&Array.isArray(data.data)?data.data:[]).filter(Boolean).map(function(a) {return {ani:null,mal:positive(a.mal_id),format:String(a.type||'').toUpperCase().replace(/ /g,'_'),names:[a.title_english,a.title,a.title_japanese].concat(a.title_synonyms||[],(a.titles||[]).map(function(t) {return t.title;}))};}).filter(accept);
        } catch(e) {log('SEARCH','Jikan catalogue unavailable');}
      }
      var seen=Object.create(null);candidates=candidates.filter(function(c) {var k=c.ani?'a:'+c.ani:'m:'+c.mal;if(seen[k])return false;seen[k]=true;return true;});
      log('SEARCH','Exact title/season candidates='+candidates.length);
      if(candidates.length!==1)return null;
      var c=candidates[0];
      if(!c.ani) {
        // Jikan supplies MAL IDs; one direct ID lookup is sufficient here.
        // This is not the full ARM/TVDB/episode-date chain.
        try {
          var d=await metadata('https://api.ani.zip/mappings?mal_id='+c.mal),m=d&&d.mappings;
          if(!m||Number(m.mal_id)!==c.mal||!positive(m.anilist_id))return null;
          c.ani=Number(m.anilist_id);
        } catch(e) {return null;}
      }
      return {anilist:c.ani,mal_id:c.mal,episode:type==='movie'?1:episode,anime_title:c.names.find(function(n) {return n&&keys.includes(normTitle(n));})||names[0],mapping_method:'website-title-search',directEpisodes:true};
    }
    async function mapAnime() {
      var key=[id,type,season,episode].join(':'),hit=cached('get','mapping:'+key);
      if(hit&&positive(hit.anilist)&&positive(hit.episode)) {log('ROUTE','Cached source ID and episode; skipping search/mapping');return hit;}
      var entryKey='entry:'+id+':'+type+':'+season,entry=cached('get',entryKey);
      if(entry&&positive(entry.anilist)&&entry.directEpisodes) {
        log('ROUTE','Cached catalogue ID; requesting episode directly');
        return Object.assign({},entry,{episode:type==='movie'?1:episode});
      }
      // Animetsu's published Bee/GG routes accept AniList IDs, not TMDB IDs.
      // Unsupported TMDB-direct routes are skipped without speculative requests.
      log('ROUTE','TMDB-direct unsupported by Bee/GG; trying title search first');
      var detail=null;try {detail=await sharedDetails();} catch(e) {log('METADATA','Title metadata unavailable; mapping remains eligible');}
      var mapped=detail?await titleSearch(detail):null;
      if(mapped) {
        log('ROUTE','Exact title match; ARM and episode-date mapping skipped');return mapped;
      }
      return mappingFallback();
    }
    async function mappingFallback() {
      log('ROUTE','Using mapping fallback after title route');
      var bridge=cloudbankAnimeMappingFetch(async function(url) {var d=await metadata(url);return {ok:true,json:async function() {return d;}};});
      var route=type==='movie'?'https://arm.haglund.dev/api/v2/tmdb?id='+id:'https://id-mapping-api-malid.hf.space/api/resolve?id='+id+'&s='+season+'&e='+episode;
      var response=await bridge(route),mapped=response.ok?await response.json():null;
      if(!mapped||!positive(mapped.anilist)||!positive(mapped.episode))throw Error('Title search and mapping fallback found no usable source identity');
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
        if (!s || !japanese(s) || !allowedQuality(s.quality)) return false;
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
        } catch(e) {if (!sourceSettled) log('SOURCE_FAILED',e.message);return null;}
      }))).filter(Boolean);
      return beeResult;
      }
      async function ggStreams() {
        var data = JSON.parse((await request('https://api.animetsu.site/watch/animegg/'+mapped.anilist+'/sub/animegg-'+mapped.episode)).body);
        if (data.error || Number(data.anilistId) !== mapped.anilist || Number(data.episode) !== mapped.episode || data.providerEpisode != null && Number(data.providerEpisode) !== mapped.episode || !/^(?:sub|subbed)$/i.test(data.audio || '') || !japanese(data)) throw Error('GG response identity/audio does not match request');
        var streams=(Array.isArray(data.streams)?data.streams:[]).filter(function(s) {return s&&s.type==='mp4'&&japanese(s)&&allowedQuality(s.quality);});
        streams.sort(function(a,b) {return Number(b.isActive===true)-Number(a.isActive===true)||(parseInt(b.quality)||0)-(parseInt(a.quality)||0);});
        var headers={'User-Agent':UA,Referer:'https://www.animegg.org/'},seen=Object.create(null),candidates=[];
        streams.slice(0,3).forEach(function(s) {
          var raw=s.proxied_url || (s.url===data.stream_url?data.proxied_stream_url:'');
          var urls=[];
          if(typeof raw==='string'&&/^https:\/\/|^\/(?!\/)/i.test(raw)) {
            try {urls.push({url:https(new URL(raw,'https://api.animetsu.site/').href),direct:false});}catch(_){}
          }
          urls.push({url:https(s.url),direct:true});
          urls.forEach(function(c) {if(c.url&&!seen[c.url]) {seen[c.url]=true;c.quality=s.quality||'Auto';candidates.push(c);}});
        });
        if(!candidates.length)throw Error('GG has no eligible MP4 quality (720p+/Auto/Unknown)');
        // Race bounded probes; never return an API-only source or duplicate routes.
        return new Promise(function(resolve) {
          var remaining=candidates.length,done=false;
          candidates.forEach(function(c) {
            (async function() {
              var r=await request(c.url,{headers:Object.assign({},headers,{Range:'bytes=0-1023'})},10000,true);
              var h=function(k) {return r.headers&&typeof r.headers.get==='function'?String(r.headers.get(k)||''):'';};
              var range=h('content-range').match(/^bytes 0-(\d+)\/(\d+)$/i),body=r.body;
              // ASCII box names survive UTF-8 text bridges; never rely on byte offsets.
              if(!range||Number(range[1])>1023||Number(range[2])<=Number(range[1])||!/^video\/mp4(?:;|$)/i.test(h('content-type'))||!body||body.length>4096||/<(?:!doctype|html|script)|^\s*[\[{]/i.test(body)||!/(?:ftyp|styp)(?:isom|iso[2-9]|mp4[12]|avc1|dash|MSNV)/.test(body.slice(0,128)))throw Error('GG partial response is not confirmed MP4');
              return {name:'Animetsu',provider:'animetsu',serverName:c.direct?'GG Direct':'GG',title:(mapped.anime_title||'Anime')+' • Episode '+mapped.episode+' • Japanese Sub',url:c.url,quality:c.quality,type:'mp4',mimeType:'video/mp4',audioType:'original',audioLanguage:'ja',headers:headers,subtitles:[]};
            })().then(function(source) {
              if(done||sourceSettled)return;done=true;
              log('SOURCE','GG MP4 partial response confirmed; first valid route only');resolve([source]);
            },function(e) {
              if(done||sourceSettled)return;
              if(--remaining===0) {done=true;log('SOURCE_FAILED','GG: all eligible media probes failed');resolve([]);}
            });
          });
        });
      }

      async function discoverSources() {
      sourceSettled=false;
      return new Promise(function(resolve) {
        var remaining = 2;
        [beeStreams,ggStreams].forEach(function(extract) {
          Promise.resolve().then(extract).then(function(streams) {
            if (sourceSettled) return;
            if (streams.length) {
              sourceSettled = true;
              log('READY',streams[0].serverName+' validated first; returning immediately');
              pendingRequests.forEach(function(cancel) {cancel();});
              resolve(streams);
            } else if (--remaining === 0) {sourceSettled = true;resolve([]);}
          },function(e) {
            if (sourceSettled) return;
            log('SOURCE_FAILED',(extract === beeStreams ? 'Bee: ' : 'GG: ')+e.message);
            if (--remaining === 0) {sourceSettled = true;resolve([]);}
          });
        });
      });
      }
      result=await discoverSources();
      if(!result.length && mapped.directEpisodes) {
        cached('put','entry:'+id+':'+type+':'+season,{invalid:true});
        cached('put','mapping:'+id+':'+type+':'+season+':'+episode,{invalid:true});
        var alternate=await mappingFallback();
        if(alternate.anilist!==mapped.anilist || alternate.episode!==mapped.episode) {
          log('ROUTE','Mapping fallback changed source ID/episode; trying that route');
          mapped=alternate;result=await discoverSources();
        } else log('ROUTE','Mapping confirms same source coordinates; no duplicate source requests');
      }
      if(result.length) {
        cached('put','mapping:'+id+':'+type+':'+season+':'+episode,mapped);
        if(mapped.directEpisodes)cached('put','entry:'+id+':'+type+':'+season,mapped);
      }
    } catch(e) {log('NO_RESULT',e.message);}
    log('RESULT',result.length+' Japanese Sub sources, '+calls+' HTTP calls');
    return result;
  }
  module.exports = {getStreams:getStreams};
  if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "animetsu");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
