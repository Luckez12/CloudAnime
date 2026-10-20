/* CloudAnime AnimeWorld v2.0.4 — exact catalogue episode; original audio verified; one discovery path. */
(function () {
  "use strict";
  var SITE = "https://watchanimeworld.one";
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  var cache = Object.create(null), cacheKeys = [];
  var catalogueCache=Object.create(null),catalogueKeys=[];
  function metadataCache(op,key,value){
    if(typeof globalThis!=='undefined'&&typeof globalThis.vueoMetadataCache==='function'){
      try{return JSON.parse(globalThis.vueoMetadataCache(JSON.stringify({op:op,key:key,value:value,ttlMs:300000})));}catch(_){}
    }
    if(op==='get'){var hit=catalogueCache[key];return hit&&Date.now()-hit.time<300000?JSON.parse(JSON.stringify(hit.value)):null;}
    if(op==='remove'){delete catalogueCache[key];return true;}
    if(op==='put'){catalogueCache[key]={value:JSON.parse(JSON.stringify(value)),time:Date.now()};if(!catalogueKeys.includes(key))catalogueKeys.push(key);while(catalogueKeys.length>16)delete catalogueCache[catalogueKeys.shift()];return true;}
    return null;
  }
  function log(stage, message) { console.log("[AnimeWorld] " + stage + ": " + message); }
  function noMatch(message) {var e=new Error(message);e.name='AnimeWorldNoMatch';throw e;}
  function positive(v) { var n=Number(v);return Number.isInteger(n)&&n>0?n:null; }
  function decode(s) {
    var named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…'};
    return String(s||'').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,function(all,key){if(key[0]==='#'){var n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=1114111?String.fromCodePoint(n):all;}return named[key.toLowerCase()]||all;});
  }
  function textContent(s) {return decode(String(s||'').replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
  function normal(s) {s=textContent(s).toLowerCase();if(typeof s.normalize==='function')s=s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');return s.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g,'');}
  // TMDB alternatives may name later arcs/series; an extended primary title
  // is not evidence that the site's season one is this request's season one.
  function titleNames(title,original,aliases) {
    var primary=[title,original].filter(function(v){return typeof v==='string'&&normal(v);}),keys=primary.map(normal);
    return primary.concat((aliases||[]).filter(function(v){
      if(typeof v!=='string'||!normal(v))return false;
      var k=normal(v);return keys.includes(k)||!keys.some(function(p){return k.length>p.length&&k.indexOf(p)===0;});
    }));
  }
  function attr(tag,name) {var m=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(["\'])([\\s\\S]*?)\\1','i').exec(tag);return m?decode(m[2]):'';}
  function address(s,base) {try{var u=new URL(decode(s),base);return u.protocol==='https:'?u.href:'';}catch(_){return '';}}
  function heading(html) {var m=/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);return m?textContent(m[1]):'';}
  function elements(html,name,select){
    // Balanced same-tag extraction, so a nested span does not truncate its parent field.
    var re=new RegExp('<\\/?'+name+'\\b[^>]*>','gi'),m,out=[];
    while((m=re.exec(html))){
      if(/^<\//.test(m[0])||!select(m[0]))continue;
      var start=m.index,depth=1,end;
      while(depth&&(end=re.exec(html))){if(/^<\//.test(end[0]))depth--;else if(!/\/>$/.test(end[0]))depth++;}
      if(depth)return [];out.push(html.slice(start,re.lastIndex));
    }
    return out;
  }
  function catalogueIdentity(html){
    var primary=elements(html,'article',function(t){return /(?:^|\s)single(?:\s|$)/.test(attr(t,'class'));});
    if(primary.length!==1)return null;
    var heads=primary[0].match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)||[];
    if(heads.length!==1)return null;
    var fields=elements(primary[0],'span',function(t){return /(?:^|\s)year(?:\s|$)/.test(attr(t,'class'));});
    if(fields.length!==1)return null;
    var year=textContent(fields[0]);
    return /^(?:19|20)\d{2}$/.test(year)?{title:heading(primary[0]),year:year}:null;
  }
  function links(html) {var tags=html.match(/<a\b[^>]*>/gi)||[];return tags.map(function(tag){return {url:address(attr(tag,'href'),SITE),tag:tag};}).filter(function(v){return !!v.url;});}
  function episodeIndex(html) {
    var routes=Object.create(null),articles=html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi)||[];
    articles.forEach(function(article){
      var h=/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(article);
      var caption=h&&/(?:^|\s)(\d+)x(\d+)\s*$/i.exec(textContent(h[1]));
      links(article).forEach(function(v){
        var u=new URL(v.url),m=/^\/episode\/[^/]+-(\d+)x(\d+)\/?$/.exec(u.pathname);
        if(u.origin!==SITE||!m||caption&&(Number(caption[1])!==Number(m[1])||Number(caption[2])!==Number(m[2])))return;
        var key=Number(m[1])+':'+Number(m[2]);
        if(!Object.prototype.hasOwnProperty.call(routes,key))routes[key]=v.url;
        else if(routes[key]!==v.url)routes[key]='';
      });
    });return routes;
  }
  function episodes(html,season,episode){return episodeIndex(html)[season+':'+episode]||'';}
  function catalogueSnapshot(html){
    var tags=(html.match(/<a\b[^>]*>/gi)||[]).filter(function(t){return attr(t,'data-post')!==''&&attr(t,'data-season')!=='';});
    return {seasons:tags.map(function(t){return {season:Number(attr(t,'data-season')),post:attr(t,'data-post')};}),routes:episodeIndex(html)};
  }
  function verifyEpisode(page,url,found,season,episode){
    // The URL was selected from the verified series' published cards/AJAX response.
    var tags=page.match(/<(?:meta|link)\b[^>]*>/gi)||[];
    var canonical=tags.filter(function(t){return attr(t,'rel')==='canonical';});
    if(canonical.length!==1||address(attr(canonical[0],'href'),SITE)!==url)noMatch('Episode canonical identity mismatch');
    var graphUrls=tags.filter(function(t){return attr(t,'property')==='og:url';});
    if(graphUrls.some(function(t){return address(attr(t,'content'),SITE)!==url;}))noMatch('Episode Open Graph URL conflicts with canonical');
    var players=elements(page,'aside',function(t){return attr(t,'id')==='aa-options'&&/(?:^|\s)video-player(?:\s|$)/.test(attr(t,'class'));});
    if(players.length!==1)noMatch('Episode primary player identity unavailable');
    var owners=[];
    links(players[0]).forEach(function(a){var u=new URL(a.url);if(u.origin===SITE&&/^\/series\/[^/]+\/$/.test(u.pathname)&&!owners.includes(a.url))owners.push(a.url);});
    if(owners.length!==1||owners[0]!==found.url)noMatch('Episode parent series conflicts with selected catalogue');
    // Numbered SEO titles are additional evidence; a plain episode name is valid too.
    var og=tags.filter(function(t){return attr(t,'property')==='og:title';});
    og.forEach(function(t){var m=/^(.*?)\s+(\d+)x(\d+)(?:\s+-\s+|$)/.exec(attr(t,'content'));
      if(m&&(normal(m[1])!==normal(found.title)||Number(m[2])!==season||Number(m[3])!==episode))noMatch('Explicit episode title coordinates conflict with request');
    });
    var u=new URL(url),m=/-(\d+)x(\d+)\/$/.exec(u.pathname);
    if(!m||Number(m[1])!==season||Number(m[2])!==episode)noMatch('Selected episode URL coordinates conflict with request');
    log('EPISODE_IDENTITY','Published exact card + canonical + parent series; SEO title may be an episode name');
  }
  // Dean Edwards string substitution only: packed website code is never evaluated.
  function unpack(code) {
    var m=/}\((['"])([\s\S]*?)\1,\s*(\d+),\s*(\d+),\s*(['"])([\s\S]*?)\5\.split\((['"])\|\7\)/.exec(code);
    if(!m)throw Error('Player player configuration unavailable');
    var radix=Number(m[3]),count=Number(m[4]);if(radix<2||radix>62||count<1||count>5000)throw Error('Unsupported packed player');
    var payload=m[2].replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\\\/g,'\\'),words=m[6].split('|'),dict=Object.create(null);
    function token(n){return (n<radix?'':token(Math.floor(n/radix)))+(n%radix>35?String.fromCharCode(n%radix+29):(n%radix).toString(36));}
    while(count--)dict[token(count)]=words[count]||token(count);
    return payload.replace(/\b\w+\b/g,function(w){return Object.prototype.hasOwnProperty.call(dict,w)?dict[w]:w;});
  }
  function settings(html,id) {
    var plain=/\b(?:VPlayer|FirePlayer)\(/.test(html)?html:unpack(html);
    var m=new RegExp('(?:VPlayer|FirePlayer)\\("'+id+'",(\\{[\\s\\S]*?\\}),(?:true|false)(?:,source)?\\)').exec(plain);
    if(!m)throw Error('Player video identity/configuration mismatch');
    return JSON.parse(m[1]);
  }
  function language(t) {
    var v=[t.language,t.lang,t.srclang,t.label,t.name];
    for(var i=0;i<v.length;i++){
      var s=String(v[i]||'').toLowerCase().trim();
      if(/^(?:en|eng|english)(?:$|[\s_(-])/.test(s))return 'en';
      if(/^(?:ms|msa|may|malay|bahasa melayu)(?:$|[\s_(-])/.test(s))return 'ms';
      if(/^(?:id|ind|indo|indonesian|bahasa indonesia)(?:$|[\s_(-])/.test(s))return 'id';
    }return '';
  }
  function hlsAttr(line,name){var m=new RegExp('(?:^|,)'+name+'=(?:"([^"]*)"|([^,]*))','i').exec(line.replace(/^#EXT-X-MEDIA:/,''));return m?(m[1]!=null?m[1]:m[2]):'';}
  async function getStreams(id,type,season,episode) {
    id=String(id||'');type=type==='series'?'tv':type;season=Number(season);episode=type==='movie'?1:Number(episode);
    if(!/^\d+$/.test(id)||!['tv','movie'].includes(type)||(type==='tv'&&(!Number.isInteger(season)||season<0||!positive(episode))))return [];
    var deadline=Date.now()+18000,calls=0,catalogueKey='catalogue-v1:'+SITE+':'+type+':'+id;
    async function text(url,headers,body) {
      var left=Math.min(10000,deadline-Date.now());if(left<=0)throw Error('Request budget exhausted');
      var timer,controller=typeof AbortController==='function'?new AbortController():null;calls++;
      try{return await Promise.race([
        fetch(url,{method:body?'POST':'GET',headers:Object.assign({'User-Agent':UA,Referer:SITE+'/'},headers||{}),body:body,signal:controller?controller.signal:undefined}).then(async function(r){if(!r.ok)throw Error('HTTP '+r.status+' at '+new URL(url).hostname);var b=await r.text();if(b.length>1500000)throw Error('Response too large');return b;}),
        new Promise(function(_,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(Error('HTTP timeout at '+new URL(url).hostname));},left);})
      ]);}finally{clearTimeout(timer);}
    }
    async function document(url){var c=cache[url];if(c&&Date.now()-c.time<300000)return c.text;var b=await text(url);cache[url]={text:b,time:Date.now()};cacheKeys.push(url);while(cacheKeys.length>16)delete cache[cacheKeys.shift()];return b;}
    async function metadata(){
      var context=typeof globalThis!=='undefined'&&globalThis.VUEO_DISCOVERY_CONTEXT;
      if(typeof context==='string'){try{context=JSON.parse(context);}catch(_){context=null;}}
      var tmdb=context&&(context.tmdb||context);
      if((!tmdb||!(tmdb.title||tmdb.name))&&typeof globalThis.vueoDiscoveryContext==='function'){
        context=await globalThis.vueoDiscoveryContext('https://api.themoviedb.org/3/'+type+'/'+id);
        if(typeof context==='string')context=JSON.parse(context);tmdb=context&&(context.tmdb||context);
      }
      if(!tmdb||!(tmdb.title||tmdb.name))noMatch('Shared title/year metadata unavailable');
      var expected=context.tmdbId||tmdb.id;if(expected!=null&&String(expected)!==id)noMatch('Shared metadata identity mismatch');
      var title=tmdb.title||tmdb.name,year=String(tmdb.first_air_date||tmdb.release_date||context.year||'').slice(0,4),titles=[title,tmdb.original_name,tmdb.original_title].concat(context.aliases||[]),alt=tmdb.alternative_titles||{};
      (alt.results||alt.titles||[]).forEach(function(v){titles.push(v.title);});
      return {title:title,original:tmdb.original_name||tmdb.original_title,year:year,titles:titleNames(title,tmdb.original_name||tmdb.original_title,titles)};
    }
    async function findTitle(meta){
      if(!meta.title||!/^\d{4}$/.test(meta.year))throw Error('Verified title/year metadata required');
      var cached=type==='tv'?metadataCache('get',catalogueKey):null;
      if(cached){
        var u=address(cached.url,SITE),valid=u&&new URL(u).origin===SITE&&/^\/series\/[^/]+\/$/.test(new URL(u).pathname)&&
          cached.year===meta.year&&meta.titles.some(function(t){return normal(t)===normal(cached.title);})&&cached.snapshot&&Array.isArray(cached.snapshot.seasons)&&cached.snapshot.routes&&typeof cached.snapshot.routes==='object';
        if(valid){log('CACHE','Verified catalogue hit; '+(typeof globalThis.vueoMetadataCache==='function'?'shared across executions':'current runtime only'));return {url:u,title:cached.title,year:cached.year,snapshot:cached.snapshot,cached:true};}
        metadataCache('remove',catalogueKey);
      }
      var names=meta.titles.filter(function(v){return typeof v==='string'&&normal(v);}),keys=names.map(normal),attempts=[meta.title];
      names.forEach(function(t){if(!attempts.some(function(q){return normal(q)===normal(t);}))attempts.push(t);});
      var seen=Object.create(null),plans=[];
      attempts.slice(0,2).forEach(function(query){plans.push({query:query});});
      for(var q=0;q<plans.length;q++) {
        var plan=plans[q],html=plan.html||await document(SITE+'/?s='+encodeURIComponent(plan.query)),candidates=[],siteTitles=[];
        (html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi)||[]).forEach(function(article){
          var h=/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(article);if(!h)return;siteTitles.push(textContent(h[1]));if(!keys.includes(normal(h[1])))return;
          links(article).forEach(function(a){var u=new URL(a.url);if(u.origin!==SITE||!(type==='tv'?/^\/series\//:/^\/movies\//).test(u.pathname)||seen[a.url])return;seen[a.url]=true;candidates.push(a.url);});
        });
        log('SEARCH',"query='"+plan.query+"'; requestedYear="+meta.year+'; exactCandidates='+candidates.length+'; siteTitles='+siteTitles.slice(0,5).join(' | '));
        if(candidates.length>3)noMatch('Ambiguous title search; skipped');
        var matches=(await Promise.all(candidates.map(async function(url){
          var page=await document(url),identity=catalogueIdentity(page);
          if(!identity||!keys.includes(normal(identity.title))||identity.year!==meta.year){
            log('REJECT',(identity?identity.title:heading(page))+'; requestedYear='+meta.year+'; primaryCatalogueYear='+(identity?identity.year:'unavailable'));
            return null;
          }
          log('IDENTITY',identity.title+' ('+identity.year+'); primary catalogue title/year fields');
          return {url:url,html:page,title:identity.title};
        }))).filter(Boolean);
        if(matches.length>1)noMatch('Multiple exact title/year matches; skipped');
        if(matches.length===1){
          var found=matches[0];
          if(type==='tv'){found.year=meta.year;found.snapshot=catalogueSnapshot(found.html);saveCatalogue(found);}
          return found;
        }
      }noMatch('No exact title/year match for '+meta.title+' ('+meta.year+'); no substitute series selected');
    }
    function saveCatalogue(found){metadataCache('put',catalogueKey,{url:found.url,title:found.title,year:found.year,snapshot:found.snapshot});}
    async function episodePage(found,route) {
      if(type==='movie')return found;
      var targetSeason=route.season,targetEpisode=route.episode,snapshot=found.snapshot;
      var seasonTags=snapshot.seasons.filter(function(t){return t.season===targetSeason;});
      if(seasonTags.length!==1)noMatch('Exact requested site season unavailable: S'+targetSeason);
      var key=targetSeason+':'+targetEpisode,url=snapshot.routes[key];
      if(!url){
        var post=seasonTags[0].post;if(!/^\d+$/.test(post))throw Error('Missing season identity');
        var html=await text(SITE+'/wp-admin/admin-ajax.php?action=action_select_season&season='+targetSeason+'&post='+post,{'X-Requested-With':'XMLHttpRequest',Referer:found.url}),fresh=episodeIndex(html);
        Object.keys(snapshot.routes).forEach(function(k){if(k.split(':')[0]===String(targetSeason))delete snapshot.routes[k];});
        Object.keys(fresh).forEach(function(k){if(k.split(':')[0]===String(targetSeason))snapshot.routes[k]=fresh[k];});
        url=snapshot.routes[key];if(url)saveCatalogue(found);
      }
      if(!url)noMatch('Exact site episode unavailable: S'+targetSeason+'E'+targetEpisode);
      var selected=address(url,SITE),coordinates=selected&&/^\/episode\/[^/]+-(\d+)x(\d+)\/$/.exec(new URL(selected).pathname);
      if(!selected||new URL(selected).origin!==SITE||!coordinates||Number(coordinates[1])!==targetSeason||Number(coordinates[2])!==targetEpisode)noMatch('Cached episode route conflicts with request');
      url=selected;var page=await text(url);verifyEpisode(page,url,found,targetSeason,targetEpisode);
      return {url:url,html:page,title:found.title};
    }
    async function extractPlayer(page,players){
      return (await Promise.all(players.slice(0,2).map(async function(p){try{
        var headers={'User-Agent':UA,Referer:p.url,Origin:p.origin};
        // Start HLS immediately after the API response; optional subtitle metadata runs alongside it.
        var configPromise=text(p.url,{Referer:page.url}).then(function(html){return settings(html,p.id);}).catch(function(e){log('SUBTITLE','Player metadata unavailable: '+e.message);return {};});
        var mediaPromise=text(p.origin+'/player/index.php?data='+p.id+'&do=getVideo',Object.assign({},headers,{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'}),'hash='+p.id+'&r='+encodeURIComponent(page.url)).then(async function(body){
          var data=JSON.parse(body),url=address(data.securedLink||data.videoSource,p.url);
          if(data.hls!==true||!url)throw Error('No native HLS source');
          return {url:url,master:await text(url,headers)};
        });
        var results=await Promise.all([configPromise,mediaPromise]),config=results[0],url=results[1].url,master=results[1].master;
        if(!/^#EXTM3U(?:\r?\n|$)/.test(master.trim())||!/#EXT-X-STREAM-INF:/.test(master))throw Error('Invalid master HLS');
        var japanese=master.split(/\r?\n/).filter(function(l){return /^#EXT-X-MEDIA:/.test(l)&&hlsAttr(l,'TYPE')==='AUDIO'&&/^(?:ja|jp|jpn|japanese)$/i.test(hlsAttr(l,'LANGUAGE'));});
        if(!japanese.length||japanese.some(function(l){return !address(hlsAttr(l,'URI'),url);}))throw Error('No verified Japanese audio rendition');
        var audio=master.split(/\r?\n/).filter(function(l){return /^#EXT-X-MEDIA:/.test(l)&&hlsAttr(l,'TYPE')==='AUDIO';});
        var jaGroups=japanese.map(function(l){return hlsAttr(l,'GROUP-ID');}),variants=master.split(/\r?\n/).filter(function(l){return /^#EXT-X-STREAM-INF:/.test(l);});
        if(variants.some(function(l){return !jaGroups.includes(hlsAttr(l,'AUDIO'));}))throw Error('Variant has no selectable Japanese audio group');
        var tracks=Array.isArray(config.tracks)?config.tracks:[],seen=Object.create(null),subtitles=[];
        tracks.forEach(function(t){var lang=language(t),u=address(t.file||t.url,p.url);if(!/^(?:captions|subtitles)$/.test(t.kind||'')||!lang||!u||seen[u])return;seen[u]=true;subtitles.push({url:u,language:lang,name:lang==='en'?'English':lang==='ms'?'Malay':'Indo',mimeType:/\.vtt(?:\?|$)/i.test(u)?'text/vtt':/\.(?:ass|ssa)(?:\?|$)/i.test(u)?'text/x-ssa':'application/x-subrip',headers:headers});});
        log('EXTRACT','Master HLS verified; Japanese-only playback policy; '+audio.length+' native audio renditions verified; '+subtitles.length+' published subtitle tracks');
        return {name:'AnimeWorld',provider:'animeworld',serverName:new URL(p.url).hostname,title:page.title+(type==='tv'?' • S'+season+'E'+episode:'')+' • Japanese Original',url:url+'#vueo_hls_v1=plain&audio=ja,jp,jpn,japanese',type:'hls',mimeType:'application/x-mpegURL',quality:'Auto',audioType:'original',audio:'Japanese',audioLanguage:'ja',headers:Object.assign({},headers,{'X-VUEO-HTTP-Transport':'shared'}),subtitles:subtitles.slice(0,16)};
      }catch(e){log('SOURCE','Player: '+e.message);return null;}}))).filter(Boolean);
    }
    async function extract(page){
      var frames=page.html.match(/<iframe\b[^>]*>/gi)||[],players=[];
      frames.forEach(function(tag){var u=address(attr(tag,'data-src')||attr(tag,'src'),page.url);if(!u)return;var parsed=new URL(u),m=/^\/video\/([0-9a-f]{32})\/?$/i.exec(parsed.pathname);if(m&&!players.some(function(p){return p.url===u;}))players.push({url:u,id:m[1],origin:parsed.origin});});
      if(!players.length)noMatch('No supported video player published on exact episode page');
      return extractPlayer(page,players);
    }
    var streams=[];
    try{
      var meta=await metadata(),found=await findTitle(meta),route={season:season,episode:episode},page;
      try{page=await episodePage(found,route);}catch(e){
        metadataCache('remove',catalogueKey);
        if(!found.cached)throw e;
        cache=Object.create(null);cacheKeys=[];log('CACHE','Cached episode validation failed; refresh catalogue once');
        found=await findTitle(meta);page=await episodePage(found,route);
      }
      log('MATCH',found.title+'; exact title/year');
      if(type==='tv')log('EPISODE','Requested TMDB S'+season+'E'+episode+'; verified site S'+route.season+'E'+route.episode);
      streams=await extract(page);
    }catch(e){if(e.name==='AnimeWorldNoMatch')log('NO_MATCH',e.message);else console.error('[AnimeWorld] '+e.message);}
    log('RESULT',streams.length+' sources, '+calls+' HTTP calls');return streams;
  }
  module.exports={getStreams:getStreams};
})();
if(typeof globalThis!=='undefined')globalThis.getStreams=module.exports.getStreams;

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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "animeworld");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
