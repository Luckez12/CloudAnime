/* CloudAnime AnimeSalt v2.3.0 — generic catalogue ranges and evidence-based anime mapping. */
(function () {
  "use strict";
  var SITE = "https://animesalt.cx";
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  var cache = Object.create(null), cacheKeys = [];
  function log(stage, message) { console.log("[AnimeSalt] " + stage + ": " + message); }
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
    var deadline=Date.now()+18000,calls=0,searchPages=[];
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
    function catalogueRoute(found) {
      var rows=seasonRows(found.html);
      if(!rows.length)return {season:season,episode:episode};
      // Continuous absolute ranges describe parts of ONE season, regardless of title.
      // Reset-to-one ranges remain independent seasons unless an external bridge proves otherwise.
      if(rows.length>1&&rows.some(function(r){return r.first>1;})) {
        if(season!==1)noMatch('Site uses absolute episode parts; requested later TMDB season needs a separate identity');
        var next=1;
        rows.forEach(function(r,i){
          if(!r.count||r.season!==i+1||r.post!==rows[0].post||r.first!==next)
            noMatch('Ambiguous or non-contiguous site absolute episode ranges');
          next=r.last+1;
        });
        var matches=rows.filter(function(r){return episode>=r.first&&episode<=r.last;});
        if(matches.length!==1)noMatch('Requested episode outside published site ranges');
        log('MAPPING','Continuous site ranges: TMDB S'+season+'E'+episode+' -> site S'+matches[0].season+'E'+episode);
        return {season:matches[0].season,episode:episode};
      }
      return {season:season,episode:episode};
    }
    async function animeBridge(meta) {
      var rows;
      try{rows=JSON.parse(await document('https://arm.haglund.dev/api/v2/themoviedb?id='+id));}
      catch(e){noMatch('Anime identity mapping unavailable: '+e.message);}
      if(!Array.isArray(rows))noMatch('Invalid anime identity mapping');
      var seen=Object.create(null);
      rows=rows.filter(function(r){
        if(!r||String(r.themoviedb)!==id||r.media==='MOVIE'||!positive(r.anilist)||
           r['themoviedb-season']==null||Number(r['themoviedb-season'])!==season||
           r['thetvdb-season']==null||Number(r['thetvdb-season'])!==season||!positive(r.thetvdb))return false;
        var key=r.anilist+':'+r.thetvdb;if(seen[key])return false;seen[key]=true;return true;
      });
      if(!rows.length)noMatch('No explicit ARM bridge equating requested TMDB and TVDB season');
      if(rows.length>12)noMatch('Anime mapping exceeds request budget; no candidates discarded');
      var parts=[];
      for(var offset=0;offset<rows.length;offset+=4) {
        var batch=await Promise.all(rows.slice(offset,offset+4).map(async function(r){
          var d;
          try{d=JSON.parse(await document('https://api.ani.zip/mappings?anilist_id='+r.anilist));}
          catch(e){noMatch('Anime episode mapping unavailable: '+e.message);}
          if(!d||!d.mappings||Number(d.mappings.anilist_id)!==Number(r.anilist)||
             String(d.mappings.themoviedb_id)!==id||Number(d.mappings.thetvdb_id)!==Number(r.thetvdb))
            noMatch('Anime dataset identity disagrees with ARM');
          var entries=Object.keys(d.episodes||{}).map(function(k){return d.episodes[k];}).filter(function(e){
            return e&&positive(e.episode)&&Number(e.tvdbShowId)===Number(r.thetvdb)&&
              e.seasonNumber!=null&&Number(e.seasonNumber)===season&&positive(e.episodeNumber);
          }).sort(function(a,b){return Number(a.episode)-Number(b.episode);});
          if(!entries.length||!positive(d.episodeCount)||entries.length!==Number(d.episodeCount))
            noMatch('Incomplete anime episode bridge; offsets not inferred');
          var start=Number(entries[0].episodeNumber);
          entries.forEach(function(e,i){if(Number(e.episode)!==i+1||Number(e.episodeNumber)!==start+i)noMatch('Non-contiguous anime episode bridge');});
          var titles=Object.keys(d.titles||{}).map(function(k){return d.titles[k];}).filter(function(t){return typeof t==='string'&&normal(t);});
          if(!titles.length)noMatch('Mapped anime has no verified title aliases');
          var date=String(entries[0].airDate||entries[0].airdate||'');
          return {id:Number(r.anilist),start:start,end:start+entries.length-1,count:entries.length,titles:titles,
            title:d.titles.en||d.titles['x-jat']||titles[0],year:date.slice(0,4)};
        }));
        parts=parts.concat(batch);
      }
      parts.sort(function(a,b){return a.start-b.start;});
      for(var i=1;i<parts.length;i++)if(parts[i].start<=parts[i-1].end)noMatch('Overlapping anime episode mappings');
      var matches=parts.filter(function(p){return episode>=p.start&&episode<=p.end;});
      if(matches.length!==1)noMatch('No unique mapped anime episode for requested season');
      log('MAPPING','ARM linked season + AniZip exact episode; AniList='+matches[0].id+'; local episode='+(episode-matches[0].start+1));
      return {parts:parts,target:matches[0]};
    }
    async function mappedTitle(meta,bridge) {
      var part=bridge.target;
      // Search the selected anime identity first. No suffix stripping or sequel substitution.
      var scoped={title:part.title,titles:part.titles,year:part.year,years:[part.year,meta.year],scoped:true};
      var found;
      try{found=await findTitle(scoped);}catch(e){
        if(e.name!=='AnimeSaltNoMatch'||e.message.indexOf('No exact title/year match')!==0)throw e;
        // A combined catalogue may be named after the first mapped part.
        var first=bridge.parts[0];
        if(first===part||first.start!==1)throw e;
        found=await findTitle({title:first.title,titles:first.titles,year:first.year,years:[first.year,meta.year],scoped:true});
      }
      var rows=seasonRows(found.html),keys=part.titles.map(normal);
      if(rows.length===1&&keys.includes(normal(found.title))&&rows[0].first===1&&rows[0].count&&rows[0].count<=part.count) {
        var local=episode-part.start+1;
        if(local>rows[0].last)noMatch('Mapped episode not yet published');
        return {found:found,route:{season:rows[0].season,episode:local}};
      }
      // Combined reset-numbered parts must agree with EVERY mapped preceding part.
      if(rows.length!==bridge.parts.length||bridge.parts[0].start!==1)
        noMatch('Combined site catalogue has no complete anime part bridge');
      var index=bridge.parts.indexOf(part);
      rows.forEach(function(r,i){var p=bridge.parts[i];
        if(!r.count||r.season!==i+1||r.first!==1||r.post!==rows[0].post||
           (i>0&&p.start!==bridge.parts[i-1].end+1)||r.count>p.count||
           (i<rows.length-1&&r.count!==p.count))noMatch('Site part counts disagree with anime episode bridge');
      });
      var local=episode-part.start+1;
      if(local>rows[index].last)noMatch('Mapped episode not yet published');
      return {found:found,route:{season:rows[index].season,episode:local}};
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
    async function extractRavok(page,players){
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
    function decryptMega(data) {
      if(!data||typeof data!=='object')throw Error('Invalid source payload');
      if(typeof data.enc!=='string')return data;
      if(data.enc.length>1000000||!/^[A-Za-z0-9_+/=-]+$/.test(data.enc))throw Error('Invalid source ciphertext');
      var C=require('crypto-js');
      // Public MegaPlay AES-CBC codec, verified against the current website payload.
      var key=C.enc.Hex.parse(C.enc.Utf8.parse('i?LMTAx0Q6,:}50U').toString(C.enc.Hex).padEnd(64,'0'));
      var plain=C.AES.decrypt({ciphertext:C.enc.Base64.parse(data.enc.replace(/-/g,'+').replace(/_/g,'/'))},key,{iv:C.enc.Utf8.parse("W0;27ToaUpl_P%'c"),mode:C.mode.CBC,padding:C.pad.Pkcs7}).toString(C.enc.Utf8);
      var decoded=JSON.parse(plain);
      if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))throw Error('Invalid decrypted source payload');
      return Object.assign({},data,decoded);
    }
    async function extractMega(page,p) {
      var html=await text(p.url,{Referer:page.url});
      if(!/\btype\s*:\s*["']sub["']/.test(html))throw Error('Embed did not confirm Sub channel');
      var tags=html.match(/<[^!][^>]*>/g)||[],player=tags.find(function(t){return attr(t,'id')==='megaplay-player';});
      var playerId=player&&attr(player,'data-id'),realId=player&&attr(player,'data-realid');
      if(!/^\d{1,12}$/.test(playerId||'')||!positive(playerId))throw Error('Episode player unavailable');
      if(!/^\d{1,12}$/.test(realId||'')||positive(realId)!==positive(p.realId))throw Error('Embed episode identity mismatch');
      var api=p.origin+'/stream/getSources?id='+playerId+'&id='+playerId,hint=new URL(p.url).searchParams.get('s');
      if(hint&&/^[a-z0-9_-]{1,32}$/i.test(hint))api+='&s='+encodeURIComponent(hint);
      var data=decryptMega(JSON.parse(await text(api,{Referer:p.url,Origin:p.origin,'X-Requested-With':'XMLHttpRequest'})));
      var raw=[];
      if(typeof data.file==='string')raw.push(data.file);
      if(data.sources)raw=raw.concat(Array.isArray(data.sources)?data.sources:[data.sources]);
      var seen=Object.create(null),sources=raw.map(function(v){return address(typeof v==='string'?v:v&&(v.file||v.url),p.url);}).filter(function(u){if(!u||seen[u])return false;seen[u]=true;return true;}).slice(0,4);
      if(!sources.length)throw Error('No source URLs in decoded response');
      var headers={'User-Agent':UA,Referer:p.origin+'/',Origin:p.origin},selected=null,health=null,healthTried=false;
      async function verify(url) {
        var body=(await text(url,headers)).replace(/^\uFEFF/,'').trim();
        if(!/^#EXTM3U(?:\r?\n|$)/.test(body)||!/#EXT-X-STREAM-INF:|#EXTINF:/.test(body))throw Error('Source response is not playable HLS');
        var refs=body.split(/\r?\n/).map(function(v){return v.trim();}).filter(function(v){return v&&v[0]!=='#';});
        if(!refs.length||refs.some(function(v){return !address(v,url);}))throw Error('Invalid HLS media references');
        var audio=body.split(/\r?\n/).filter(function(l){return /^#EXT-X-MEDIA:/.test(l)&&hlsAttr(l,'TYPE')==='AUDIO';}),filter=false;
        if(audio.length){var ja=audio.filter(function(l){return /^(?:ja|jp|jpn|japanese)$/i.test(hlsAttr(l,'LANGUAGE'));});if(ja.length!==1||!address(hlsAttr(ja[0],'URI'),url))throw Error('No unique Japanese HLS audio rendition');filter=true;}
        return {url:url,master:/#EXT-X-STREAM-INF:/.test(body),filterAudio:filter};
      }
      for(var i=0;i<sources.length;i++) {
        var candidate=null;
        try{candidate=await verify(sources[i]);}catch(error){
          log('SOURCE','MegaPlay original HLS: '+error.message);
          if(!healthTried){healthTried=true;try{health=JSON.parse(await text(p.origin+'/lib/check_domain.json',{Referer:p.url}));}catch(e){log('CDN','MegaPlay health unavailable: '+e.message);}}
          var host=health&&typeof health.fallback==='string'?health.fallback.toLowerCase():'',original=new URL(sources[i]);
          if(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host)&&host!==original.hostname){
            try{candidate=await verify('https://'+host+original.pathname+original.search);log('CDN','MegaPlay website-declared fallback HLS verified');}catch(e){log('SOURCE','MegaPlay fallback HLS: '+e.message);}
          }
        }
        if(candidate&&(!selected||candidate.master))selected=candidate;
        if(selected&&selected.master)break;
      }
      if(!selected)throw Error('No verified MegaPlay HLS source');
      var tracks=Array.isArray(data.tracks)?data.tracks:[],subtitles=[],trackSeen=Object.create(null);
      tracks.forEach(function(t){if(!t||!/^(?:captions|subtitles)$/.test(t.kind||''))return;var lang=language(t),u=address(t.file||t.url,p.url);if(!lang||!u||trackSeen[u])return;trackSeen[u]=true;var path=new URL(u).pathname;subtitles.push({url:u,language:lang,name:lang==='en'?'English':lang==='ms'?'Malay':'Indo',mimeType:/\.(?:ass|ssa)$/i.test(path)?'text/x-ssa':/\.srt$/i.test(path)?'application/x-subrip':'text/vtt',headers:headers});});
      log('EXTRACT','MegaPlay '+(selected.master?'master':'media')+' HLS verified; exact Sub embed; '+subtitles.length+' subtitle tracks');
      return [{name:'AnimeSalt',provider:'animesalt',serverName:'MegaPlay',title:page.title+(type==='tv'?' • S'+season+'E'+episode:'')+' • Japanese Sub',url:selected.url+(selected.filterAudio?'#vueo_hls_v1=plain&audio=ja,jp,jpn,japanese':''),type:'hls',mimeType:'application/x-mpegURL',quality:'Auto',audioType:'sub',audioLanguage:'ja',headers:Object.assign({},headers,{'X-VUEO-HTTP-Transport':'shared'}),subtitles:subtitles.slice(0,16)}];
    }
    async function extract(page) {
      var frames=page.html.match(/<iframe\b[^>]*>/gi)||[],ravok=[],mega=[],hosts=[];
      frames.forEach(function(tag){
        var url=address(attr(tag,'data-src')||attr(tag,'src'),page.url);if(!url)return;
        var u=new URL(url),r=/^\/video\/([0-9a-f]{32})\/?$/i.exec(u.pathname),m=/^\/stream\/s-\d+\/(\d{1,12})\/sub\/?$/.exec(u.pathname);
        if(!hosts.includes(u.hostname))hosts.push(u.hostname);
        if(r&&!ravok.some(function(p){return p.url===url;}))ravok.push({url:url,id:r[1],origin:u.origin});
        if(u.hostname==='megaplay.buzz'&&m&&!mega.some(function(p){return p.url===url;}))mega.push({url:url,realId:m[1],origin:u.origin});
      });
      if(!ravok.length&&!mega.length)noMatch('No supported Ravok or MegaPlay Sub player; site player hosts='+hosts.join(','));
      log('PLAYERS','Ravok='+ravok.length+'; MegaPlay Sub='+mega.length+'; Dub embeds excluded');
      var jobs=[];
      if(ravok.length)jobs.push(extractRavok(page,ravok));
      mega.slice(0,2).forEach(function(p){jobs.push(extractMega(page,p).catch(function(e){log('SOURCE','MegaPlay: '+e.message);return [];}));});
      var groups=await Promise.all(jobs),all=[],seen=Object.create(null);
      groups.forEach(function(group){group.forEach(function(s){if(!seen[s.url]){seen[s.url]=true;all.push(s);}});});
      return all;
    }
    var streams=[];
    try{
      var meta=await metadata(),found,route,page;
      try{
        found=await findTitle(meta);route=type==='tv'?catalogueRoute(found):{season:season,episode:episode};
        page=await episodePage(found,route);
      }catch(e){
        var missing=e.name==='AnimeSaltNoMatch'&&/^(?:No exact title\/year match|Exact requested site season unavailable|Exact site episode unavailable|Site uses absolute episode parts)/.test(e.message);
        if(!missing||type!=='tv'||season<1)throw e;
        var bridge=await animeBridge(meta),mapped=await mappedTitle(meta,bridge);found=mapped.found;route=mapped.route;
        page=await episodePage(found,route);
      }
      log('MATCH',found.title+'; title identity and episode route verified');
      if(type==='tv')log('EPISODE','Requested TMDB S'+season+'E'+episode+'; verified site S'+route.season+'E'+route.episode);
      streams=await extract(page);
    }catch(e){if(e.name==='AnimeSaltNoMatch')log('NO_MATCH',e.message);else console.error('[AnimeSalt] '+e.message);}
    log('RESULT',streams.length+' sources, '+calls+' HTTP calls');return streams;
  }
  module.exports={getStreams:getStreams};
})();
if(typeof globalThis!=='undefined')globalThis.getStreams=module.exports.getStreams;
