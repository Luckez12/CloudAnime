/* Shared episode resolver embedded in each standalone provider. */
async function cloudAnimeLinkedEpisode(rows, read, season, episode) {
  function result(row, data, localEpisode, method) {
    var mapping=data.mappings, titles=Object.values(data.titles||{}).filter(function(value){return typeof value==='string'&&value.trim();});
    return {id:Number(row.myanimelist),ep:localEpisode,mal_id:Number(row.myanimelist),
      anilist:Number(mapping.anilist_id||row.anilist)||null,episode:localEpisode,mal_episode:localEpisode,
      anime_title:(data.titles||{}).en||(data.titles||{})['x-jat']||titles[0]||'',titles:titles,
      expectedEpisodes:Number(data.episodeCount)||null,animeplanet_slug:row['anime-planet']||'',
      sourceSeason:Number(row['themoviedb-season']),sourceYear:String((data.episodes||{})['1']&&((data.episodes||{})['1'].airDate||(data.episodes||{})['1'].airdate)||'').slice(0,4),
      method:method,mapping_method:method};
  }
  var anchors = rows.filter(function(row) {
    return row && Number(row['themoviedb-season']) === season &&
      row['themoviedb-season'] != null && row['thetvdb-season'] != null &&
      Number(row['thetvdb-season']) === season && Number(row.thetvdb) > 0;
  });
  if (!anchors.length) return null;
  var candidates = rows.filter(function(row) {
    return Number(row.myanimelist) > 0 && row['thetvdb-season'] != null && anchors.some(function(anchor) {
        return String(anchor.themoviedb) === String(row.themoviedb) && Number(anchor.thetvdb) === Number(row.thetvdb);
      });
  }).filter(function(row, index, list) {
    return list.findIndex(function(other) { return Number(other.myanimelist) === Number(row.myanimelist); }) === index;
  });
  if (candidates.length > 12) throw Error('Episode mapping exceeds candidate budget');
  var matches = [], outside = false, parts = [];
  for (var offset = 0; offset < candidates.length; offset += 4) {
    var batch = candidates.slice(offset, offset + 4);
    var datasets = await Promise.all(batch.map(function(row) {
      return read('https://api.ani.zip/mappings?mal_id=' + Number(row.myanimelist));
    }));
    batch.forEach(function(row, index) {
      var data = datasets[index], mapping = data && data.mappings;
      if (!mapping || Number(mapping.mal_id) !== Number(row.myanimelist) ||
          String(mapping.themoviedb_id) !== String(row.themoviedb) ||
          Number(mapping.thetvdb_id) !== Number(row.thetvdb)) throw Error('Conflicting episode mapping identity');
      if (Number(row['themoviedb-season']) === season && Number(data.episodeCount) > 0 && episode > Number(data.episodeCount)) outside = true;
      parts.push({row:row,data:data});
      Object.values(data.episodes || {}).forEach(function(entry) {
        if (!entry || entry.seasonNumber == null || entry.episodeNumber == null ||
            Number(entry.tvdbShowId) !== Number(row.thetvdb) || Number(entry.seasonNumber) !== season ||
            Number(entry.episodeNumber) !== episode || !Number.isInteger(Number(entry.episode)) || Number(entry.episode) < 1) return;
        var hit = result(row,data,Number(entry.episode),'linked exact episode identity');
        if (!matches.some(function(existing) { return existing.id === hit.id && existing.ep === hit.ep; })) matches.push(hit);
      });
    });
  }
  if (matches.length > 1) throw Error('Conflicting episode mapping candidates');
  if (matches.length === 1) return matches[0];
  if (outside && season === 1) {
    var ranges = parts.map(function(part) {
      var entries = Object.values(part.data.episodes || {}).filter(function(entry) {
        return entry && /^[1-9]\d*$/.test(String(entry.episode));
      }).sort(function(a,b) { return Number(a.episode)-Number(b.episode); });
      if (!entries.length || entries.length !== Number(part.data.episodeCount)) return null;
      var start = Number(entries[0].absoluteEpisodeNumber);
      if (!Number.isInteger(start) || start < 1) return null;
      if (!entries.every(function(entry,index) {
        return Number(entry.episode) === index+1 && Number(entry.tvdbShowId) === Number(part.row.thetvdb) &&
          Number(entry.absoluteEpisodeNumber) === start+index && Number(entry.seasonNumber) > 0;
      })) return null;
      return {start:start,end:start+entries.length-1,entries:entries,row:part.row,data:part.data};
    });
    if (ranges.every(Boolean)) {
      ranges.sort(function(a,b) { return a.start-b.start; });
      var next=1, selected=null, complete=true;
      ranges.forEach(function(range) {
        if (range.start !== next) complete=false;
        next=range.end+1;
        if (episode >= range.start && episode <= range.end)
          selected=result(range.row,range.data,Number(range.entries[episode-range.start].episode),'verified continuous absolute episode mapping');
      });
      if (complete && selected) return selected;
    }
  }
  if (outside) throw Error('No verified episode mapping outside original anime range');
  return null;
}

/* CLOUDANIME_TITLE_FALLBACK_V1: embedded in standalone providers; no runtime imports. */
function cloudAnimeTitleKey(value) {
  var s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (s.normalize) s = s.normalize('NFKC');
  var ordinals = {second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
  s = s.replace(/\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/g, function(_, n) {return 'season '+ordinals[n];})
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g, 'season $1')
    .replace(/第\s*(\d+)\s*期/g, 'season $1');
  // Do not strip numbers, part/cour labels or sequel suffixes.
  return s.replace(/[^a-z0-9\u00c0-\uffff]/g, '');
}
async function cloudAnimeTitleFallback(id, type, season, episode, deadline) {
  id=String(id); type=type==='series'?'tv':type; season=Number(season); episode=type==='movie'?1:Number(episode);
  if (!/^(?:tt\d+|[1-9]\d*)$/.test(id) || !['tv','movie'].includes(type) ||
      type==='tv'&&(!Number.isInteger(season)||season<1||!Number.isInteger(episode)||episode<1)) return null;
  // Leave time for the existing extractor; never extend its deadline.
  var until=Math.min(Date.now()+7000,typeof deadline==='number'?deadline-2500:Infinity), calls=0;
  if (until<=Date.now()) return null;
  async function bounded(work, limit) {
    var timer;
    try { return await Promise.race([Promise.resolve().then(work),new Promise(function(_,reject){timer=setTimeout(function(){reject(Error('Title fallback timeout'));},Math.max(1,Math.min(limit,until-Date.now())));})]); }
    finally { clearTimeout(timer); }
  }
  async function request(url, options) {
    if (Date.now()>=until) throw Error('Title fallback budget exhausted');
    var controller=typeof AbortController==='function'?new AbortController():null, timer;
    options=Object.assign({},options||{});options.headers=Object.assign({Accept:'application/json'},options.headers||{});
    if(controller) options.signal=controller.signal;
    calls++;
    try {
      return await Promise.race([
        Promise.resolve().then(function(){return fetch(url,options);}).then(async function(r){
          if(!r.ok)throw Error('Catalogue HTTP '+r.status);
          var body=await r.text();if(body.length>1500000)throw Error('Catalogue response too large');return JSON.parse(body);
        }),
        new Promise(function(_,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(Error('Catalogue timeout'));},Math.max(1,Math.min(3000,until-Date.now())));})
      ]);
    } finally { clearTimeout(timer); }
  }
  function positive(n){return Number.isInteger(Number(n))&&Number(n)>0?Number(n):null;}
  function read(value){if(typeof value==='string')try{return JSON.parse(value);}catch(_){return null;}return value;}
  function compatible(ctx){
    if(!ctx||typeof ctx!=='object')return false;
    var d=ctx.tmdb||ctx, ref=ctx.tmdbId!=null?ctx.tmdbId:d.id;
    if(/^tt/.test(id)){if(String(ctx.imdbId||d.imdb_id||d.external_ids&&d.external_ids.imdb_id||'')!==id)return false;}
    else if(String(ref)!==id)return false;
    var kind=ctx.mediaType||ctx.type;
    return (!kind||kind===type||kind==='series'&&type==='tv')&&(!d.original_language||d.original_language==='ja');
  }
  function namesFor(n){
    var key=cloudAnimeTitleKey(n);
    if(!key)return [];
    if(type==='movie'||season===1)return [key];
    // A later requested season never accepts an unsuffixed first-season title.
    var numbered=/season(\d+)$/.exec(key);
    if(numbered)return Number(numbered[1])===season?[key]:[];
    return [cloudAnimeTitleKey(n+' Season '+season)];
  }
  function match(c, keys){
    if(!positive(c.mal)||!c.names.some(function(n){return keys.indexOf(cloudAnimeTitleKey(n))>=0;}))return false;
    if(type==='movie'?c.format!=='MOVIE':['TV','TV_SHORT','ONA'].indexOf(c.format)<0)return false;
    if(c.country!=='JP'&&!c.jikan)return false;
    return true;
  }
  try {
    var ctx=read(typeof globalThis!=='undefined'&&globalThis.VUEO_DISCOVERY_CONTEXT);
    if(!compatible(ctx)&&typeof globalThis.vueoDiscoveryContext==='function'&&!/^tt/.test(id))
      ctx=read(await bounded(function(){return globalThis.vueoDiscoveryContext('https://api.themoviedb.org/3/'+type+'/'+id);},2000));
    if(!compatible(ctx))return null;
    var d=ctx.tmdb||ctx, names=[d.name,d.title,d.original_name,d.original_title].concat(ctx.aliases||[]);
    var alt=d.alternative_titles||{};(alt.titles||alt.results||[]).forEach(function(x){if(x)names.push(x.title);});
    names=names.filter(function(n,i,a){return typeof n==='string'&&n.trim()&&a.indexOf(n)===i;});
    var keys=[];names.forEach(function(n){namesFor(n).forEach(function(k){if(keys.indexOf(k)<0)keys.push(k);});});
    if(!keys.length)return null;
    var queries=names.filter(function(n){return namesFor(n).length;}).slice(0,2).map(function(n){
      return type==='tv'&&season>1&&!/season\d+$/.test(cloudAnimeTitleKey(n))?n+' Season '+season:n;
    });
    queries=queries.filter(function(q,i,a){return a.indexOf(q)===i;});
    console.log('[CloudAnime] TITLE_FALLBACK: mapping unavailable; exact title/season search; '+queries.length+' queries');
    var query='query($search:String!){Page(perPage:25){pageInfo{hasNextPage} media(search:$search,type:ANIME){id idMal countryOfOrigin format episodes title{english romaji native} synonyms}}}';
    var candidates=[], catalogueFailed=false, incomplete=false;
    var results=await Promise.all(queries.map(async function(q){
      try {
        var r=await request('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query,variables:{search:q}})});
        var page=r&&r.data&&r.data.Page;
        if(!page||!Array.isArray(page.media))throw Error('Invalid anime catalogue');
        if(page.pageInfo&&page.pageInfo.hasNextPage){incomplete=true;return [];}
        return page.media.filter(Boolean).map(function(m){var t=m.title||{};return {mal:positive(m.idMal),ani:positive(m.id),country:m.countryOfOrigin,format:m.format,count:positive(m.episodes),names:[t.english,t.romaji,t.native].concat(m.synonyms||[])};});
      } catch(_){catalogueFailed=true;return [];}
    }));
    if(incomplete)return null;
    // Do not select a partial result set when one alias search was unavailable.
    if(catalogueFailed){
      if(d.original_language!=='ja')return null;
      var j=await request('https://api.jikan.moe/v4/anime?q='+encodeURIComponent(queries[0])+'&limit=25');
      if(!j||!Array.isArray(j.data)||j.pagination&&j.pagination.has_next_page)return null;
      candidates=j.data.filter(Boolean).map(function(m){return {mal:positive(m.mal_id),ani:null,country:null,jikan:true,format:String(m.type||'').toUpperCase().replace(/ /g,'_'),count:positive(m.episodes),names:[m.title,m.title_english,m.title_japanese].concat(m.title_synonyms||[],(m.titles||[]).map(function(t){return t.title;}))};});
    }else results.forEach(function(items){candidates=candidates.concat(items);});
    candidates=candidates.filter(function(c){return match(c,keys);});
    var unique=Object.create(null);candidates.forEach(function(c){var old=unique[c.mal];if(old&&old.ani&&c.ani&&old.ani!==c.ani)throw Error('Conflicting catalogue IDs');unique[c.mal]=c;});
    candidates=Object.keys(unique).map(function(k){return unique[k];});
    if(candidates.length!==1){console.log('[CloudAnime] TITLE_FALLBACK: exact candidates='+candidates.length+'; skipped');return null;}
    var chosen=candidates[0];
    if(chosen.count&&episode>chosen.count)return null;
    if(!chosen.ani){
      var zip=await request('https://api.ani.zip/mappings?mal_id='+chosen.mal),m=zip&&zip.mappings;
      if(!m||Number(m.mal_id)!==chosen.mal||!positive(m.anilist_id))return null;
      chosen.ani=Number(m.anilist_id);
    }
    var aliases=chosen.names.filter(function(n,i,a){return typeof n==='string'&&n.trim()&&a.indexOf(n)===i;}),title=aliases.find(function(n){return keys.indexOf(cloudAnimeTitleKey(n))>=0;});
    var value={mal_id:chosen.mal,anilist:chosen.ani,mal_episode:episode,episode:episode,anime_title:title,titles:aliases,expectedEpisodes:chosen.count,animeplanet_slug:'',mapping_method:'exact-title-season-fallback',title_fallback:true};
    console.log('[CloudAnime] TITLE_FALLBACK: unique MAL '+value.mal_id+' / AniList '+value.anilist+'; episode '+episode+'; '+calls+' HTTP calls');
    return value;
  }catch(error){console.log('[CloudAnime] TITLE_FALLBACK: unavailable; '+error.message);return null;}
}
async function cloudAnimeRecoverMapping(original, id, type, season, episode, deadline) {
  try {var mapped=await original();if(mapped)return mapped;}
  catch(error){
    // A known conflict is not a missing identity and must never be overridden.
    if(/conflict|disagree|mismatch|overlap/i.test(String(error&&error.message)))throw error;
  }
  return cloudAnimeTitleFallback(id,type,season,episode,deadline);
}
/* CLOUDANIME_TITLE_FALLBACK_END */

/* CloudAnime AnimeNoSub v1.1.1 — standalone runtime provider. */
/* Cloudbank anime mapping adapter. No Node globals or runtime imports. */
function cloudbankAnimeMappingFetch(nativeFetch, fallbackDeadline) {
  var cache = Object.create(null), cacheKeys = [], tmdbKey = "", documents = Object.create(null), documentKeys = [], malTitles = Object.create(null), titleKeys = [];
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
    var metaPromise = !movie && isImdb ? json("https://v3-cinemeta.strem.io/meta/series/" + id + ".json") : Promise.resolve(null);
    var rows = await armPromise;
    if(!movie && Array.isArray(rows)) {
      var eligible=rows.filter(function(row){return row && row.media!=='MOVIE' && (isImdb?row.imdb===id:String(row.themoviedb)===String(id));});
      var linked=await cloudAnimeLinkedEpisode(eligible,json,season,episode);
      if(linked)return linked;
    }
    if (!Array.isArray(rows)) return null;
    rows = rows.filter(function(r) {
      return r && positive(r.myanimelist) && (isImdb ? r.imdb === id : String(r.themoviedb) === id) &&
        (movie ? r.media === "MOVIE" && r["themoviedb-season"] == null :
          r["themoviedb-season"] != null && Number(r["themoviedb-season"]) === season);
    });
    var seen = Object.create(null);
    rows = rows.filter(function(r) { var key = r.myanimelist; if (seen[key]) return false; seen[key] = true; return true; });
    if (!rows.length || rows.length > 6) return null;
    if (movie) {
      if (rows.length !== 1) return null;
      return { mal_id: positive(rows[0].myanimelist), anilist: positive(rows[0].anilist), mal_episode: 1, episode: 1 };
    }
    if (!isImdb && /^tt\d+$/.test(rows[0].imdb || "")) {
      metaPromise = json("https://v3-cinemeta.strem.io/meta/series/" + rows[0].imdb + ".json");
    }
    var tmdbId = positive(rows[0].themoviedb), target = "", dayIndex = 0;
    var episodeUrl = tmdbKey && tmdbId ? "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "?api_key=" + encodeURIComponent(tmdbKey) : "";
    var seasonPromise = episodeUrl ? json(episodeUrl) : Promise.resolve(null);
    var datasetsPromise = Promise.all(rows.map(function(r) { return json("https://api.ani.zip/mappings?mal_id=" + r.myanimelist); }));
    var seasonData = await seasonPromise, metaData = await metaPromise;
    var videos = seasonData && Array.isArray(seasonData.episodes) ? seasonData.episodes :
      metaData && metaData.meta && Array.isArray(metaData.meta.videos) ? metaData.meta.videos : [];
    function number(v) { return Number(v.episode_number != null ? v.episode_number : v.episode != null ? v.episode : v.number); }
    function seasonOf(v) { return Number(v.season_number != null ? v.season_number : v.season); }
    function released(v) { return day(v.air_date || v.released || v.firstAired); }
    var selected = videos.find(function(v) { return seasonOf(v) === season && number(v) === episode; });
    if (!selected || !(target = released(selected))) return null;
    dayIndex = videos.filter(function(v) {
      return released(v) === target && (seasonOf(v) < season || seasonOf(v) === season && number(v) < episode);
    }).length;
    var datasets = await datasetsPromise, matches = [];
    datasets.forEach(function(data, i) {
      if (!data || !data.mappings || Number(data.mappings.mal_id) !== Number(rows[i].myanimelist) || !data.episodes) return;
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
        titles: Object.keys(titles).map(function(k) { return titles[k]; }).filter(Boolean), air_date: target });
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
      cache[key] = cloudAnimeRecoverMapping(function() { return resolve(id, season, episode, movie); }, id, movie ? "movie" : "tv", season, episode, fallbackDeadline).then(function(data) {
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


(function() {
  'use strict';
  var BASE = 'https://animenosub.to';
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var cheerio = require('cheerio-without-node-native');
  var CryptoJS = require('crypto-js');
  function log(stage, message) { console.log('[AnimeNoSub] ' + stage + ': ' + message); }
  function http(value, base) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { var u = new URL(value, base || BASE); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; }
  }
  function local(value) { var u = http(value); return u && new URL(u).origin === BASE ? u : ''; }
  function norm(value) {
    return String(value || '').toLowerCase().replace(/\benglish sub(?:bed)?\b/g, '').replace(/\((?:uncensored|tv)\)/g, '')
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ').trim();
  }
  function dub(value) { return /(?:^|[\s/()_-])(?:dub(?:bed)?|dual[ -]?audio|multi[ -]?audio)(?:$|[\s/()_-])/i.test(String(value)); }
  function requestScope(deadline) {
    return async function(url, options) {
      var left = Math.min(7500, deadline - Date.now());
      if (left <= 0) throw new Error('Request budget finished');
      var timer, controller = typeof AbortController === 'function' ? new AbortController() : null;
      var opts = Object.assign({}, options || {});
      opts.headers = Object.assign({ 'User-Agent': UA, Referer: BASE + '/' }, opts.headers || {});
      if (controller) opts.signal = controller.signal;
      try {
        return await Promise.race([
          Promise.resolve().then(function() { return fetch(url, opts); }).then(async function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' at ' + new URL(url).hostname);
            var body = await r.text();
            return { ok: true, status: r.status, text: function() { return Promise.resolve(body); },
              json: function() { return Promise.resolve().then(function() { return JSON.parse(body); }); } };
          }),
          new Promise(function(_, reject) { timer = setTimeout(function() { if (controller) controller.abort(); reject(new Error('HTTP timeout')); }, left); })
        ]);
      } finally { clearTimeout(timer); }
    };
  }
  // Data-only decoding: never evaluate downloaded player JavaScript.
  function b64word(value) {
    var s = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return CryptoJS.enc.Base64.parse(s);
  }
  function bytes(word) {
    var out = [];
    for (var i = 0; i < word.sigBytes; i++) out.push((word.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255);
    return out;
  }
  function word(data) {
    var w = [];
    for (var i = 0; i < data.length; i++) w[i >>> 2] = (w[i >>> 2] || 0) | data[i] << (24 - (i % 4) * 8);
    return CryptoJS.lib.WordArray.create(w, data.length);
  }
  function aesBlock(block, key) {
    // CBC's first block with a zero IV equals ECB. VUEO requires an explicit
    // 16-byte IV even when ECB is requested, so use its supported CBC path.
    var encrypted = CryptoJS.AES.encrypt(word(block), word(key), {
      iv: word(new Array(16).fill(0)), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding
    });
    return bytes(encrypted.ciphertext).slice(0, 16);
  }
  function xor(a, b) { return a.map(function(v, i) { return v ^ b[i]; }); }
  function multiplyGcm(x, h) {
    var z = new Array(16).fill(0), v = h.slice();
    for (var bit = 0; bit < 128; bit++) {
      if (x[bit >>> 3] & (128 >>> (bit % 8))) z = xor(z, v);
      var last = v[15] & 1;
      for (var j = 15; j > 0; j--) v[j] = (v[j] >>> 1) | ((v[j - 1] & 1) << 7);
      v[0] >>>= 1; if (last) v[0] ^= 225;
    }
    return z;
  }
  function gcmDecrypt(key, iv, payload) {
    if (![16, 24, 32].includes(key.length) || iv.length !== 12 || payload.length < 16 || payload.length > 1048576) throw new Error('Invalid AES-GCM payload');
    var cipher = payload.slice(0, -16), tag = payload.slice(-16), zero = new Array(16).fill(0);
    var h = aesBlock(zero, key), y = zero.slice(), j0 = iv.concat([0, 0, 0, 1]);
    for (var i = 0; i < cipher.length; i += 16) {
      var block = cipher.slice(i, i + 16); while (block.length < 16) block.push(0);
      y = multiplyGcm(xor(y, block), h);
    }
    var length = zero.slice(), bits = cipher.length * 8;
    for (var k = 15; k >= 8; k--) { length[k] = bits % 256; bits = Math.floor(bits / 256); }
    var expected = xor(multiplyGcm(xor(y, length), h), aesBlock(j0, key)), diff = 0;
    for (var t = 0; t < 16; t++) diff |= tag[t] ^ expected[t];
    if (diff) throw new Error('AES-GCM authentication failed');
    var counter = j0.slice(), plain = [];
    for (var offset = 0; offset < cipher.length; offset += 16) {
      for (var c = 15; c >= 12; c--) { counter[c] = (counter[c] + 1) & 255; if (counter[c]) break; }
      var mask = aesBlock(counter, key);
      for (var p = 0; p < 16 && offset + p < cipher.length; p++) plain.push(cipher[offset + p] ^ mask[p]);
    }
    return CryptoJS.enc.Utf8.stringify(word(plain));
  }
  function decodeByse(playback) {
    if (!playback || !Array.isArray(playback.key_parts)) throw new Error('Byse playback data missing');
    var parts = playback.key_parts, version = String(playback.version || '').trim(), n = Number(version);
    // Current Byse player selects complementary parts from the 30-part table.
    if (/^\d+$/.test(version) && n >= 1 && n <= 20 && n <= parts.length && 31 - n <= parts.length) parts = [parts[n - 1], parts[30 - n]];
    var key = [];
    parts.forEach(function(p) { key = key.concat(bytes(b64word(p))); });
    return JSON.parse(gcmDecrypt(key, bytes(b64word(playback.iv)), bytes(b64word(playback.payload))));
  }
  function decodeMega(payload) {
    var key = bytes(CryptoJS.enc.Utf8.parse('i?LMTAx0Q6,:}50U'));
    while (key.length < 32) key.push(0);
    var plain = CryptoJS.AES.decrypt({ ciphertext: b64word(payload.enc) }, word(key), {
      iv: CryptoJS.enc.Utf8.parse("W0;27ToaUpl_P%'c"), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
    var source = JSON.parse(plain.toString(CryptoJS.enc.Utf8));
    if (!source || typeof source.file !== 'string') throw new Error('MegaPlay decrypted source missing');
    var path = /\/([a-f0-9]{32})\/([a-f0-9]{32})\//i.exec(source.file);
    if (path && !/[?&]token=/.test(source.file)) {
      var message = (Math.floor(Date.now() / 1000) + 90) + '|' + path[1].toLowerCase() + '/' + path[2].toLowerCase();
      function url64(w) { return CryptoJS.enc.Base64.stringify(w).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
      var token = url64(CryptoJS.enc.Utf8.parse(message)) + '.' + url64(CryptoJS.HmacSHA256(message, 'MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s'));
      source.file += (source.file.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(token);
    }
    return source;
  }
  function jsString(value) {
    return value.replace(/\\x([0-9a-f]{2})/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\u([0-9a-f]{4})/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\([\\/'"])/g, '$1').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
  }
  function unpackPlayer(html) {
    var result = String(html), pattern = /\}\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\.split\(\s*['"]\|['"]\s*\)/g;
    for (var pass = 0; pass < 3; pass++) {
      var found = false, extra = [], match; pattern.lastIndex = 0;
      while ((match = pattern.exec(result))) {
        var radix = Number(match[3]), count = Number(match[4]), symbols = jsString(match[6]).split('|');
        if (radix < 2 || radix > 62 || count > 20000 || match[2].length > 1048576) continue;
        var alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        function code(n) { return n < radix ? alphabet[n] : code(Math.floor(n / radix)) + alphabet[n % radix]; }
        var map = Object.create(null);
        for (var i = 0; i < count; i++) if (symbols[i]) map[code(i)] = symbols[i];
        extra.push(jsString(match[2]).replace(/\b[0-9A-Za-z]+\b/g, function(k) { return map[k] || k; })); found = true;
      }
      if (!found) break;
      result = extra.join('\n');
    }
    return html + '\n' + result;
  }
  function jwData(html, base) {
    var script = unpackPlayer(html), sources = [], tracks = [], seen = Object.create(null), match;
    var arrays = /(?:sources|playlist|links)\s*[:=]\s*\[([\s\S]*?)\]/g;
    while ((match = arrays.exec(script))) {
      var objects = match[1].match(/\{[^{}]*\}/g) || [];
      objects.forEach(function(object) {
        var f = /(?:["']?(?:file|src|url)["']?)\s*:\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1/.exec(object);
        if (!f) return;
        var url = http(jsString(f[2]), base), label = /label\s*:\s*['"]([^'"]+)['"]/.exec(object);
        if (!/\.m3u8(?:[?#]|$)/i.test(url) || seen[url]) return;
        seen[url] = true; sources.push({ file: url, label: label ? label[1] : '' });
      });
    }
    // StreamWish mirrors can expose HLS through the links.hls2/hls4 fields.
    var links = /["']hls[24]["']\s*:\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1/g;
    while ((match = links.exec(script))) {
      var url = http(jsString(match[2]), base);
      if (/\.m3u8(?:[?#]|$)/i.test(url) && !seen[url]) { seen[url] = true; sources.push({ file: url, label: '' }); }
    }
    var trackObjects = script.match(/\{[^{}]*kind\s*:\s*['"](?:captions|subtitles)['"][^{}]*\}/g) || [];
    trackObjects.forEach(function(object) {
      var f = /file\s*:\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1/.exec(object), l = /label\s*:\s*['"]([^'"]+)['"]/.exec(object);
      if (f) tracks.push({ url: http(jsString(f[2]), base), label: l ? l[1] : '', language: '' });
    });
    return { sources: sources, tracks: tracks };
  }

  async function getStreams(id, type, season, episode) {
    type = type === 'series' ? 'tv' : type;
    if (!['movie', 'tv'].includes(type) || !/^(?:tt\d+|\d+)$/.test(String(id))) return [];
    if (type === 'tv' && (!Number.isInteger(Number(season)) || Number(season) < 0 || !Number.isInteger(Number(episode)) || Number(episode) < 1)) return [];
    var deadline = Date.now() + 18500, streams = [], closed = false, timer;
    var req = requestScope(deadline), mapping = cloudbankAnimeMappingFetch(req, deadline);
    async function text(url, options) { return (await req(url, options)).text(); }
    async function json(url, options) { return (await req(url, options)).json(); }
    async function work() {
      var context = typeof globalThis !== 'undefined' && globalThis.VUEO_DISCOVERY_CONTEXT;
      var tmdb = context && context.tmdb || {};
      if (tmdb.original_language && tmdb.original_language !== 'ja') return;
      // Use the existing strict mapping helper; no title-based season guessing.
      var route = type === 'movie' ? 'https://arm.haglund.dev/api/v2/tmdb?id=' + encodeURIComponent(id) :
        'https://id-mapping-api-malid.hf.space/api/resolve?id=' + encodeURIComponent(id) + '&s=' + season + '&e=' + episode;
      var response = await mapping(route), mapped = response.ok ? await response.json() : null;
      if (!mapped || !mapped.mal_id) { log('MAPPING', 'No verified anime episode'); return; }
      var data = await json('https://api.ani.zip/mappings?mal_id=' + mapped.mal_id);
      if (!data.mappings || Number(data.mappings.mal_id) !== mapped.mal_id) return;
      var ani = await json('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: 'query($mal:Int){Media(idMal:$mal,type:ANIME){idMal countryOfOrigin format title{romaji english native}}}', variables: { mal: mapped.mal_id } }) });
      var media = ani.data && ani.data.Media;
      if (!media || media.idMal !== mapped.mal_id || media.countryOfOrigin !== 'JP' || type === 'movie' && media.format !== 'MOVIE') return;
      var titles = Object.keys(data.titles || {}).map(function(k) { return data.titles[k]; }).concat(Object.values(media.title || {})).filter(Boolean);
      var aliases = Array.from(new Set(titles.map(norm).filter(Boolean)));
      var queries = Array.from(new Set([media.title.romaji, media.title.english].filter(Boolean))).slice(0, 2);
      if (!queries.length) return;
      log('MAPPING', 'MAL ' + mapped.mal_id + ', episode ' + mapped.episode);
      var results = await Promise.all(queries.map(async function(query) {
        try {
          var result = await json(BASE + '/wp-admin/admin-ajax.php', { method: 'POST', headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: BASE },
            body: 'action=ts_ac_do_search&ts_ac_query=' + encodeURIComponent(query) });
          return result.anime && result.anime[0] && result.anime[0].all || [];
        } catch (e) { log('SEARCH', e.message); return []; }
      }));
      var candidates = [], seen = Object.create(null);
      results.flat().forEach(function(item) {
        var url = local(item.post_link);
        if (!url || !/^\/anime\/[^/]+\/$/.test(new URL(url).pathname) || seen[url] || dub(item.post_title + ' ' + url) || !/^sub$/i.test(item.post_sub || '')) return;
        if (type === 'movie' && !/^movie$/i.test(item.post_type || '') || type === 'tv' && /^movie$/i.test(item.post_type || '')) return;
        if (!aliases.includes(norm(item.post_title))) return;
        seen[url] = true; candidates.push(item);
      });
      if (candidates.length !== 1) { log('SEARCH', 'Exact sub title matches: ' + candidates.length + '; skipped ambiguity'); return; }
      var selected = candidates[0], seriesUrl = local(selected.post_link);
      var $series = cheerio.load(await text(seriesUrl));
      var mainTitle = $series('meta[property="og:title"]').attr('content') || $series('title').text();
      if (dub(mainTitle)) return;
      var episodes = [];
      $series('li[data-index]').each(function(_, element) {
        var li = $series(element), label = li.find('.epl-num').text().trim();
        var n = /^movie$/i.test(label) ? 1 : /^\d+$/.test(label) ? Number(label) : 0;
        var url = local(li.find('a[href]').first().attr('href'));
        if (n === Number(mapped.episode) && url && !dub(url) && !episodes.includes(url)) episodes.push(url);
      });
      if (episodes.length !== 1) { log('EPISODE', 'Exact episode unavailable or ambiguous'); return; }
      var epUrl = episodes[0], $ep = cheerio.load(await text(epUrl));
      var epTitle = $ep('meta[property="og:title"]').attr('content') || $ep('title').text();
      if (dub(epTitle)) return;
      var embeds = [], embedSeen = Object.create(null);
      $ep('select option[data-index]').each(function(_, element) {
        var option = $ep(element), label = option.text().trim();
        if (dub(label)) return;
        try {
          var html = CryptoJS.enc.Latin1.stringify(CryptoJS.enc.Base64.parse(option.attr('value') || ''));
          var frame = cheerio.load(html)('iframe').attr('src'), url = http(frame, epUrl);
          if (!url || dub(new URL(url).pathname) || embedSeen[url]) return;
          embedSeen[url] = true; embeds.push({ url: url, label: label });
        } catch (_) {}
      });
      log('SERVERS', embeds.length + ' sub servers');
      await Promise.all(embeds.slice(0, 6).map(async function(embed) {
        try {
          // AnimeNoSub direct.php is a wrapper, not the final video host.
          // Read its iframe/encoded URL without evaluating website JavaScript.
          var embedUrl = embed.url, embedReferer = epUrl, wrapperSeen = Object.create(null);
          for (var hop = 0; hop < 2 && new URL(embedUrl).origin === BASE; hop++) {
            var wrapper = new URL(embedUrl);
            if (wrapper.pathname !== '/direct.php' || !/\/sub(?:[&#]|$)/i.test(wrapper.search) || wrapperSeen[embedUrl]) {
              log('SERVER', 'Invalid or repeated Sub wrapper: ' + wrapper.pathname); return;
            }
            wrapperSeen[embedUrl] = true;
            var wrapperHtml = await text(embedUrl, { headers: { Referer: embedReferer } });
            var next = http(cheerio.load(wrapperHtml)('iframe[src]').first().attr('src'), embedUrl);
            if (!next) {
              var encoded = /\biframeUrl\s*=\s*decodeUrl\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/.exec(wrapperHtml);
              if (encoded) next = http(CryptoJS.enc.Latin1.stringify(CryptoJS.enc.Base64.parse(encoded[1].split('').reverse().join(''))), embedUrl);
            }
            if (!next || dub(new URL(next).pathname)) { log('SERVER', 'Sub wrapper has no usable player URL'); return; }
            log('WRAPPER', wrapper.pathname + ' -> ' + new URL(next).hostname + new URL(next).pathname);
            embedReferer = embedUrl; embedUrl = next;
          }
          embed = { url: embedUrl, label: embed.label };
          var u = new URL(embed.url), host = u.hostname, headers = { Referer: u.origin + '/', Origin: u.origin, 'User-Agent': UA };
          var sources = [], tracks = [], server;
          if (/^([a-z0-9-]+\.)?upn\.one$/i.test(host)) {
            server = 'Nova';
            var code = /^#([a-z0-9]+)$/i.exec(u.hash);
            if (!code) return;
            var hex = (await text('https://nova.upn.one/api/v1/video?id=' + code[1] + '&w=1920&h=1080&r=', { headers: { Referer: 'https://nova.upn.one/' } })).trim();
            if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 32) return;
            var decrypted = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Hex.parse(hex) }, CryptoJS.enc.Hex.parse('6b69656d7469656e6d75613931316361'),
              { iv: CryptoJS.enc.Hex.parse('313233343536373839306f6975797472'), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
            var nova = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
            sources = [{ file: nova.cf || nova.source }]; headers.Referer = 'https://nova.upn.one/'; headers.Origin = 'https://nova.upn.one';
          } else if (/^(?:www\.)?vidmoly\.(net|biz|to)$/i.test(host)) {
            server = 'Vidmoly';
            var html = await text(embed.url), m = /sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i.exec(html);
            if (m) sources = [{ file: m[1] }];
            headers.Referer = 'https://vidmoly.biz/'; headers.Origin = 'https://vidmoly.biz';
          } else if (/^megaplay\.[a-z]+$/i.test(host) && /^\/stream\//.test(u.pathname)) {
            server = 'MegaPlay';
            var html = await text(embed.url, { headers: { Referer: embedReferer } }), page = cheerio.load(html), fileId = page('[data-id]').first().attr('data-id');
            if (!fileId || !/^[a-z0-9_-]+$/i.test(fileId)) { log('MegaPlay', 'Player unavailable'); return; }
            var payload = await json(u.origin + '/stream/getSources?id=' + encodeURIComponent(fileId) + '&platform=OTHER', {
              headers: { Referer: embed.url, 'X-Requested-With': 'XMLHttpRequest' } });
            if (payload.enc) { sources = [decodeMega(payload)]; log('MegaPlay', 'AES-CBC source decoded'); }
            else if (payload.encrypted) { throw new Error('Unknown MegaPlay encrypted format'); }
            else sources = Array.isArray(payload.sources) ? payload.sources : payload.sources && payload.sources.file ? [payload.sources] : [];
            tracks = Array.isArray(payload.tracks) ? payload.tracks.filter(function(t) { return /^(captions|subtitles)$/.test(t.kind); }).map(function(t) {
              return { url: http(t.file, embed.url), language: t.srclang || t.language || '', label: t.label || '' };
            }) : [];
          } else if (/^(?:www\.)?(?:vtbe|vtube|vtplay)\.(?:to|net|network)$/i.test(host) || /^(?:vtube|vtbe)$/i.test(embed.label)) {
            server = 'Vtube';
            var html = await text(embed.url, { headers: { Referer: u.origin + '/' } });
            var player = jwData(html, embed.url); sources = player.sources; tracks = player.tracks;
          } else if (/filemoon|filesim|bysesayeveum|byse\./i.test(host) || /filemoon/i.test(embed.label)) {
            server = 'FileMoon';
            var html = await text(embed.url, { headers: { Referer: embedReferer } });
            if (/Byse Frontend|videoPagesBundle|id=["']root["']/.test(html)) {
              var code = /^\/(?:e|d)\/([a-z0-9]+)\/?$/i.exec(u.pathname);
              if (!code) throw new Error('Byse video code missing');
              var meta = await json(u.origin + '/api/videos/' + encodeURIComponent(code[1]) + '/', {
                headers: { Referer: embed.url, 'X-Requested-With': 'XMLHttpRequest' } });
              if (meta.error || !meta.playback) throw new Error('Byse playback unavailable');
              var decoded = decodeByse(meta.playback);
              sources = Array.isArray(decoded.sources) ? decoded.sources.map(function(s) { return { file: s.url || s.file, label: s.label || (s.height ? s.height + 'p' : '') }; }) : [];
              tracks = (Array.isArray(decoded.tracks) ? decoded.tracks : []).map(function(t) { return { url: http(t.url || t.file, embed.url), language: t.language || t.srclang || '', label: t.label || '' }; });
              log('FileMoon', 'Byse AES-GCM decoded: ' + sources.length + ' sources');
            } else {
              var child = http(cheerio.load(html)('iframe[src]').first().attr('src'), embed.url);
              if (child && child !== embed.url && !dub(new URL(child).pathname)) {
                html = await text(child, { headers: { Referer: embed.url } });
                var childOrigin = new URL(child).origin; headers.Referer = childOrigin + '/'; headers.Origin = childOrigin;
              }
              var player = jwData(html, child || embed.url); sources = player.sources; tracks = player.tracks;
            }
          } else if (/streamwish|sfastwish|flaswish|embedwish|hlswish/i.test(host) || /streamwish/i.test(embed.label)) {
            server = 'StreamWish';
            var html = await text(embed.url, { headers: { Referer: embedReferer } });
            if (/file is no longer available|file (?:was |has been )?deleted|file not found/i.test(html)) throw new Error('Upstream file deleted or expired');
            var player = jwData(html, embed.url); sources = player.sources; tracks = player.tracks;
          } else { log('SERVER', 'Unsupported host: ' + host); return; }
          if (!sources.length) { log(server, 'Player parsed but no HLS sources found'); return; }

          var valid = sources.map(function(source) { return { url: http(source.file || source.url, embed.url), label: source.label || '' }; }).filter(function(source) { return /\.m3u8(?:[?#]|$)/i.test(source.url); });
          // Return each server's master first. Keep the original media headers and do not emit embed pages.
          var resolved = [], rejectedAudio = false;
          valid.sort(function(a, b) { return Number(/master\.m3u8/i.test(b.url)) - Number(/master\.m3u8/i.test(a.url)); });
          for (var sourceIndex = 0; sourceIndex < valid.length; sourceIndex++) {
            if (closed) break;
            var source = valid[sourceIndex];
            try {
              var manifest = await text(source.url, { headers: headers });
              if (!/^\s*#EXTM3U/.test(manifest)) { log(server, 'Source returned non-HLS content'); continue; }
              var audio = manifest.split(/\r?\n/).filter(function(line) { return /^#EXT-X-MEDIA:.*TYPE=AUDIO/.test(line); });
              if (audio.some(function(line) { var lang = /LANGUAGE="([^"]+)"/.exec(line); return !lang || !/^(ja|jp|jpn)$/i.test(lang[1]); })) {
                rejectedAudio = true; break;
              }
              var item = { source: source, master: /#EXT-X-STREAM-INF:/.test(manifest) };
              if (item.master) { resolved = [item]; log(server, 'Master HLS validated'); break; }
              resolved.push(item);
            } catch (e) { log(server, e.message); }
          }
          if (rejectedAudio) { log(server, 'Foreign or unidentified audio group; skipped server'); return; }
          if (!resolved.length) log(server, 'No validated HLS sources');
          resolved.forEach(function(item) {
            if (closed || streams.some(function(s) { return s.url === item.source.url && s.server === server; })) return;
            var quality = item.master ? 'Auto' : /^\d{3,4}p$/.test(item.source.label) ? item.source.label : 'Unknown';
            streams.push({ sourceTitle:selected.post_title,sourceEpisode:mapped.episode,name: 'AnimeNoSub · ' + server + ' · ' + quality, title: selected.post_title + '\nJapanese Audio · Sub\n' + server + ' · ' + quality,
              url: item.source.url, quality: quality, type: 'hls', audioLanguage: 'ja', audioType: 'sub', server: server,
              headers: headers, subtitles: tracks });
          });
        } catch (e) { log('SERVER', (server || embed.label || 'Unknown') + ': ' + e.message); }
      }));
    }
    try {
      await Promise.race([work().catch(function(e) { log('ERROR', e.message); }), new Promise(function(resolve) { timer = setTimeout(resolve, 18500); })]);
    } finally { closed = true; clearTimeout(timer); }
    log('RESULT', streams.length + ' validated sub streams');
    return cloudAnimeFilterStreams(streams, 'animenosub');
  }
  module.exports = { getStreams: getStreams };
  if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
  if (typeof global !== 'undefined') global.getStreams = getStreams;
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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "animenosub");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;

/* CLOUDANIME_SOURCE_DETAILS_V1: display only; no network requests. */
function cloudAnimeSourceDetails(streams, providerName) {
  if (!Array.isArray(streams)) return streams;
  function clean(value) { return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
  return streams.map(function(stream) {
    if (!stream || typeof stream !== 'object') return stream;
    var old = clean(stream.title), title = clean(stream.sourceTitle || stream.animeTitle);
    if (!title && !/^(?:MAL|AniList|Episode|Japanese Sub)\b/i.test(old)) {
      title = clean(String(stream.title || '').split(/\r?\n/)[0]).split(/\s*[•·]\s*/)[0].replace(/\s*-\s*Episode\s+\d+.*$/i, '').trim();
      if (/^(?:Anime|Kurage|CloudAnime)$/i.test(title)) title = '';
    }
    var match = /\b(?:Episode\s+|S\d+E)(\d+)\b/i.exec(old);
    var ep = Number(stream.sourceEpisode || match && match[1]);
    var server = clean(stream.serverName || stream.server).replace(/\s+(?:Hardsub|Softsub)$/i, '');
    var quality = clean(String(stream.quality || ''));
    if (/^(?:unknown|undefined|null)$/i.test(quality)) quality = '';
    var audio = clean(stream.audioLanguage || stream.audio);
    audio = /^(?:ja|jp|jpn|japanese)$/i.test(audio) ? 'Japanese Audio' : /^(?:en|eng|english)$/i.test(audio) ? 'English Audio' : audio ? audio + ' Audio' : '';
    var tracks = Array.isArray(stream.subtitles) ? stream.subtitles.filter(function(t) { return t && (t.url || t.file || t.src); }) : [];
    var languages = [];
    tracks.forEach(function(t) {
      var label = clean(t.language || t.lang || t.name || t.label);
      label = /^(?:en|eng|english)$/i.test(label) ? 'English' : /^(?:ms|may|malay)$/i.test(label) ? 'Malay' : /^(?:id|ind|indo|indonesian)$/i.test(label) ? 'Indonesian' : label;
      if (label && languages.indexOf(label) < 0) languages.push(label);
    });
    var subType = clean(stream.subtitleType).toLowerCase();
    var sub = subType === 'hardsub' ? 'Hardsub' : subType === 'softsub' || tracks.length ? 'Softsub' : /\bsub\b/i.test(stream.audioType || '') ? 'Sub' : '';
    if (languages.length && sub !== 'Hardsub') sub += ': ' + languages.slice(0,2).join(', ') + (languages.length > 2 ? ' +' + (languages.length-2) : '');
    var lines = [title, [server, quality].filter(Boolean).join(' • '), [Number.isInteger(ep) && ep > 0 ? 'EP ' + ep : '', audio, sub].filter(Boolean).join(' • ')].filter(Boolean);
    return Object.assign({}, stream, { name: providerName, title: lines.join('\n'), sourceTitle: title, sourceEpisode: Number.isInteger(ep) && ep > 0 ? ep : undefined });
  });
}
function cloudAnimeInstallSourceDetails(provider, providerName) {
  var original = provider.getStreams;
  return Object.assign({}, provider, {getStreams:function() {
    var receiver=this,args=arguments;
    return Promise.resolve().then(function(){return original.apply(receiver,args);}).then(function(streams){return cloudAnimeSourceDetails(streams,providerName);});
  }});
}
/* CLOUDANIME_SOURCE_DETAILS_END */

module.exports = cloudAnimeInstallSourceDetails(module.exports, "AnimeNoSub");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
