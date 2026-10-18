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
      var mapped=await mapping();log('MAPPING','TMDB '+id+(type==='tv'?' S'+season+'E'+episode:' movie')+' -> AniList '+mapped.id+' E'+mapped.episode+'; '+mapped.method);
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
