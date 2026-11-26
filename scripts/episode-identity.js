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
