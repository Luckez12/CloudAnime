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
