/* CloudAnime AnimeGG v1.0.1 — standalone runtime provider. */
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
var BASE='https://www.animegg.org',UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
function log(stage,message){console.log('[AnimeGG] '+stage+': '+message);}
function entity(t){return String(t||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));});}
function text(t){return entity(t).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function attr(tag,name){var m=new RegExp('\\b'+name+'\\s*=\\s*["\']([^"\']*)["\']','i').exec(tag);return m?entity(m[1]):'';}
function http(v,base){if(typeof v!=='string'||!v.trim())return '';try{var u=new URL(entity(v),base||BASE);return u.protocol==='https:'?u.href:'';}catch(_){return '';}}
function norm(t){return text(t).toLowerCase().replace(/[^a-z0-9\u0080-\uFFFF]/g,'');}
// Parse data literals only; never execute scripts from the player page.
function literal(raw){
var p=0;function ws(){while(/\s/.test(raw[p]||'')&&p<raw.length)p++;}
function string(){var quote=raw[p++],out='';while(p<raw.length){var c=raw[p++];if(c===quote)return out;if(c==='\\'){var e=raw[p++];if(e==='u'||e==='x'){var n=e==='u'?4:2,h=raw.slice(p,p+n);if(!new RegExp('^[0-9a-fA-F]{'+n+'}$').test(h))throw Error('Invalid data escape');out+=String.fromCharCode(parseInt(h,16));p+=n;}else out+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'})[e]||e;}else out+=c;}throw Error('Unclosed data string');}
function value(){ws();var c=raw[p];if(c==='"'||c==="'")return string();if(c==='['){p++;var a=[];ws();while(raw[p]!==']'){a.push(value());ws();if(raw[p]===','){p++;ws();}else if(raw[p]!==']')throw Error('Invalid array');if(p>=raw.length)throw Error('Unclosed array');}p++;return a;}
if(c==='{'){p++;var o=Object.create(null);ws();while(raw[p]!=='}'){var k;if(raw[p]==='"'||raw[p]==="'")k=string();else{var m=/^[A-Za-z_$][\w$]*/.exec(raw.slice(p));if(!m)throw Error('Invalid data key');k=m[0];p+=k.length;}ws();if(raw[p++]!==':')throw Error('Invalid object');o[k]=value();ws();if(raw[p]===','){p++;ws();}else if(raw[p]!=='}')throw Error('Invalid object');if(p>=raw.length)throw Error('Unclosed object');}p++;return o;}
var m=/^(?:true|false|null|-?\d+(?:\.\d+)?)/.exec(raw.slice(p));if(!m)throw Error('Unsupported player data');p+=m[0].length;return JSON.parse(m[0]);}
return value();}
function assigned(html,name){var m=new RegExp('(?:var|let|const)\\s+'+name+'\\s*=\\s*','g').exec(html);if(!m)return [];try{var v=literal(html.slice(m.index+m[0].length));return Array.isArray(v)?v:[];}catch(e){log('DATA',name+': '+e.message);return [];}}
function searchRows(html){var links=html.match(/<a\b[^>]*class=["'][^"']*\bmse\b[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)||[];return links.map(function(block){var tag=block.match(/<a\b[^>]*>/i)[0],href=attr(tag,'href'),m=/^\/series\/([^/?#]+)$/.exec(href);if(!m)return null;var heading=/<(?:h2|strong)\b[^>]*>([\s\S]*?)<\/(?:h2|strong)>/i.exec(block);return {slug:m[1],title:heading?text(heading[1]):m[1].replace(/-/g,' ')};}).filter(Boolean);}
function seriesEpisodes(html){var blocks=html.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi)||[],out=[];blocks.forEach(function(b){if(!/\bbtn-subbed\b/.test(b))return;var tag=b.match(/<a\b[^>]*class=["'][^"']*\banm_det_pop\b[^"']*["'][^>]*>/i);if(!tag)return;var label=/<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(b),n=label&&/(\d+)\s*$/.exec(text(label[1]));if(!n||/\d+\s*-\s*\d+\s*$/.test(text(label[1])))return;var address=http(attr(tag[0],'href').split('#')[0]);if(address&&new URL(address).origin===BASE)out.push({number:Number(n[1]),url:address});});return out;}
function subTabs(html){return (html.match(/<a\b[^>]*data-toggle=["']tab["'][^>]*>/gi)||[]).map(function(tag){var version=attr(tag,'data-version').toLowerCase(),id=attr(tag,'data-id');if(!/^(sub|subbed|subtitled)$/.test(version)||!/^\d+$/.test(id))return null;return {id:id,server:attr(tag,'data-mirror')||'AnimeGG'};}).filter(Boolean).filter(function(t,i,a){return a.findIndex(function(x){return x.id===t.id;})===i;}).slice(0,6);}
function requestScope(deadline){return async function(address,opts){var left=Math.min(7000,deadline-Date.now());if(left<=0)throw Error('Request budget finished');var timer,controller=typeof AbortController==='function'?new AbortController():null;opts=Object.assign({},opts||{});opts.headers=Object.assign({'User-Agent':UA,Referer:BASE+'/'},opts.headers||{});if(controller)opts.signal=controller.signal;
try{return await Promise.race([Promise.resolve().then(function(){return fetch(address,opts);}).then(async function(r){var b=opts.method==='HEAD'?'':await r.text();if(b.length>2500000)throw Error('Upstream response too large');return {ok:r.ok,status:r.status,headers:r.headers,body:b};}),new Promise(function(_,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(Error('HTTP timeout at '+new URL(address).hostname));},left);})]);}finally{clearTimeout(timer);}};}
async function getStreams(id,type,season,episode){type=type==='series'?'tv':type;if(!['movie','tv'].includes(type)||!/^(?:tt\d+|\d+)$/.test(String(id)))return [];if(type==='tv'&&(!Number.isInteger(Number(season))||Number(season)<0||!Number.isInteger(Number(episode))||Number(episode)<1))return [];
var deadline=Date.now()+22500,req=requestScope(deadline),streams=[],closed=false,timer;
var mapping=cloudbankAnimeMappingFetch(async function(u,o){var r=await req(u,o);return {ok:r.ok,json:async function(){return JSON.parse(r.body);}};});
async function page(u,o){var r=await req(u,o);if(!r.ok)throw Error('HTTP '+r.status+' at '+new URL(u).hostname);return r.body;}
async function work(){var context=typeof globalThis!=='undefined'&&globalThis.VUEO_DISCOVERY_CONTEXT;if(typeof context==='string')try{context=JSON.parse(context);}catch(_){context=null;}var info=context&&(context.tmdb||context);if(info&&info.original_language&&info.original_language!=='ja'){log('AUDIO','Non-Japanese metadata excluded');return;}
var route=type==='movie'?'https://arm.haglund.dev/api/v2/tmdb?id='+encodeURIComponent(id):'https://id-mapping-api-malid.hf.space/api/resolve?id='+encodeURIComponent(id)+'&s='+season+'&e='+episode;var response=await mapping(route),mapped=response.ok?await response.json():null;if(!mapped||!mapped.mal_id||!mapped.episode){log('MAPPING','No verified anime episode');return;}
log('MAPPING','MAL '+mapped.mal_id+', episode '+mapped.episode+(mapped.mapping_method?' via '+mapped.mapping_method:''));
var aliases=(mapped.titles||[]).concat([mapped.anime_title,mapped.animeplanet_slug&&mapped.animeplanet_slug.replace(/-/g,' ')]).filter(function(t){return typeof t==='string'&&t.trim();});aliases=aliases.filter(function(t,i){return aliases.indexOf(t)===i;});
if(!aliases.length){log('MATCH','No mapped anime title');return;}
var queries=[mapped.animeplanet_slug&&mapped.animeplanet_slug.replace(/-/g,' '),mapped.anime_title].concat(aliases).filter(Boolean).slice(0,3);var compact=queries[0]&&queries[0].split(/\s+/)[0].replace(/[^a-z0-9]/gi,'');if(compact&&compact.length>=4)queries.push(compact);queries=queries.filter(function(q,i){return queries.indexOf(q)===i;});
var rows=(await Promise.all(queries.map(async function(q){try{return searchRows(await page(BASE+'/search/?q='+encodeURIComponent(q)));}catch(e){log('SEARCH',e.message);return [];}}))).reduce(function(a,b){return a.concat(b);},[]);
var seen=Object.create(null);rows=rows.filter(function(r){if(seen[r.slug])return false;seen[r.slug]=true;return aliases.some(function(t){return norm(r.title)===norm(t)||norm(r.slug.replace(/-/g,' '))===norm(t);});});
var matches=(await Promise.all(rows.slice(0,4).map(async function(row){try{var html=await page(BASE+'/series/'+encodeURIComponent(row.slug)),count=/Episodes:\s*(\d+)/i.exec(html),mal=/myanimelist\.net\/anime\/(\d+)/i.exec(html);if(mal&&Number(mal[1])!==mapped.mal_id)return null;if(count&&mapped.expectedEpisodes&&Number(count[1])>mapped.expectedEpisodes)return null;var eps=seriesEpisodes(html),target=eps.filter(function(e){return e.number===mapped.episode;});if(target.length!==1){log('EPISODE',row.title+': mapped episode '+mapped.episode+' has '+target.length+' explicit Sub entries');return null;}var headings=(html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)||[]).map(text);if(!headings.some(function(h){return aliases.some(function(t){return norm(t)===norm(h);});}))return null;return {row:row,episode:target[0]};}catch(e){log('SERIES',e.message);return null;}}))).filter(Boolean);
if(matches.length!==1){log('MATCH','Expected one exact mapped-title/episode match; found '+matches.length);return;}
var match=matches[0],watch=await page(match.episode.url),tabs=subTabs(watch);log('MATCH','Exact title '+match.row.title+', mapped episode '+mapped.episode);log('SERVER',tabs.length+' explicit Sub mirrors');
await Promise.all(tabs.map(async function(tab){try{var embed=BASE+'/embed/'+tab.id,html=await page(embed,{headers:{Referer:match.episode.url}}),sources=assigned(html,'videoSources'),headers={Referer:embed,'User-Agent':UA};var tracks=assigned(html,'tracks').concat(assigned(html,'videoTracks')).filter(function(t){return t&&/^(captions|subtitles)$/.test(t.kind||'subtitles');}).map(function(t){var name=cloudAnimeSubtitleLanguage(t);return {url:http(t.file||t.url||t.src,embed),name:name,language:name==='English'?'en':name==='Malay'?'ms':'id',headers:headers};}).filter(function(t){return t.url&&t.name;});
var candidates=sources.map(function(s){return {url:http(s.file,embed),label:s.label||'Unknown'};}).filter(function(s){return s.url;}).sort(function(a,b){return Number(/\.m3u8(?:[?#]|$)/i.test(b.url))-Number(/\.m3u8(?:[?#]|$)/i.test(a.url));});var hls=[],mp4=[];
for(var i=0;i<candidates.length;i++){var c=candidates[i];if(/\.m3u8(?:[?#]|$)/i.test(c.url)){var body=await page(c.url,{headers:headers});if(/^\s*#EXTM3U/.test(body)){var audio=(body.match(/^#EXT-X-MEDIA:.*TYPE=AUDIO.*$/gm)||[]);if(audio.some(function(line){var lang=/LANGUAGE="([^"]+)"/.exec(line);return lang&&!/^(ja|jp|jpn)(?:-|$)/i.test(lang[1]);})){log('AUDIO','Foreign HLS audio excluded');continue;}var master=/#EXT-X-STREAM-INF:/.test(body);hls.push({candidate:c,master:master});if(master)break;}}else if(/\.mp4(?:[?#]|$)/i.test(c.url)){// Published MP4 links may redirect to a CDN that rejects HEAD.
mp4.push(c);}}
var master=hls.find(function(h){return h.master;}),selected=master?[{candidate:master.candidate,type:'hls',quality:'Auto'}]:hls.length?hls.map(function(h){return {candidate:h.candidate,type:'hls',quality:h.candidate.label};}):mp4.map(function(c){return {candidate:c,type:'mp4',quality:c.label};});
if(closed)return;selected.forEach(function(s){streams.push({name:'AnimeGG',title:match.row.title,url:s.candidate.url,type:s.type,mimeType:s.type==='hls'?'application/x-mpegURL':'video/mp4',quality:s.quality,server:tab.server,audioLanguage:'ja',audioType:'sub',headers:headers,subtitles:tracks});});log('EXTRACT',tab.server+': '+selected.length+' direct links, '+tracks.length+' external subs');}catch(e){log('EXTRACT',tab.server+': '+e.message);}}));}
try{await Promise.race([work().catch(function(e){log('ERROR',e.message);}),new Promise(function(resolve){timer=setTimeout(resolve,22500);})]);}finally{closed=true;clearTimeout(timer);}streams=streams.filter(function(s,i){return streams.findIndex(function(x){return x.url===s.url;})===i;});log('RESULT',streams.length+' Sub streams');return cloudAnimeFilterStreams(streams,'animegg');}
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
      streams = cloudAnimeFilterStreams(streams, "animegg");
      streams = cloudAnimeMinimumResolution(streams, "animegg");
      return streams.map(function(stream, index) {
        try { return format(stream, index, meta, mediaType, season, episode); } catch (_) { return stream; }
      });
    });
  };
  return adapted;
}
module.exports = cloudbankDisplayInstall(module.exports, "AnimeGG", "animegg");
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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "animegg");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
