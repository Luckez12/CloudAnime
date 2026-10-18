/* CloudAnime AnimeSalt v2.1.1 — exact title/year and episode, Ravok Japanese HLS. */
(function () {
  "use strict";
  var SITE = "https://animesalt.cx";
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  var cache = Object.create(null), cacheKeys = [];
  function log(stage, message) { console.log("[AnimeSalt] " + stage + ": " + message); }
  // Confirmed against TMDB season counts and the site's part lists on 2026-10-18.
  // Do not derive split offsets from fuzzy titles or assume a fixed 12/13-episode cour.
  var VERIFIED_SEASON_MAPPINGS = {
    '73223:1': {rootTitle:'Black Clover',rootYear:'2017',title:'Black Clover',seasonYear:'2017',
      parts:[{season:1,start:1,end:51,siteStart:1},{season:2,start:52,end:102,siteStart:52},{season:3,start:103,end:154,siteStart:103},{season:4,start:155,end:170,siteStart:155}]},
    '30984:2': {rootTitle:'Bleach',rootYear:'2004',title:'Bleach: Thousand-Year Blood War',seasonYear:'2022',
      parts:[{season:1,start:1,end:13},{season:2,start:14,end:26},{season:3,start:27,end:40},{season:4,start:41,end:50}]}
  };
  function noMatch(message) {var e=new Error(message);e.name='AnimeSaltNoMatch';throw e;}
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
  function links(html) {var tags=html.match(/<a\b[^>]*>/gi)||[];return tags.map(function(tag){return {url:address(attr(tag,'href'),SITE),tag:tag};}).filter(function(v){return !!v.url;});}
  function episodes(html,season,episode) {
    var matches=[],articles=html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi)||[];
    articles.forEach(function(article){
      var h=/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(article);
      var caption=h&&/(?:^|\s)(\d+)x(\d+)\s*$/i.exec(textContent(h[1]));
      // Episode names may contain no coordinates. Resolve exact numbers from
      // the site's own link, then confirm them again on the episode page.
      links(article).forEach(function(v){
        var u=new URL(v.url),m=/^\/episode\/[^/]+-(\d+)x(\d+)\/?$/.exec(u.pathname);
        if(u.origin!==SITE||!m||Number(m[1])!==season||Number(m[2])!==episode)return;
        if(caption&&(Number(caption[1])!==season||Number(caption[2])!==episode))return;
        if(!matches.includes(v.url))matches.push(v.url);
      });
    });
    return matches.length===1?matches[0]:'';
  }
  // Dean Edwards string substitution only: packed website code is never evaluated.
  function unpack(code) {
    var m=/}\((['"])([\s\S]*?)\1,\s*(\d+),\s*(\d+),\s*(['"])([\s\S]*?)\5\.split\((['"])\|\7\)/.exec(code);
    if(!m)throw Error('Ravok player configuration unavailable');
    var radix=Number(m[3]),count=Number(m[4]);if(radix<2||radix>62||count<1||count>5000)throw Error('Unsupported packed player');
    var payload=m[2].replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\\\/g,'\\'),words=m[6].split('|'),dict=Object.create(null);
    function token(n){return (n<radix?'':token(Math.floor(n/radix)))+(n%radix>35?String.fromCharCode(n%radix+29):(n%radix).toString(36));}
    while(count--)dict[token(count)]=words[count]||token(count);
    return payload.replace(/\b\w+\b/g,function(w){return Object.prototype.hasOwnProperty.call(dict,w)?dict[w]:w;});
  }
  function settings(html,id) {
    var plain=html.includes('VPlayer("')?html:unpack(html);
    var m=new RegExp('VPlayer\\("'+id+'",(\\{[\\s\\S]*?\\}),true(?:,source)?\\)').exec(plain);
    if(!m)throw Error('Ravok video identity/configuration mismatch');
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
    var deadline=Date.now()+45000,calls=0,searchPages=[];
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
      var url='https://api.themoviedb.org/3/'+type+'/'+id+'?append_to_response=alternative_titles,external_ids',context=typeof globalThis!=='undefined'&&globalThis.VUEO_DISCOVERY_CONTEXT;
      if(!context&&typeof globalThis.vueoDiscoveryContext==='function'){context=await globalThis.vueoDiscoveryContext(url);if(typeof context==='string')context=JSON.parse(context);}
      var tmdb=context&&(context.tmdb||context),expected=context&&(context.tmdbId||tmdb&&tmdb.id);
      if(expected!=null&&String(expected)!==id)throw Error('Shared metadata TMDB ID mismatch');
      if(tmdb&&(tmdb.title||tmdb.name)) {
        var title=tmdb.title||tmdb.name,year=String(tmdb.first_air_date||tmdb.release_date||context.year||'').slice(0,4),titles=[title,tmdb.original_name,tmdb.original_title].concat(context.aliases||[]),alt=tmdb.alternative_titles||{};
        (alt.results||alt.titles||[]).forEach(function(v){titles.push(v.title);});
        return {title:title,original:tmdb.original_name||tmdb.original_title,year:year,titles:titleNames(title,tmdb.original_name||tmdb.original_title,titles)};
      }
      // Retain the upstream provider's public metadata fallback; VUEO normally supplies this data.
      var d=JSON.parse(await text(url+'&api_key=1865f43a0549ca50d341dd9ab8b29f49'));
      if(String(d.id)!==id)throw Error('TMDB metadata identity mismatch');
      var aliases=[d.title||d.name,d.original_title||d.original_name],alt=d.alternative_titles||{};
      (alt.results||alt.titles||[]).forEach(function(v){aliases.push(v.title);});
      return {title:d.title||d.name,original:d.original_title||d.original_name,year:String(d.first_air_date||d.release_date||'').slice(0,4),titles:titleNames(d.title||d.name,d.original_title||d.original_name,aliases)};
    }
    async function findTitle(meta){
      if(!meta.title||!/^\d{4}$/.test(meta.year))throw Error('Verified title/year metadata required');
      var names=meta.titles.filter(function(v){return typeof v==='string'&&normal(v);}),keys=names.map(normal),attempts=[meta.title];
      names.forEach(function(t){if(!attempts.some(function(q){return normal(q)===normal(t);}))attempts.push(t);});
      var seen=Object.create(null),plans=[];
      if(meta.scoped)searchPages.forEach(function(p){plans.push(p);});
      attempts.slice(0,2).forEach(function(query){plans.push({query:query});});
      for(var q=0;q<plans.length;q++) {
        var plan=plans[q],html=plan.html||await document(SITE+'/?s='+encodeURIComponent(plan.query)),candidates=[],siteTitles=[];
        if(!plan.html)searchPages.push({query:plan.query,html:html});
        (html.match(/<article\b[^>]*>[\s\S]*?<\/article>/gi)||[]).forEach(function(article){
          var h=/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(article);if(!h)return;siteTitles.push(textContent(h[1]));if(!keys.includes(normal(h[1])))return;
          links(article).forEach(function(a){var u=new URL(a.url);if(u.origin!==SITE||!(type==='tv'?/^\/series\//:/^\/movies\//).test(u.pathname)||seen[a.url])return;seen[a.url]=true;candidates.push(a.url);});
        });
        log('SEARCH',"query='"+plan.query+"'; requestedYear="+meta.year+'; exactCandidates='+candidates.length+'; siteTitles='+siteTitles.slice(0,5).join(' | '));
        if(candidates.length>3)noMatch('Ambiguous title search; skipped');
        var matches=(await Promise.all(candidates.map(async function(url){var page=await document(url),h=/<h1\b[^>]*>[\s\S]*?<\/h1>/i.exec(page);if(!h||!keys.includes(normal(heading(page))))return null;var end=page.indexOf('<!-- Overview',h.index),region=page.slice(h.index,end>h.index?end:h.index+16000),years=textContent(region).match(/\b(?:19|20)\d{2}\b/g)||[];var unique=years.filter(function(y,i){return years.indexOf(y)===i;});if(unique.length!==1||!(meta.years||[meta.year]).includes(unique[0])){log('REJECT',heading(page)+'; requestedYear='+meta.year+'; siteYears='+unique.join(','));return null;}return {url:url,html:page,title:heading(page)};}))).filter(Boolean);
        if(matches.length>1)noMatch('Multiple exact title/year matches; skipped');
        if(matches.length===1)return matches[0];
      }noMatch('No exact title/year match for '+meta.title+' ('+meta.year+'); no substitute series selected');
    }
    function seasonRows(html) {
      return (html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi)||[]).map(function(a){
        var tag=a.slice(0,a.indexOf('>')+1);
        if(!/(?:^|\s)season-btn(?:\s|$)/.test(attr(tag,'class')))return null;
        var number=positive(attr(tag,'data-season')),post=attr(tag,'data-post');
        var label=textContent(a),count=/\bSeason\s+\d+\s*[•·]\s*(\d+)\s*-\s*(\d+)\s*\((\d+)\)/i.exec(label);
        var first=count?positive(count[1]):null,last=count?positive(count[2]):null;
        var size=first&&last&&last-first+1===Number(count[3])?positive(count[3]):null;
        return number&&/^\d+$/.test(post)?{season:number,post:post,count:size,first:first,last:last,tag:tag}:null;
      }).filter(Boolean).sort(function(a,b){return a.season-b.season;});
    }
    function scopedSeason(meta) {
      var entry=VERIFIED_SEASON_MAPPINGS[id+':'+season];
      if(!entry)noMatch('No verified split-series mapping for TMDB '+id+' S'+season);
      if(meta.year!==entry.rootYear||![meta.title,meta.original].some(function(t){return normal(t)===normal(entry.rootTitle);}))
        noMatch('Split-series mapping does not match supplied series title/year');
      var target=-1;
      entry.parts.forEach(function(p,i){if(episode>=p.start&&episode<=p.end)target=i;});
      if(target<0)noMatch('Requested episode is outside the verified split-series mapping');
      return {title:entry.title,year:meta.year,years:[meta.year,entry.seasonYear],titles:[entry.title],scoped:true,parts:entry.parts,target:target};
    }
    function mappedRoute(found,scoped) {
      var rows=seasonRows(found.html),target=scoped.target,parts=scoped.parts;
      if(rows.length!==parts.length)noMatch('Site part structure changed; split mapping needs verification');
      for(var i=0;i<rows.length;i++) {
        var size=parts[i].end-parts[i].start+1;
        if(rows[i].season!==parts[i].season||!rows[i].count||rows[i].first!==(parts[i].siteStart||1))noMatch('Site part numbering/counts not verified');
        if(rows[i].post!==rows[0].post)noMatch('Site parts do not share one series identity');
        if(i<parts.length-1&&rows[i].count!==size)noMatch('Closed site part count disagrees with verified mapping');
        if(rows[i].count>size)noMatch('Site part exceeds verified episode range');
      }
      var local=episode-parts[target].start+(parts[target].siteStart||1);
      if(local<rows[target].first||local>rows[target].last)noMatch('Mapped episode not available on site: S'+rows[target].season+'E'+local);
      log('MAPPING','TMDB S'+season+'E'+episode+' -> AnimeSalt S'+rows[target].season+'E'+local+'; series='+found.title+'; verified offsets and preceding part counts');
      return {season:rows[target].season,episode:local};
    }
    async function episodePage(found,route) {
      if(type==='movie')return found;
      var targetSeason=route.season,targetEpisode=route.episode;
      var seasonTags=(found.html.match(/<a\b[^>]*>/gi)||[]).filter(function(t){return /(?:^|\s)season-btn(?:\s|$)/.test(attr(t,'class'))&&attr(t,'data-season')!==''&&Number(attr(t,'data-season'))===targetSeason;});
      if(seasonTags.length!==1)noMatch('Exact requested site season unavailable: S'+targetSeason);
      var url=episodes(found.html,targetSeason,targetEpisode);
      if(!url){var post=attr(seasonTags[0],'data-post');if(!/^\d+$/.test(post))throw Error('Missing season identity');var html=await text(SITE+'/wp-admin/admin-ajax.php?action=action_select_season&season='+targetSeason+'&post='+post,{'X-Requested-With':'XMLHttpRequest',Referer:found.url});url=episodes(html,targetSeason,targetEpisode);}
      if(!url)noMatch('Exact site episode unavailable: S'+targetSeason+'E'+targetEpisode);
      var page=await text(url),h=/<h1\b[^>]*>[\s\S]*?<\/h1>/i.exec(page);
      if(!h||normal(heading(page))!==normal(found.title))throw Error('Episode title mismatch');
      var m=/Season\s+(\d+)\s+Episode\s+(\d+)\b/i.exec(textContent(page.slice(h.index,h.index+2500)));
      if(!m||Number(m[1])!==targetSeason||Number(m[2])!==targetEpisode)throw Error('Episode number mismatch');
      return {url:url,html:page,title:found.title};
    }
    async function extract(page){
      var frames=page.html.match(/<iframe\b[^>]*>/gi)||[],players=[];
      frames.forEach(function(tag){var url=address(attr(tag,'data-src')||attr(tag,'src'),page.url);if(!url)return;var u=new URL(url),m=/^\/video\/([0-9a-f]{32})\/?$/i.exec(u.pathname);if(m&&!players.some(function(p){return p.url===url;}))players.push({url:url,id:m[1],origin:u.origin});});
      if(!players.length){var hosts=[];frames.forEach(function(t){var u=address(attr(t,'data-src')||attr(t,'src'),page.url);if(u){var host=new URL(u).hostname;if(!hosts.includes(host))hosts.push(host);}});noMatch('No supported Ravok player on this episode; site player hosts='+hosts.join(',')+'; other servers are not extracted');}
      return (await Promise.all(players.slice(0,2).map(async function(p){try{
        var headers={'User-Agent':UA,Referer:p.url,Origin:p.origin};
        var results=await Promise.all([text(p.url,{Referer:page.url}),text(p.origin+'/player/index.php?data='+p.id+'&do=getVideo',Object.assign({},headers,{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'}),'hash='+p.id+'&r='+encodeURIComponent(page.url))]);
        var config=settings(results[0],p.id),data=JSON.parse(results[1]),url=address(data.videoSource,p.url);
        if(data.hls!==true||!url)throw Error('No native HLS source');
        var master=await text(url,headers);
        if(!/^#EXTM3U(?:\r?\n|$)/.test(master.trim())||!/#EXT-X-STREAM-INF:/.test(master))throw Error('Invalid master HLS');
        var japanese=master.split(/\r?\n/).filter(function(l){return /^#EXT-X-MEDIA:/.test(l)&&hlsAttr(l,'TYPE')==='AUDIO'&&/^(?:ja|jp|jpn|japanese)$/i.test(hlsAttr(l,'LANGUAGE'));});
        if(japanese.length!==1||!address(hlsAttr(japanese[0],'URI'),url))throw Error('No unique Japanese audio rendition');
        var tracks=Array.isArray(config.tracks)?config.tracks:[],seen=Object.create(null),subtitles=[];
        tracks.forEach(function(t){var lang=language(t),u=address(t.file||t.url,p.url);if(!/^(?:captions|subtitles)$/.test(t.kind||'')||!lang||!u||seen[u])return;seen[u]=true;subtitles.push({url:u,language:lang,name:lang==='en'?'English':lang==='ms'?'Malay':'Indo',mimeType:/\.vtt(?:\?|$)/i.test(u)?'text/vtt':/\.(?:ass|ssa)(?:\?|$)/i.test(u)?'text/x-ssa':'application/x-subrip',headers:headers});});
        log('EXTRACT','Ravok master HLS verified; Japanese rendition selected; '+subtitles.length+' subtitle tracks');
        return {name:'AnimeSalt',provider:'animesalt',serverName:'Ravok',title:page.title+(type==='tv'?' • S'+season+'E'+episode:'')+' • Japanese Sub',url:url+'#vueo_hls_v1=plain&audio=ja,jp,jpn,japanese',type:'hls',mimeType:'application/x-mpegURL',quality:'Auto',audioType:'sub',audioLanguage:'ja',headers:Object.assign({},headers,{'X-VUEO-HTTP-Transport':'shared'}),subtitles:subtitles.slice(0,16)};
      }catch(e){log('SOURCE','Ravok: '+e.message);return null;}}))).filter(Boolean);
    }
    var streams=[];
    try{
      var meta=await metadata(),found,route={season:season,episode:episode};
      try{found=await findTitle(meta);}catch(e){
        if(e.name!=='AnimeSaltNoMatch'||e.message.indexOf('No exact title/year match')!==0||type!=='tv'||season<=1)throw e;
        deadline+=15000;
        log('MAPPING','Main title unavailable; checking verified requested-season mapping');
        var scoped=scopedSeason(meta);found=await findTitle(scoped);route=mappedRoute(found,scoped);
      }
      if(!scoped&&VERIFIED_SEASON_MAPPINGS[id+':'+season]){var direct=scopedSeason(meta);if(normal(found.title)!==normal(direct.title))noMatch('Verified mapped series title mismatch');route=mappedRoute(found,direct);if(route.season!==season||route.episode!==episode)deadline+=15000;}
      log('MATCH',found.title+' ('+meta.year+'); '+(route.season===season&&route.episode===episode?'exact title/year':'season-scoped mapping'));
      var page=await episodePage(found,route);
      if(type==='tv')log('EPISODE','Requested TMDB S'+season+'E'+episode+'; verified site S'+route.season+'E'+route.episode);
      streams=await extract(page);
    }catch(e){if(e.name==='AnimeSaltNoMatch')log('NO_MATCH',e.message);else console.error('[AnimeSalt] '+e.message);}
    log('RESULT',streams.length+' sources, '+calls+' HTTP calls');return streams;
  }
  module.exports={getStreams:getStreams};
})();
if(typeof globalThis!=='undefined')globalThis.getStreams=module.exports.getStreams;
