/* CloudAnime AnimePahe v2.0.1 — one exact identity path; native published Kwik HLS only. */
(function(){
  'use strict';
  var SITE='https://animepahe.pw',UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  function log(stage,s){console.log('[AnimePahe] '+stage+': '+s);}
  function unavailable(s){var e=Error(s);e.name='AnimePaheUnavailable';throw e;}
  function positive(v){var n=Number(v);return Number.isInteger(n)&&n>0?n:null;}
  function decode(s){return String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));});}
  function plain(s){return decode(String(s||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
  function normal(s){s=plain(s).toLowerCase();if(typeof s.normalize==='function')s=s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'');return s.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g,'');}
  function attr(tag,key){var m=new RegExp('(?:^|\\s)'+key+'\\s*=\\s*(["\'])([\\s\\S]*?)\\1','i').exec(tag);return m?decode(m[2]):'';}
  function address(raw,base){try{var u=new URL(decode(raw),base);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
  function session(s){return typeof s==='string'&&/^[a-f0-9-]{16,64}$/i.test(s)?s:'';}
  function memo(op,key,value){
    if(typeof globalThis.vueoMetadataCache!=='function')return null;
    try{return JSON.parse(globalThis.vueoMetadataCache(JSON.stringify({op:op,key:'pahe2:'+key,value:value,ttlMs:300000})));}catch(_){return null;}
  }
  // Decode literal packed strings only. Website JavaScript is never evaluated.
  function unpack(code){
    var m=/}\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\.|(?!\5)[\s\S])*?)\5\.split\(\s*(['"])\|\7\s*\)/.exec(code);
    if(!m)return '';
    var radix=Number(m[3]),count=Number(m[4]);if(radix<2||radix>62||count>10000)return '';
    function literal(s){return s.replace(/\\(['"\\])/g,'$1').replace(/\\n/g,'\n').replace(/\\r/g,'\r');}
    var text=literal(m[2]),words=literal(m[6]).split('|');
    function base(n){return (n<radix?'':base(Math.floor(n/radix)))+(n%radix>35?String.fromCharCode(n%radix+29):(n%radix).toString(36));}
    var dict=Object.create(null);for(var n=0;n<count;n++)dict[base(n)]=words[n]||base(n);
    return text.replace(/\b\w+\b/g,function(w){return Object.prototype.hasOwnProperty.call(dict,w)?dict[w]:w;});
  }
  async function getStreams(id,type,season,episode){
    id=String(id||'');type=type==='series'?'tv':type;season=Number(season);episode=type==='movie'?1:Number(episode);
    if(!/^[1-9]\d*$/.test(id)||!['tv','movie'].includes(type)||(type==='tv'&&(!Number.isInteger(season)||season<0||!positive(episode))))return [];
    var calls=0,deadline=Date.now()+18000,streams=[];
    async function text(url,headers){
      var budget=Math.min(10000,deadline-Date.now());if(budget<=0)unavailable('Request budget exhausted');
      var timer,controller=typeof AbortController==='function'?new AbortController():null;calls++;
      try{return await Promise.race([
        fetch(url,{headers:Object.assign({'User-Agent':UA,Referer:SITE+'/',Accept:'application/json,text/html,*/*'},headers||{}),signal:controller?controller.signal:undefined}).then(async function(r){
          if(!r.ok)unavailable('HTTP '+r.status+' at '+new URL(url).hostname+'; no retry or proxy');
          var body=await r.text();if(body.length>2500000)unavailable('Response too large');
          if(/Sorry, you have been blocked|Attention Required!|Checking your browser|Just a moment\.\.\./i.test(body))unavailable('Security challenge at '+new URL(url).hostname+'; no stream extracted');
          return body;
        }),new Promise(function(_,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(Error('Request timeout at '+new URL(url).hostname));},budget);})
      ]);}finally{clearTimeout(timer);}
    }
    async function json(url,compact){
      var hit=memo('get',url);if(hit)return hit;
      var value=JSON.parse(await text(url));if(compact)value=compact(value);
      if(value&&typeof value==='object'&&!Array.isArray(value))memo('put',url,value);
      return value;
    }
    async function mapping(){
      var key='mapping:'+id+':'+type+':'+season+':'+episode,hit=memo('get',key);if(hit){log('CACHE','Exact anime mapping hit');return hit;}
      var arm=await json('https://arm.haglund.dev/api/v2/themoviedb?id='+id,function(rows){return {rows:rows};}),rows=arm.rows;
      if(!Array.isArray(rows))unavailable('Invalid ARM mapping response');
      rows=rows.filter(function(r){return r&&String(r.themoviedb)===id&&positive(r.myanimelist)&&(type==='movie'?r.media==='MOVIE'&&r['themoviedb-season']==null:r.media!=='MOVIE'&&r['themoviedb-season']!=null&&Number(r['themoviedb-season'])===season);});
      var seen=Object.create(null);rows=rows.filter(function(r){var k=[r.myanimelist,r.thetvdb,r['thetvdb-season']].join(':');if(seen[k])return false;seen[k]=true;return true;});
      if(type==='tv')rows=rows.filter(function(r){return positive(r.thetvdb)&&r['thetvdb-season']!=null&&Number(r['thetvdb-season'])===season;});
      if(!rows.length||rows.length>6)unavailable('No bounded explicit TMDB/TVDB season bridge; no episode-number guess');
      var datasets=await Promise.all(rows.map(function(r){return json('https://api.ani.zip/mappings?mal_id='+r.myanimelist,function(d){
        var es=d.episodes||{},items=[];Object.keys(es).forEach(function(k){var e=es[k];if(e)items.push({episode:e.episode,seasonNumber:e.seasonNumber,episodeNumber:e.episodeNumber,absoluteEpisodeNumber:e.absoluteEpisodeNumber,tvdbShowId:e.tvdbShowId});});
        return {mappings:d.mappings,titles:d.titles,episodes:items};
      });})),matches=[];
      datasets.forEach(function(d,index){
        var r=rows[index],m=d&&d.mappings;if(!m||type==='tv'&&m.type==='MOVIE'||Number(m.mal_id)!==Number(r.myanimelist)||String(m.themoviedb_id)!==id)return;
        var found=type==='movie'?(m.type==='MOVIE'?[{episode:1}]:[]):(d.episodes||[]).filter(function(e){return Number(m.thetvdb_id)===Number(r.thetvdb)&&Number(e.tvdbShowId)===Number(r.thetvdb)&&e.seasonNumber!=null&&Number(e.seasonNumber)===season&&Number(e.episodeNumber)===episode&&positive(e.episode);});
        if(found.length!==1)return;
        var titles=d.titles||{},aliases=Object.keys(titles).map(function(k){return titles[k];}).filter(function(t){return typeof t==='string'&&normal(t);});
        if(aliases.length)matches.push({mal:Number(r.myanimelist),episode:Number(found[0].episode),absoluteEpisode:positive(found[0].absoluteEpisodeNumber),title:titles['x-jat']||titles.en||titles.ja||aliases[0],aliases:aliases});
      });
      if(matches.length!==1)unavailable('Exact anime episode candidates='+matches.length+'; no substitute selected');
      memo('put',key,matches[0]);log('MAPPING','TMDB '+id+(type==='tv'?' S'+season+'E'+episode:' movie')+' -> MAL '+matches[0].mal+' E'+matches[0].episode+'; explicit identity/coordinates');return matches[0];
    }
    async function findAnime(mapped){
      var queries=[mapped.title],keys=mapped.aliases.map(normal),entryKey='entry:'+SITE+':'+mapped.mal,hit=memo('get',entryKey);
      if(hit&&session(hit.session)&&hit.mal===mapped.mal)return hit;
      var en=mapped.aliases.find(function(t){return /^[\x20-\x7e]+$/.test(t)&&normal(t)!==normal(mapped.title);});if(en)queries.push(en);
      for(var q=0;q<queries.length;q++){
        var result=await json(SITE+'/api?m=search&q='+encodeURIComponent(queries[q])),candidates=(result.data||[]).filter(function(v){return session(v.session)&&keys.includes(normal(v.title));});
        var used=Object.create(null);candidates=candidates.filter(function(v){if(used[v.session])return false;used[v.session]=true;return true;});
        log('SEARCH',"query='"+queries[q]+"'; exactTitleCandidates="+candidates.length);
        if(candidates.length>3)unavailable('Ambiguous site search');
        var matches=(await Promise.all(candidates.map(async function(v){
          var page=await text(SITE+'/anime/'+v.session),links=page.match(/<a\b[^>]*>/gi)||[],ids=[];
          links.forEach(function(a){var u=address(attr(a,'href'),SITE);if(!u)return;u=new URL(u);var m=/^\/anime\/(\d+)(?:\/|$)/.exec(u.pathname);if(/^(?:www\.)?myanimelist\.net$/i.test(u.hostname)&&m&&!ids.includes(Number(m[1])))ids.push(Number(m[1]));});
          return ids.length===1&&ids[0]===mapped.mal?{mal:mapped.mal,session:v.session,title:v.title}:null;
        }))).filter(Boolean);
        if(matches.length>1)unavailable('Multiple site entries publish the same MAL identity');
        if(matches.length===1){memo('put',entryKey,matches[0]);return matches[0];}
      }unavailable('No site entry with the exact published MAL identity');
    }
    async function release(entry,mapped){
      var prefix=SITE+'/api?m=release&id='+entry.session+'&sort=episode_asc&page=',first=await json(prefix+'1'),data=first;
      // The site can publish local or absolute numbering. Accept only the dataset's explicit numbers.
      var numbers=[mapped.episode];if(positive(mapped.absoluteEpisode)&&!numbers.includes(mapped.absoluteEpisode))numbers.push(mapped.absoluteEpisode);
      function exact(d){return (d.data||[]).filter(function(e){return numbers.includes(Number(e.episode))&&session(e.session)&&!/^(?:eng|english|dub)$/i.test(String(e.audio||''));});}
      var found=exact(first);
      if(!found.length){var per=positive(first.per_page),last=positive(first.last_page),page=per?Math.ceil(mapped.episode/per):0;
        if(page>1&&last&&page<=last){data=await json(prefix+page);found=exact(data);}
      }
      if(found.length!==1)unavailable('Exact published release unavailable/ambiguous: anime E'+mapped.episode);
      return found[0];
    }
    async function extract(entry,selected,mapped){
      var play=SITE+'/play/'+entry.session+'/'+selected.session,html=await text(play);
      var canonical=(html.match(/<link\b[^>]*>/gi)||[]).filter(function(t){return attr(t,'rel')==='canonical';});
      if(canonical.some(function(t){return address(attr(t,'href'),SITE)!==play;}))unavailable('Play page canonical conflicts with selected release');
      var menu=/<(?:div|section)\b[^>]*id=["']resolutionMenu["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i.exec(html);
      if(!menu)unavailable('Published resolution menu missing');
      var buttons=menu[1].match(/<button\b[^>]*>[\s\S]*?<\/button>/gi)||[],players=[],seen=Object.create(null);
      buttons.forEach(function(button){
        var language=attr(button,'data-audio')||attr(button,'data-language')||selected.audio||'',label=plain(button),isJapanese=/^(?:ja|jp|jpn|japanese)$/i.test(language)||/\b(?:sub|subbed|japanese|jpn)\b/i.test(label);
        if(language&&!/^(?:ja|jp|jpn|japanese)$/i.test(language)||/\b(?:eng|english|dub|dubbed|kor|chi)\b/i.test(label)||!isJapanese)return;
        var url=address(attr(button,'data-src'),play);if(!url)return;var u=new URL(url);
        if(!/^(?:www\.)?kwik\.(?:cx|si)$/i.test(u.hostname)||!/^\/(?:e|f)\/[a-z0-9]+\/?$/i.test(u.pathname)||seen[url])return;
        seen[url]=true;var quality=positive(attr(button,'data-resolution')),labelQuality=/(\d{3,4})p\b/i.exec(label);players.push({url:url,quality:quality?quality+'p':labelQuality?labelQuality[1]+'p':'Auto'});
      });
      if(!players.length)unavailable('No published Kwik player with original Japanese audio evidence');
      players.sort(function(a,b){return (parseInt(b.quality)||0)-(parseInt(a.quality)||0);});
      return (await Promise.all(players.slice(0,3).map(async function(p){try{
        var page=await text(p.url,{Referer:play}),scripts=page.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)||[],sources=[];
        scripts.forEach(function(script){var body=script.indexOf('eval(function(')>=0?unpack(script):script,re=/\bsource\s*=\s*(['"])(.*?)\1/g,m;
          while((m=re.exec(body))){var u=address(m[2].replace(/\\\//g,'/'),p.url);if(u&&/\.m3u8(?:\?|$)/i.test(u)&&!sources.includes(u))sources.push(u);}
        });
        if(sources.length!==1)unavailable('Kwik native source missing or ambiguous');
        var headers={'User-Agent':UA,Referer:p.url,Origin:new URL(p.url).origin},master=await text(sources[0],headers);
        if(!/^#EXTM3U(?:\r?\n|$)/.test(master.trim())||!/#EXT-X-(?:STREAM-INF|TARGETDURATION):/.test(master))unavailable('Kwik HLS response is not a playlist');
        var audio=master.split(/\r?\n/).filter(function(line){return /^#EXT-X-MEDIA:/.test(line)&&/TYPE=AUDIO(?:,|$)/.test(line);}),ja=audio.filter(function(line){return /LANGUAGE="(?:ja|jp|jpn|japanese)"/i.test(line);});
        if(audio.length&&!ja.length)unavailable('HLS audio metadata has no Japanese rendition');
        var playback=sources[0]+(audio.length?'#vueo_hls_v1=plain&audio=ja,jp,jpn,japanese':'');
        return {name:'AnimePahe',provider:'animepahe',serverName:'Kwik',title:entry.title+' • Episode '+mapped.episode+' • Japanese Original',url:playback,quality:p.quality,type:'hls',mimeType:'application/x-mpegURL',audioType:'original',audioLanguage:'ja',headers:headers,subtitles:[]};
      }catch(e){log('SOURCE',e.message);return null;}}))).filter(Boolean);
    }
    try{var mapped=await mapping(),entry=await findAnime(mapped),selected=await release(entry,mapped);log('EPISODE','Exact MAL '+mapped.mal+' E'+mapped.episode+'; published site episode '+selected.episode);streams=await extract(entry,selected,mapped);}
    catch(e){log('NO_RESULT',e.message);}
    log('RESULT',streams.length+' original-audio sources, '+calls+' HTTP calls');return streams;
  }
  module.exports={getStreams:getStreams};
})();
if(typeof globalThis!=='undefined')globalThis.getStreams=module.exports.getStreams;
