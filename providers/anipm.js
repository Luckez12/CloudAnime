/* CloudAnime Ani.pm v1.0.4 — standalone runtime provider. */
/* Cloudbank anime mapping adapter. No Node globals or runtime imports. */
function cloudbankAnimeMappingFetch(nativeFetch) {
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
      if (!movieData || !movieData.mappings || Number(movieData.mappings.mal_id) !== Number(rows[0].myanimelist)) return null;
      var movieTitles = movieData.titles || {};
      return { mal_id: positive(rows[0].myanimelist), anilist: positive(rows[0].anilist), mal_episode: 1, episode: 1,
        titles: Object.keys(movieTitles).map(function(k) { return movieTitles[k]; }).filter(Boolean),
        anime_title: movieTitles.en || movieTitles['x-jat'] || '', expectedEpisodes: 1, animeplanet_slug: rows[0]['anime-planet'] || '' };
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
    var datasets = await datasetsPromise;
    var selected = videos.find(function(v) { return seasonOf(v) === season && number(v) === episode; });
    var mappingMethod = "air-date";
    // VUEO may send an absolute anime episode alongside a TMDB season (S23 E1156).
    // Bridge it only through the same show and a unique episode identity/date in
    // independent episode metadata. Never reinterpret relative episodes as offsets.
    if (!selected && showWide) {
      var bridges = [];
      datasets.forEach(function(data, i) {
        if (!data || !data.mappings || Number(data.mappings.mal_id) !== Number(rows[i].myanimelist) ||
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


(function(){
'use strict';
var SITE='https://ani.pm',EMBED='https://embed.settlar.io',UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
function log(stage,message){console.log('[Ani.pm] '+stage+': '+message);}
function positive(v){var n=Number(v);return Number.isInteger(n)&&n>0?n:null;}
function address(v,base){if(typeof v!=='string')return '';try{var u=new URL(v,base);return u.protocol==='https:'?u.href:'';}catch(_){return '';}}
function identity(core,mapped){if(!core)return false;var mal=positive(core.malId),aid=positive(core.anilistId);if(mal&&mal!==mapped.mal_id||aid&&mapped.anilist&&aid!==mapped.anilist)return false;return mal===mapped.mal_id||Boolean(aid&&mapped.anilist&&aid===mapped.anilist);}
function number(e){return positive(e&&(e.number!=null?e.number:e.episode!=null?e.episode:e.ep));}
function japanese(v){return typeof v==='string'&&/^(?:ja|jp|jpn|japanese|日本語)(?:[-_].*)?$/i.test(v.trim());}
async function getStreams(id,type,season,episode){
 type=type==='series'?'tv':type;
 if(!['tv','movie'].includes(type)||!/^(?:tt\d+|\d+)$/.test(String(id)))return [];
 if(type==='tv'&&(!Number.isInteger(Number(season))||Number(season)<0||!positive(episode)))return [];
 var deadline=Date.now()+28000,closed=false,timer,streams=[];
 async function request(u,headers){
  var remaining=Math.min(8000,deadline-Date.now()),timeout,controller=typeof AbortController==='function'?new AbortController():null;
  if(remaining<=0||closed)throw Error('Request budget finished');
  var opts={headers:Object.assign({'User-Agent':UA,Referer:SITE+'/'},headers||{})};if(controller)opts.signal=controller.signal;
  try{return await Promise.race([Promise.resolve().then(function(){return fetch(u,opts);}).then(async function(r){var body=await r.text();if(body.length>2500000)throw Error('Response too large');if(!r.ok)throw Error('HTTP '+r.status+' at '+new URL(u).hostname);return {body:body,headers:r.headers};}),new Promise(function(_,reject){timeout=setTimeout(function(){if(controller)controller.abort();reject(Error('HTTP timeout at '+new URL(u).hostname));},remaining);})]);}finally{clearTimeout(timeout);}
 }
 async function json(u,headers){var r=await request(u,headers);try{return JSON.parse(r.body);}catch(_){throw Error('Invalid JSON at '+new URL(u).hostname);}}
 var mapping=cloudbankAnimeMappingFetch(async function(u){var data=await json(u);return {ok:true,json:async function(){return data;}};});
 async function work(){
  var context=typeof globalThis!=='undefined'&&globalThis.VUEO_DISCOVERY_CONTEXT;
  if(typeof context==='string')try{context=JSON.parse(context);}catch(_){context=null;}
  var info=context&&(context.tmdb||context);if(info&&info.original_language&&info.original_language!=='ja'){log('AUDIO','Non-Japanese title excluded');return;}
  var route=type==='movie'?'https://arm.haglund.dev/api/v2/tmdb?id='+encodeURIComponent(id):'https://id-mapping-api-malid.hf.space/api/resolve?id='+encodeURIComponent(id)+'&s='+season+'&e='+episode;
  var response=await mapping(route),mapped=response.ok?await response.json():null;
  if(!mapped||!mapped.mal_id||!mapped.episode){log('MAPPING','No verified anime episode');return;}
  log('MAPPING','MAL '+mapped.mal_id+', episode '+mapped.episode+(mapped.mapping_method?' via '+mapped.mapping_method:''));
  var queries=[mapped.anime_title].concat(mapped.titles||[]).filter(function(t,i,a){return typeof t==='string'&&t.trim()&&a.indexOf(t)===i;}).slice(0,3);
  if(!queries.length){log('MATCH','Mapped title unavailable');return;}
  var siteHeaders={Referer:SITE+'/',Origin:SITE,Accept:'application/json, text/plain, */*'};
  var results=await Promise.all(queries.map(async function(q){try{var data=await json(SITE+'/api/anime/search?q='+encodeURIComponent(q),siteHeaders);var items=Array.isArray(data)?data:data.items||data.results||data.data;return Array.isArray(items)?items:[];}catch(e){log('SEARCH',e.message);return [];}}));
  var seen=Object.create(null),candidates=[];
  results.forEach(function(items){items.forEach(function(c){var source=c&&(c.source||c.provider),key=source+':'+(c&&c.id);if(!c||!positive(c.id)||!source||seen[key]||!identity(c,mapped))return;seen[key]=true;candidates.push(c);});});
  if(!candidates.length||candidates.length>4){log('MATCH','Verified search candidates: '+candidates.length);return;}
  var matches=(await Promise.all(candidates.map(async function(c){try{
   var u=SITE+'/api/anime/playback-bootstrap/'+encodeURIComponent(c.source||c.provider)+'/'+encodeURIComponent(c.id)+'?ep='+mapped.episode+'&lang=sub&routes=e4',b=await json(u,siteHeaders),core=b.core||b.anime||b.data&&b.data.core;
   if(!identity(core,mapped)){log('MATCH','Bootstrap identity mismatch');return null;}
   if(String(b.id)!==String(c.id)||b.source!==(c.source||c.provider)||Number(b.episode)!==mapped.episode||b.requestedLanguage!=='sub'||b.effectiveLanguage!=='sub'){log('EPISODE','Bootstrap episode/language mismatch');return null;}
   var eps=Array.isArray(core.episodes)?core.episodes:[],exact=eps.filter(function(e){return number(e)===mapped.episode;}),packages=(b.anipmPackages||b.packages||{}).episodes||{},pkg=packages[String(mapped.episode)];
   if(exact.length!==1||!pkg||pkg.sub!==true||!b.availability||b.availability.sub!==true||!b.settlarSelection){log('EPISODE','Mapped Sub episode unavailable');return null;}
   return {bootstrap:b,core:core,pkg:pkg};
  }catch(e){log('BOOTSTRAP',e.message);return null;}}))).filter(Boolean);
  if(matches.length!==1){log('MATCH','Expected one verified bootstrap; found '+matches.length);return;}
  var match=matches[0],channels=['sub'];if(match.pkg.subhard===true)channels.push('subhard');
  log('MATCH','MAL '+mapped.mal_id+', exact episode '+mapped.episode+', '+channels.length+' Sub channels');
  await Promise.all(channels.map(async function(channel){try{
   // VUEO's URL shim keeps href as a snapshot; searchParams.set does not update it.
   var sessionUrl=SITE+'/api/anime/settlar/session?selection='+encodeURIComponent(match.bootstrap.settlarSelection)+'&provider=anipm&ep='+encodeURIComponent(String(mapped.episode))+'&channel='+encodeURIComponent(channel)+'&telemetry=0';
   var session=await json(sessionUrl,siteHeaders),embed=address(session.embedUrl||session.url);if(!embed||new URL(embed).origin!==EMBED)throw Error('Unexpected embed origin');
   var token=new URL(embed).searchParams.get('t');if(!token)throw Error('Missing embed session token');
   var data=await json(EMBED+'/api/embed/session?t='+encodeURIComponent(token),{Referer:embed,Origin:EMBED});
   if(data.provider&&data.provider!=='anipm')throw Error('Unexpected embed provider');
   if(!japanese(data.audioLang||data.audioLanguage||(typeof data.audio==='string'?data.audio:''))){log('AUDIO',channel+': non-Japanese or unverified audio excluded');return;}
   var headers={'User-Agent':UA,Referer:EMBED+'/',Origin:EMBED},items=[];
   // Settlar's web player attaches this session proof to /~key requests.
   // Media3 applies source headers to child playlists, keys and segments.
   if(typeof data.keyProof==='string'&&data.keyProof.length>0&&data.keyProof.length<=4096&&!/[\r\n]/.test(data.keyProof)){
    headers['X-Settlar-Key-Proof']=data.keyProof;
    log('SESSION',channel+': HLS key proof attached to playback headers');
   }else log('SESSION',channel+': no valid HLS key proof published');
   if(typeof data.source==='string')items.push({file:data.source,type:data.kind||data.type});
   if(Array.isArray(data.sources))items=items.concat(data.sources);
   var seenSources=Object.create(null);
   items=items.map(function(s){return typeof s==='string'?{file:s}:s;}).filter(Boolean).map(function(s){return {url:address(s.file||s.url||s.src),type:s.type||data.kind||data.type,label:s.label||s.quality||'Auto'};}).filter(function(s){if(!s.url||seenSources[s.url])return false;seenSources[s.url]=true;return true;}).slice(0,6);
   var tracks=Array.isArray(data.subtitles)?data.subtitles:Array.isArray(data.tracks)?data.tracks:[];
   tracks=tracks.filter(function(t){return t&&typeof t==='object'&&(!t.kind||/^(subtitles|captions)$/.test(t.kind));}).map(function(t){var name=cloudAnimeSubtitleLanguage(t),url=address(t.url||t.src||t.file);return {url:url,name:name,label:name,language:name==='English'?'en':name==='Malay'?'ms':'id',lang:name==='English'?'en':name==='Malay'?'ms':'id',srclang:name==='English'?'en':name==='Malay'?'ms':'id',headers:headers,mimeType:'text/vtt',type:'vtt'};}).filter(function(t){return t.url&&t.name;});
   tracks=(await Promise.all(tracks.slice(0,6).map(async function(t){try{
    var body=(await request(t.url,t.headers)).body,kind='',mime='';
    if(/^\s*WEBVTT/.test(body)&&/\d{2}:\d{2}(?::\d{2})?\.\d{3}\s+-->/.test(body)){kind='vtt';mime='text/vtt';}
    else if(/\[Events\]/i.test(body)&&/^Dialogue:/m.test(body)){kind='ass';mime='text/x-ssa';}
    else if(/\d{2}:\d{2}:\d{2},\d{3}\s+-->/.test(body)){kind='srt';mime='application/x-subrip';}
    if(!kind){log('SUBTITLE',t.name+': no recognized subtitle cues');return null;}
    t.type=kind;t.mimeType=mime;log('SUBTITLE',t.name+': '+kind+' cues verified');return t;
   }catch(e){log('SUBTITLE',t.name+': '+e.message);return null;}}))).filter(Boolean);
   var hls=[],mp4=[];
   // Inspect HLS before MP4. Stop on the first verified master in this channel.
   items.sort(function(a,b){return Number(isHls(b))-Number(isHls(a));});
   function isHls(s){return /hls|mpegurl|m3u8/i.test(s.type||'')||/\.m3u8(?:[?#]|$)/i.test(s.url);}
   for(var i=0;i<items.length;i++){
    var s=items[i];try{if(isHls(s)){
     var playlist=(await request(s.url,headers)).body;if(!/^\s*#EXTM3U/.test(playlist))continue;
     var audio=playlist.match(/^#EXT-X-MEDIA:.*TYPE=AUDIO.*$/gm)||[];
     if(audio.some(function(line){var m=/LANGUAGE="([^"]+)"/.exec(line);return !m||!japanese(m[1]);})){log('AUDIO',channel+': mixed/unverified HLS audio excluded');continue;}
     var master=/#EXT-X-STREAM-INF:/.test(playlist);
     hls.push({url:s.url,type:'hls',quality:master?'Auto':s.label,master:master});if(master)break;
    }else if(/^(?:mp4|video\/mp4)$/i.test(s.type||'')||/\.mp4(?:[?#]|$)/i.test(s.url)){mp4.push({url:s.url,type:'mp4',quality:s.label});}}catch(e){log('SOURCE',channel+': '+e.message);}
   }
   var master=hls.find(function(s){return s.master;}),selected=master?[master]:hls.length?hls:mp4;
   if(closed)return;
   selected.forEach(function(s){streams.push({name:'Ani.pm',title:match.core.title||mapped.anime_title,url:s.url,type:s.type,mimeType:s.type==='hls'?'application/x-mpegURL':'video/mp4',quality:s.quality,server:channel==='subhard'?'Ani.pm Hardsub':'Ani.pm Softsub',audioLanguage:'ja',audioType:'sub',subtitleType:channel==='subhard'?'hardsub':'softsub',headers:Object.assign({},headers,{'X-VUEO-HTTP-Transport':'shared'}),subtitles:tracks});});
   log('EXTRACT',channel+': '+selected.length+' sources, '+tracks.length+' external subs'+(master?', master HLS verified':''));
  }catch(e){log('EXTRACT',channel+': '+e.message);}}));
 }
 try{await Promise.race([work().catch(function(e){log('ERROR',e.message);}),new Promise(function(resolve){timer=setTimeout(resolve,28000);})]);}finally{closed=true;clearTimeout(timer);}
 // Keep the site's softsub channel ahead of its hardsub variant.
 streams.sort(function(a,b){return Number(a.subtitleType==='hardsub')-Number(b.subtitleType==='hardsub');});
 streams=streams.filter(function(s,i,a){return a.findIndex(function(x){return x.url===s.url;})===i;});
 log('RESULT',streams.length+' Sub streams');return cloudAnimeFilterStreams(streams,'anipm');
}
module.exports={getStreams:getStreams};
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
      streams = cloudAnimeFilterStreams(streams, "anipm");
      return streams.map(function(stream, index) {
        try { return format(stream, index, meta, mediaType, season, episode); } catch (_) { return stream; }
      });
    });
  };
  return adapted;
}
module.exports = cloudbankDisplayInstall(module.exports, "Ani.pm", "anipm");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
/* CLOUDBANK_PLAYIMDB_DISPLAY_END */
