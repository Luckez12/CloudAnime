/* Shared episode resolver embedded in each standalone provider. */
async function cloudAnimeLinkedEpisode(rows, read, season, episode) {
  function positive(v) { return Number.isInteger(Number(v)) && Number(v)>0; }
  function result(row, data, ep, method) {
    var titles=Object.values(data.titles||{}).filter(function(v){return typeof v==='string'&&v.trim();});
    return {id:Number(row.myanimelist),ep:ep,mal_id:Number(row.myanimelist),
      anilist:Number(data.mappings.anilist_id||row.anilist)||null,episode:ep,mal_episode:ep,
      anime_title:(data.titles||{}).en||(data.titles||{})['x-jat']||titles[0]||'',titles:titles,
      expectedEpisodes:Number(data.episodeCount)||null,animeplanet_slug:row['anime-planet']||'',
      sourceSeason:Number(row['themoviedb-season']),sourceYear:String((data.episodes||{})['1']&&((data.episodes||{})['1'].airDate||(data.episodes||{})['1'].airdate)||'').slice(0,4),
      method:method,mapping_method:method};
  }
  function unique(hits) {
    var found=hits.filter(function(h,i,a){return a.findIndex(function(x){return x.id===h.id&&x.ep===h.ep;})===i;});
    if(found.length>1)throw Error('Conflicting episode mapping candidates');
    return found[0]||null;
  }
  function day(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(value))return null;
    var s=value.slice(0,10),n=Date.parse(s+'T00:00:00Z');
    return isFinite(n)&&new Date(n).toISOString().slice(0,10)===s?n/86400000:null;
  }
  rows=Array.isArray(rows)?rows.filter(Boolean):[];
  var anchors=rows.filter(function(r){return r['themoviedb-season']!=null&&Number(r['themoviedb-season'])===season&&positive(r.thetvdb);});
  if(!anchors.length)return null;
  var candidates=rows.filter(function(r){return positive(r.myanimelist)&&r['themoviedb-season']!=null&&
    (season===0?Number(r['themoviedb-season'])===0:Number(r['themoviedb-season'])>0)&&
    anchors.some(function(a){return String(a.themoviedb)===String(r.themoviedb);});
  }).filter(function(r,i,a){return a.findIndex(function(x){return Number(x.myanimelist)===Number(r.myanimelist);})===i;});
  if(candidates.length>12)throw Error('Episode mapping exceeds candidate budget');
  var parts=[],failed=[],matches=[],outside=false;
  for(var offset=0;offset<candidates.length;offset+=4){
    var batch=candidates.slice(offset,offset+4);
    var datasets=await Promise.all(batch.map(function(r){return Promise.resolve().then(function(){
      return read('https://api.ani.zip/mappings?mal_id='+Number(r.myanimelist));
    }).then(function(data){return {data:data};},function(){return {error:true};});}));
    batch.forEach(function(row,index){
      if(datasets[index].error){failed.push(row);return;}
      var data=datasets[index].data,m=data&&data.mappings;
      if(!m||Number(m.mal_id)!==Number(row.myanimelist))throw Error('Conflicting episode mapping identity: MAL');
      var sameTmdb=positive(m.themoviedb_id)&&String(m.themoviedb_id)===String(row.themoviedb);
      var sameTvdb=positive(row.thetvdb)&&Number(m.thetvdb_id)===Number(row.thetvdb);
      var sameAnimePair=positive(row.anilist)&&Number(m.anilist_id)===Number(row.anilist);
      if(positive(row.thetvdb)&&positive(m.thetvdb_id)&&!sameTvdb&&!sameAnimePair)throw Error('Conflicting episode mapping identity: TVDB');
      // Separate anime parts may have a different or missing TMDB ID. An exact MAL
      // response plus the same TVDB show or exact AniList ID independently confirms
      // the ARM-linked anime part, even when a part has its own catalogue show IDs.
      if(!sameTmdb&&!sameTvdb&&!sameAnimePair)throw Error('Conflicting episode mapping identity: no shared series ID');
      var part={row:row,data:data,tvdb:positive(m.thetvdb_id)?Number(m.thetvdb_id):null};parts.push(part);
      if(Number(row['themoviedb-season'])===season&&positive(data.episodeCount)&&episode>Number(data.episodeCount))outside=true;
      Object.values(data.episodes||{}).forEach(function(e){
        if(e&&sameTvdb&&part.tvdb&&anchors.some(function(a){return Number(a.thetvdb)===part.tvdb&&a['thetvdb-season']!=null&&Number(a['thetvdb-season'])===season;})&&Number(e.tvdbShowId)===part.tvdb&&e.seasonNumber!=null&&e.episodeNumber!=null&&
          Number(e.seasonNumber)===season&&Number(e.episodeNumber)===episode&&positive(e.episode))
          matches.push(result(row,data,Number(e.episode),'linked exact episode identity'));
      });
    });
  }
  var selected=unique(matches);
  if(selected)return selected;
  // Only a validated prefix through the requested episode is required; an
  // unfinished later part must not invalidate earlier published episodes.
  if(outside&&season===1&&!failed.length){
    var ranges=parts.map(function(p){
      var entries=Object.values(p.data.episodes||{}).filter(function(e){return e&&positive(e.episode);}).sort(function(a,b){return Number(a.episode)-Number(b.episode);});
      if(!entries.length||!p.tvdb)return null;
      var start=Number(entries[0].absoluteEpisodeNumber);
      if(!positive(start)||!entries.every(function(e,i){return Number(e.episode)===i+1&&Number(e.tvdbShowId)===p.tvdb&&Number(e.absoluteEpisodeNumber)===start+i&&Number(e.seasonNumber)>0;}))return null;
      return {part:p,start:start,end:start+entries.length-1,entries:entries,complete:entries.length===Number(p.data.episodeCount)};
    }).filter(Boolean).sort(function(a,b){return a.start-b.start;});
    var next=1,hits=[];
    for(var i=0;i<ranges.length;i++){
      var range=ranges[i];if(range.start!==next)break;
      if(episode<=range.end){hits.push(result(range.part.row,range.part.data,Number(range.entries[episode-range.start].episode),'verified continuous absolute episode mapping'));break;}
      if(!range.complete)break;next=range.end+1;
    }
    // Overlapping published ranges are ambiguous, even beyond an otherwise valid prefix.
    if(hits.length&&ranges.filter(function(r){return episode>=r.start&&episode<=r.end;}).length===1)return hits[0];
  }
  // Date fallback is identity matching, never an availability/release-date gate.
  // Use shared season metadata only after exact/absolute episode evidence fails.
  var tmdbIds=anchors.map(function(r){return String(r.themoviedb);}).filter(function(id,i,a){return /^\d+$/.test(id)&&a.indexOf(id)===i;});
  var target=null;
  if(tmdbIds.length===1){
    var tmdbId=tmdbIds[0],g=typeof globalThis!=='undefined'?globalThis:{},context=g.VUEO_DISCOVERY_CONTEXT;
    if(typeof context==='string'){try{context=JSON.parse(context);}catch(_){context=null;}}
    function requested(data){
      if(!data||typeof data!=='object')return null;
      var list=Array.isArray(data.episodes)?data.episodes:[];
      var e=list.find(function(e){return e&&Number(e.episode_number)===episode&&(e.season_number!=null?Number(e.season_number)===season:Number(data.season_number)===season);});
      return e&&day(e.air_date)!=null?e:null;
    }
    var root=context&&(context.tmdb||context),identity=context&&(context.tmdbId||root&&root.id);
    if(String(identity)===tmdbId){
      target=requested(context)||requested(root);
      if(!target&&Array.isArray(root&&root.seasons))target=requested(root.seasons.find(function(s){return s&&Number(s.season_number)===season;}));
    }
    if(!target&&typeof g.vueoDiscoveryContext==='function'){
      var dateTimer;
      try{var supplied=await Promise.race([g.vueoDiscoveryContext('https://api.themoviedb.org/3/tv/'+tmdbId+'/season/'+season),new Promise(function(_,reject){dateTimer=setTimeout(function(){reject(Error('Date fallback metadata budget exhausted'));},2000);})]);
        if(typeof supplied==='string')supplied=JSON.parse(supplied);
        if(supplied&&(!supplied.tmdbId||String(supplied.tmdbId)===tmdbId))target=requested(supplied.tmdb||supplied);
      }catch(_){}finally{clearTimeout(dateTimer);}
    }
  }
  if(target){
    var targetDay=day(target.air_date),dated=[];
    parts.forEach(function(p){Object.values(p.data.episodes||{}).forEach(function(e){
      if(!e||!positive(e.episode)||(season>0&&Number(e.seasonNumber)===0)||(season===0&&e.seasonNumber!=null&&Number(e.seasonNumber)!==0))return;
      if(e.tvdbShowId!=null&&p.tvdb&&Number(e.tvdbShowId)!==p.tvdb)return;
      var d=day(e.airDate||e.airdate||e.airDateUtc);
      if(d!=null&&Math.abs(d-targetDay)<=1)dated.push(result(p.row,p.data,Number(e.episode),'verified episode date fallback'));
    });});
    selected=unique(dated);
    if(selected&&!failed.length)return selected;
  }
  if(failed.length)throw Error('Episode mapping metadata unavailable; no verified target');
  if(outside)throw Error('No verified episode mapping outside original anime range');
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
    if(/conflict|disagree|mismatch|overlap|no verified episode mapping|episode mapping metadata unavailable/i.test(String(error&&error.message)))throw error;
  }
  return cloudAnimeTitleFallback(id,type,season,episode,deadline);
}
/* CLOUDANIME_TITLE_FALLBACK_END */

/* CloudAnime AnimeOnsen v1.0.1 — standalone runtime provider. */
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
  var SITE = 'https://www.animeonsen.xyz';
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
  var session = null;
  function log(stage, text) { console.log('[AnimeOnsen] ' + stage + ': ' + text); }
  function url(value, base) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { var u = new URL(value, base || SITE); return u.protocol === 'https:' ? u.href : ''; } catch (_) { return ''; }
  }
  function attr(tag, name) {
    var match = new RegExp('\\b' + name + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(tag);
    return match ? match[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
  }
  function meta(html, name) {
    var tags = html.match(/<meta\b[^>]*>/gi) || [];
    for (var i=0;i<tags.length;i++) if (attr(tags[i], 'name').toLowerCase() === name) return attr(tags[i], 'content');
    return '';
  }
  function token(cookie) {
    var encoded = decodeURIComponent(cookie), alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', bits=0, n=0, out='';
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length > 8192) throw new Error('Invalid anonymous session encoding');
    for (var i=0;i<encoded.length;i++) {
      if (encoded[i] === '=') break;
      bits=(bits<<6)|alphabet.indexOf(encoded[i]); n+=6;
      if (n>=8) { n-=8; var c=((bits>>n)&255)+1; if(c<32||c>126) throw new Error('Invalid anonymous session token'); out+=String.fromCharCode(c); }
    }
    if (!out) throw new Error('Empty anonymous session token');
    return out;
  }
  // Onsen's /v4/subtitles/... endpoint returns ASS without a filename suffix.
  // An absent MIME makes the app fall back to SubRip, which cannot parse ASS.
  function subtitleMime(address) {
    var path = new URL(address).pathname.toLowerCase();
    if (/\.vtt$/.test(path)) return 'text/vtt';
    if (/\.srt$/.test(path)) return 'application/x-subrip';
    if (/\.(ttml|xml)$/.test(path)) return 'application/ttml+xml';
    return 'text/x-ssa';
  }
  function requestScope(deadline) {
    return async function(address, options) {
      var left=Math.min(7000,deadline-Date.now()); if(left<=0)throw new Error('Request budget finished');
      var timer,controller=typeof AbortController==='function'?new AbortController():null;
      var opts=Object.assign({},options||{});opts.headers=Object.assign({'User-Agent':UA,Referer:SITE+'/',Origin:SITE,Accept:'application/json, text/plain, */*'},opts.headers||{});
      if(controller)opts.signal=controller.signal;
      try { return await Promise.race([
        Promise.resolve().then(function(){return fetch(address,opts);}).then(async function(r){
          var text=await r.text(); if(text.length>2500000)throw new Error('Upstream response too large');
          return {status:r.status,ok:r.ok,headers:r.headers,body:text};
        }),new Promise(function(_,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(new Error('HTTP timeout at '+new URL(address).hostname));},left);})
      ]); } finally {clearTimeout(timer);}
    };
  }
  async function bootstrap(req, force) {
    if(!force&&session&&session.expires>Date.now())return session;
    session=null;
    var r=await req(SITE+'/',{headers:{Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language':'en-US,en;q=0.9'}});
    if(!r.ok)throw new Error('Homepage HTTP '+r.status+(r.status===403?' (session blocked / browser verification)':''));
    var raw=r.headers&&typeof r.headers.get==='function'?r.headers.get('set-cookie')||'':'';
    var cookie=/(?:^|[,;]\s*)ao\.session=([^;\s,]+)/.exec(raw);
    var api=url(meta(r.body,'ao-api-origin')), search=url(meta(r.body,'ao-search-origin')), key=meta(r.body,'ao-search-token');
    if(!cookie||!api||!search||!key)throw new Error('Anonymous session bootstrap fields missing');
    session={token:token(cookie[1]),api:new URL(api).origin,search:new URL(search).origin,searchToken:key,expires:Date.now()+240000};
    log('SESSION','Anonymous API session ready');return session;
  }
  async function getStreams(id,type,season,episode) {
    type=type==='series'?'tv':type;
    if(!['movie','tv'].includes(type)||!/^(?:tt\d+|\d+)$/.test(String(id)))return [];
    if(type==='tv'&&(!Number.isInteger(Number(season))||Number(season)<0||!Number.isInteger(Number(episode))||Number(episode)<1))return [];
    var deadline=Date.now()+26500,req=requestScope(deadline),closed=false,timer,streams=[];
    var mapping=cloudbankAnimeMappingFetch(async function(address,options){var r=await req(address,options);return {ok:r.ok,json:async function(){return JSON.parse(r.body);}};}, deadline);
    async function json(address,options){var r=await req(address,options);if(!r.ok)throw new Error('HTTP '+r.status+' at '+new URL(address).hostname);return JSON.parse(r.body);}
    async function api(path,retry) {
      var s=await bootstrap(req,false),r=await req(s.api+path,{headers:{Authorization:'Bearer '+s.token}});
      if((r.status===401||r.status===403)&&retry!==false){await bootstrap(req,true);return api(path,false);}
      if(!r.ok)throw new Error('API HTTP '+r.status);return JSON.parse(r.body);
    }
    async function work(){
      var route=type==='movie'?'https://arm.haglund.dev/api/v2/tmdb?id='+encodeURIComponent(id):'https://id-mapping-api-malid.hf.space/api/resolve?id='+encodeURIComponent(id)+'&s='+season+'&e='+episode;
      var mappedResponse=await mapping(route),mapped=mappedResponse.ok?await mappedResponse.json():null;
      if(!mapped||!Number.isInteger(mapped.mal_id)||!Number.isInteger(mapped.episode)||mapped.mal_id<1||mapped.episode<1){log('MAPPING','No verified anime episode');return;}
      log('MAPPING','MAL '+mapped.mal_id+', episode '+mapped.episode);
      var info=await json('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($mal:Int){Media(idMal:$mal,type:ANIME){id idMal countryOfOrigin format title{english romaji native}}}',variables:{mal:mapped.mal_id}})});
      var media=info&&info.data&&info.data.Media;
      if(!media||media.idMal!==mapped.mal_id||media.countryOfOrigin!=='JP'||(type==='movie')!==(media.format==='MOVIE')){log('MAPPING','Japanese anime identity / type not verified');return;}
      var titles=[media.title&&media.title.english,media.title&&media.title.romaji,mapped.anime_title].concat(mapped.titles||[]).filter(function(t){return typeof t==='string'&&t.trim();});
      titles=titles.filter(function(t,i){return titles.indexOf(t)===i;}).slice(0,4);
      if(!titles.length){log('SEARCH','No verified title');return;}
      var s=await bootstrap(req,false);
      async function search(retry){
        s=await bootstrap(req,false);
        var r=await req(s.search+'/multi-search',{method:'POST',headers:{Authorization:'Bearer '+s.searchToken,'Content-Type':'application/json'},body:JSON.stringify({queries:titles.map(function(t){return {indexUid:'content',q:t,limit:12};})})});
        if((r.status===401||r.status===403)&&retry){await bootstrap(req,true);return search(false);}
        if(!r.ok)throw new Error('Search HTTP '+r.status);return JSON.parse(r.body);
      }
      var data=await search(true),hits=[],seen=Object.create(null);
      (data.results||[]).forEach(function(row){(row.hits||[]).forEach(function(h){if(h&&h.content_id&&!seen[h.content_id]){seen[h.content_id]=true;hits.push(h);}});});
      // Prefer exact title hits only for ordering. MAL equality is mandatory.
      function norm(t){return String(t||'').toLowerCase().replace(/[^a-z0-9\u0080-\uFFFF]/g,'');}
      hits.sort(function(a,b){function exact(h){return [h.content_title_en,h.content_title,h.content_title_jp].some(function(t){return titles.some(function(x){return norm(x)===norm(t);});})?1:0;}return exact(b)-exact(a);});
      var verified=(await Promise.all(hits.slice(0,6).map(async function(h){
        try{var v=await api('/v4/content/'+encodeURIComponent(h.content_id)+'/video/1');var m=v&&v.metadata;
          if(m&&Number(m.mal_id)===mapped.mal_id&&Boolean(m.is_movie)===(type==='movie'))return {hit:h,first:v};
        }catch(e){log('CANDIDATE',e.message);}return null;
      }))).filter(Boolean);
      if(verified.length!==1){log('MATCH','Expected one exact MAL match; found '+verified.length);return;}
      var chosen=verified[0],content=String(chosen.hit.content_id);
      var episodes=await api('/v4/content/'+encodeURIComponent(content)+'/episodes');
      var key=Object.keys(episodes||{}).find(function(k){return /^\d+$/.test(k)&&Number(k)===mapped.episode;});
      if(!key&&type==='movie'&&mapped.episode===1)key='1';
      if(!key){log('EPISODE','Mapped episode missing from source list');return;}
      var video=Number(key)===1?chosen.first:await api('/v4/content/'+encodeURIComponent(content)+'/video/'+encodeURIComponent(key));
      if(!video.metadata||Number(video.metadata.mal_id)!==mapped.mal_id){log('MATCH','Episode MAL identity changed');return;}
      var source=url(video.uri&&video.uri.stream);if(!source){log('DASH','No direct stream');return;}
      s=await bootstrap(req,false);var headers={Authorization:'Bearer '+s.token,Referer:SITE+'/',Origin:SITE,'User-Agent':UA};
      var manifest=await req(source,{headers:headers});if(!manifest.ok)throw new Error('DASH HTTP '+manifest.status);
      if(!/<(?:\w+:)?MPD\b/.test(manifest.body)||!/<(?:\w+:)?(?:Period|AdaptationSet)\b/.test(manifest.body)){log('DASH','Invalid MPD');return;}
      if(/<(?:\w+:)?ContentProtection\b/.test(manifest.body)){log('DASH','Protected stream unsupported');return;}
      var audio=manifest.body.match(/<(?:\w+:)?(?:AdaptationSet|Representation)\b[^>]*>/g)||[];
      if(audio.some(function(tag){var audioTag=attr(tag,'contentType')==='audio'||/^audio\//.test(attr(tag,'mimeType'));var lang=attr(tag,'lang');return audioTag&&lang&&!/^(ja|jp|jpn)(?:-|$)/i.test(lang);})) {log('AUDIO','Non-Japanese audio manifest');return;}
      var subs=video.uri&&video.uri.subtitles||{},labels=video.metadata.subtitles||{},subtitles=[];
      Object.keys(subs).forEach(function(code){var name=cloudAnimeSubtitleLanguage({language:code,label:labels[code]}),address=url(subs[code],source);if(!name||!address)return;
        var lang=name==='English'?'en':name==='Malay'?'ms':'id',mime=subtitleMime(address);subtitles.push({id:'animeonsen-'+lang,url:address,name:name,label:name,language:lang,lang:lang,srclang:lang,mimeType:mime,headers:headers});});
      subtitles=subtitles.filter(function(t,i){return subtitles.findIndex(function(x){return x.url===t.url;})===i;});
      if(closed)return;
      log('DASH','MPD validated; exact MAL '+mapped.mal_id+', episode '+mapped.episode);log('SUBTITLE',subtitles.length+' English/Malay/Indo tracks published');subtitles.forEach(function(t){log('SUBTITLE_FORMAT',t.name+' MIME '+t.mimeType);});
      streams.push({sourceEpisode:mapped.episode,name:'AnimeOnsen',title:chosen.hit.content_title_en||titles[0],url:source,type:'dash',mimeType:'application/dash+xml',quality:'Auto',server:'AnimeOnsen',audioLanguage:'ja',audioType:'sub',headers:headers,subtitles:subtitles});
    }
    try{await Promise.race([work().catch(function(e){log('ERROR',e.message);}),new Promise(function(resolve){timer=setTimeout(resolve,26500);})]);}
    finally{closed=true;clearTimeout(timer);}
    log('RESULT',streams.length+' sub streams');return cloudAnimeFilterStreams(streams,'animeonsen');
  }
  module.exports={getStreams:getStreams};
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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "animeonsen");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;

/* CLOUDANIME_SOURCE_DETAILS_V1: display only; no network requests. */
function cloudAnimeSourceDetails(streams, providerName, providerId, logo) {
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
    if (languages.length && sub !== 'Hardsub') sub += ' • ' + languages.slice(0,2).join(', ') + (languages.length > 2 ? ' +' + (languages.length-2) : '');
    var mediaType = clean(stream.type).toLowerCase(), mime = clean(stream.mimeType).toLowerCase().split(';')[0];
    var format = /^(?:hls|m3u8)$/.test(mediaType) ? 'HLS' : mediaType === 'mp4' ? 'MP4' : /^(?:dash|mpd)$/.test(mediaType) ? 'DASH' : /^(?:application\/(?:x-mpegurl|vnd.apple.mpegurl))$/.test(mime) ? 'HLS' : mime === 'video/mp4' ? 'MP4' : mime === 'application/dash+xml' ? 'DASH' : '';
    var lines = [[title, Number.isInteger(ep) && ep > 0 ? 'EP ' + ep : ''].filter(Boolean).join(' • '), [server, quality, format].filter(Boolean).join(' • '), [sub, audio].filter(Boolean).join(' • ')].filter(Boolean);
    var output = Object.assign({}, stream, { name: providerName, title: lines.join('\n'), serverName: server, sourceTitle: title, sourceEpisode: Number.isInteger(ep) && ep > 0 ? ep : undefined });
    // Use the same identity/server fields as the providers already rendering correctly.
    delete output.server;
    if (providerId) output.provider = providerId;
    if (logo) output.logo = logo;
    return output;
  });
}
function cloudAnimeInstallSourceDetails(provider, providerName, providerId, logo) {
  var original = provider.getStreams;
  return Object.assign({}, provider, {getStreams:function() {
    var receiver=this,args=arguments;
    return Promise.resolve().then(function(){return original.apply(receiver,args);}).then(function(streams){return cloudAnimeSourceDetails(streams,providerName,providerId,logo);});
  }});
}
/* CLOUDANIME_SOURCE_DETAILS_END */

module.exports = cloudAnimeInstallSourceDetails(module.exports, "AnimeOnsen", "animeonsen", "");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
