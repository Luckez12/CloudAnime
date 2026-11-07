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

/* CloudAnime Kurage v2.0.0 — one identity route, one Sub request, no duplicate engines. */
(function () {
  'use strict';
  var SITE='https://kurage.live';
  var UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var mappingCache=Object.create(null),cacheKeys=[];
  function log(stage,message){console.log('[Kurage] '+stage+': '+message);}
  function positive(v){var n=Number(v);return Number.isInteger(n)&&n>0?n:null;}
  function url(value,base){try{if(typeof value!=='string'||!value.trim())return '';var u=new URL(value,base);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
  function unavailable(message){var e=Error(message);e.name='KurageUnavailable';throw e;}
  function language(value){value=String(value||'').trim().toLowerCase();return /^(?:sub|subbed|ja|jp|jpn|japanese)$/.test(value);}
  function subtitleLanguage(v){v=String(v||'').trim().toLowerCase();if(/^(?:en|eng|english)(?:$|[ (])/.test(v))return 'en';if(/^(?:ms|msa|may|malay|bahasa melayu)(?:$|[ (])/.test(v))return 'ms';if(/^(?:id|ind|indo|indonesian|bahasa indonesia)(?:$|[ (])/.test(v))return 'id';return '';}
  async function getStreams(id,type,season,episode){
    id=String(id||'');type=type==='series'?'tv':type;season=Number(season);episode=type==='movie'?1:Number(episode);
    if(!positive(id)||!/^\d+$/.test(id)||!['tv','movie'].includes(type)||(type==='tv'&&(!Number.isInteger(season)||season<0||!positive(episode))))return [];
    var deadline=Date.now()+18000,closed=false,calls=0,streams=[];
    async function json(address,limit){
      var remaining=Math.min(limit,deadline-Date.now());if(closed||remaining<=0)unavailable('Request budget exhausted');
      var timer,controller=typeof AbortController==='function'?new AbortController():null;calls++;
      try{return await Promise.race([
        Promise.resolve().then(function(){return fetch(address,{headers:{'User-Agent':UA,Accept:'application/json',Origin:SITE,Referer:SITE+'/','trpc-accept':'application/json','x-trpc-source':'nextjs-react'},signal:controller?controller.signal:undefined});}).then(async function(r){
          if(!r.ok)unavailable('HTTP '+r.status+' at '+new URL(address).hostname);
          var body=await r.text();if(body.length>2000000)unavailable('Response too large');return JSON.parse(body);
        }),
        new Promise(function(_,reject){timer=setTimeout(function(){if(controller)controller.abort();var e=Error('Request timed out at '+new URL(address).hostname+'; no retry');e.name='KurageUnavailable';reject(e);},remaining);})
      ]);}finally{clearTimeout(timer);}
    }
    async function metadata(address){
      var hit=mappingCache[address];if(hit&&Date.now()-hit.time<300000)return hit.value;
      var value=await json(address,18000);mappingCache[address]={value:value,time:Date.now()};
      if(cacheKeys.indexOf(address)<0)cacheKeys.push(address);while(cacheKeys.length>16)delete mappingCache[cacheKeys.shift()];return value;
    }
    async function mapping(){
      var rows=await metadata('https://arm.haglund.dev/api/v2/themoviedb?id='+id);
      if(!Array.isArray(rows))unavailable('Invalid ARM response');
      rows=rows.filter(function(r){return r&&String(r.themoviedb)===id&&(type==='movie'?r.media==='MOVIE':r.media!=='MOVIE');});
      var seen=Object.create(null);
      rows=rows.filter(function(r){var k=[r.anilist,r['themoviedb-season'],r.thetvdb,r['thetvdb-season']].join(':');if(seen[k])return false;seen[k]=true;return true;});
      var exact=rows.filter(function(r){return type==='movie'?r['themoviedb-season']==null:r['themoviedb-season']!=null&&Number(r['themoviedb-season'])===season;});
      if(exact.length===1&&positive(exact[0].anilist)&& (type==='movie'||season>0))return {id:Number(exact[0].anilist),episode:episode,method:type==='movie'?'ARM exact movie ID':'ARM exact season ID'};
      // Multiple anime parts require an explicit order bridge, never a date/search guess.
      var candidates=exact.filter(function(r){return positive(r.anilist)&&positive(r.thetvdb)&&r['thetvdb-season']!=null&&Number(r['thetvdb-season'])===season;});
      if(type==='movie'||!candidates.length)unavailable('No unambiguous anime identity for requested type/season');
      if(candidates.length>12)unavailable('Mapping exceeds request budget; no arbitrary candidate selected');
      var matches=[],matchSeen=Object.create(null);
      for(var offset=0;offset<candidates.length;offset+=4){
        var datasets=await Promise.all(candidates.slice(offset,offset+4).map(async function(r){return {row:r,data:await metadata('https://api.ani.zip/mappings?anilist_id='+r.anilist)};}));
        datasets.forEach(function(item){var r=item.row,d=item.data;
          if(!d||!d.mappings||Number(d.mappings.anilist_id)!==Number(r.anilist)||String(d.mappings.themoviedb_id)!==id||Number(d.mappings.thetvdb_id)!==Number(r.thetvdb))unavailable('Anime dataset identity conflicts with ARM');
          Object.keys(d.episodes||{}).forEach(function(k){var e=d.episodes[k];
            if(!e||!positive(e.episode)||e.seasonNumber==null||e.episodeNumber==null||Number(e.tvdbShowId)!==Number(r.thetvdb)||Number(e.seasonNumber)!==season||Number(e.episodeNumber)!==episode)return;
            var key=r.anilist+':'+Number(e.episode);if(matchSeen[key])return;matchSeen[key]=true;
            matches.push({id:Number(r.anilist),episode:Number(e.episode),method:'ARM linked season + AniZip exact episode'});
          });
        });
      }
      if(matches.length!==1)unavailable('Exact anime episode candidates='+matches.length+'; no substitute selected');return matches[0];
    }
    function playbackHeaders(address,extra){
      var u=new URL(address),headers={'User-Agent':UA,Origin:SITE,Referer:SITE+'/'};
      // Keep the proxy URL intact: its query carries upstream headers for the server to apply.
      if(u.origin===SITE)return headers;
      var supplied=extra;
      if(!supplied){var encoded=u.searchParams.get('headers');if(encoded){try{supplied=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));}catch(_){}}}
      if(supplied&&typeof supplied==='object')Object.keys(supplied).forEach(function(k){var v=supplied[k];if(/^(?:user-agent|referer|origin|accept|accept-language)$/i.test(k)&&typeof v==='string'&&!/[\r\n]/.test(v))headers[k]=v;});
      return headers;
    }
    function sourceStreams(data,mapped,title){
      if(!data||typeof data!=='object'||data.available!==true){log('NO_SOURCE','Sub episode unavailable; no retry or alternate engine');return [];}
      if(data.animeId!=null&&Number(data.animeId)!==mapped.id)unavailable('Source anime identity mismatch');
      if(data.episode!=null&&Number(data.episode)!==mapped.episode)unavailable('Source episode identity mismatch');
      if(data.language&&!language(data.language))unavailable('Source response is not Sub/Japanese');
      var servers=Array.isArray(data.servers)&&data.servers.length?data.servers:[data],seen=Object.create(null),result=[];
      servers.forEach(function(s,index){
        if(!s||!language(s.language||data.language)||/\b(?:dub|dual[ -]?audio|multi[ -]?audio)\b/i.test([s.label,s.audioType,s.audioLanguage].join(' ')))return;
        if(s.audioLanguage&&!/^(?:ja|jp|jpn|japanese)$/i.test(s.audioLanguage))return;
        var address=url(s.url,SITE+'/');if(!address||seen[address])return;
        var declared=String(s.sourceType||data.sourceType||'').toLowerCase(),path=new URL(address).pathname;
        var format=/^(?:hls|m3u8|application\/(?:x-mpegurl|vnd\.apple\.mpegurl))$/.test(declared)?'hls':/^(?:mp4|video\/mp4)$/.test(declared)?'mp4':/^(?:mkv|video\/x-matroska)$/.test(declared)?'mkv':/\.m3u8$/i.test(path)?'hls':/\.mp4$/i.test(path)?'mp4':/\.mkv$/i.test(path)?'mkv':'';
        if(!format)return;seen[address]=true;
        var headers=playbackHeaders(address,s.headers),tracks=Array.isArray(s.subtitles)?s.subtitles:Array.isArray(data.subtitles)?data.subtitles:[],subtitles=[],trackSeen=Object.create(null);
        tracks.forEach(function(t){if(!t||typeof t!=='object')return;var lang=subtitleLanguage(t.language||t.lang||t.srclang||t.label),u=url(t.url||t.file,address);if(!lang||!u||trackSeen[u])return;trackSeen[u]=true;subtitles.push({url:u,language:lang,name:lang==='en'?'English':lang==='ms'?'Malay':'Indo',mimeType:/\.srt(?:\?|$)/i.test(u)?'application/x-subrip':/\.(?:ass|ssa)(?:\?|$)/i.test(u)?'text/x-ssa':'text/vtt',headers:playbackHeaders(u,t.headers)});});
        result.push({name:'Kurage',provider:'kurage',serverName:String(s.label||'Server '+(index+1)),title:title+(type==='tv'?' • S'+season+'E'+episode:'')+' • Japanese Sub',url:address,quality:'Auto',type:format,mimeType:format==='hls'?'application/x-mpegURL':format==='mp4'?'video/mp4':'video/x-matroska',audioType:'sub',audioLanguage:'ja',headers:headers,subtitles:subtitles.slice(0,16)});
      });
      if(!result.length)log('NO_SOURCE','No supported Sub/Japanese server; no retry');return result;
    }
    try{
      var mapped=await (async function() {
        var value = await cloudAnimeRecoverMapping(function() { return mapping(); }, id, type, season, episode, deadline);
        if (!value || !value.title_fallback) return value;
        return {id:value.anilist, episode:value.episode, method:value.mapping_method,
          titleFallback:value, slugHint:value.animeplanet_slug};
      })();if(!mapped)unavailable('ID mapping and exact title fallback unavailable');log('MAPPING','TMDB '+id+(type==='tv'?' S'+season+'E'+episode:' movie')+' -> AniList '+mapped.id+' E'+mapped.episode+'; '+mapped.method);
      var input={'0':{json:{animeId:mapped.id,episode:mapped.episode,language:'sub'}}};
      var response=await json(SITE+'/api/trpc/episodes.source?batch=1&input='+encodeURIComponent(JSON.stringify(input)),18000);
      if(!Array.isArray(response)||response.length!==1)unavailable('Invalid Sub response batch');
      var item=response[0];if(item&&item.error)unavailable('Sub endpoint returned an error; no retry');
      var data=item&&item.result&&item.result.data&&item.result.data.json;
      if(!data)unavailable('Missing Sub source response');
      streams=sourceStreams(data,mapped,'Kurage');
      if(streams.length){
        var context=typeof globalThis!=='undefined'&&globalThis.VUEO_DISCOVERY_CONTEXT;
        if(typeof context==='string'){try{context=JSON.parse(context);}catch(_){context=null;}}
        var root=context&&(context.tmdb||context);
        // Display metadata is optional and lazy: never obtain it for an unavailable episode.
        if((!root||!(root.name||root.title))&&typeof globalThis.vueoDiscoveryContext==='function'){
          var displayTimer;
          try{context=await Promise.race([globalThis.vueoDiscoveryContext('https://api.themoviedb.org/3/'+type+'/'+id),new Promise(function(_,reject){displayTimer=setTimeout(function(){reject(Error('Optional title budget exhausted'));},Math.max(1,Math.min(1000,deadline-Date.now())));})]);if(typeof context==='string')context=JSON.parse(context);root=context&&(context.tmdb||context);}catch(_){root=null;}finally{clearTimeout(displayTimer);}
        }
        if(context&&(context.tmdbId||root&&root.id)&&String(context.tmdbId||root.id)!==id)unavailable('Shared metadata identity mismatch');
        var title=root&&(root.name||root.title)||'Kurage';
        streams.forEach(function(s){s.title=title+(type==='tv'?' • S'+season+'E'+episode:'')+' • Japanese Sub';});
      }
    }catch(e){streams=[];log(e.name==='KurageUnavailable'?'NO_RESULT':'ERROR',e.message);}
    finally{closed=true;}
    log('RESULT',streams.length+' Sub sources; '+calls+' HTTP calls');return streams;
  }
  module.exports={getStreams:getStreams};
  if(typeof globalThis!=='undefined')globalThis.getStreams=getStreams;
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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "kurage");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
