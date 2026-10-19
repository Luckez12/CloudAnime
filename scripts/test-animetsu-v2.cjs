const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(require('path').resolve(__dirname,'../providers/animetsu.js'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const row={themoviedb:100,'themoviedb-season':1,thetvdb:300,'thetvdb-season':1,anilist:200,myanimelist:400,media:'TV',imdb:'tt12345'};
const zip={mappings:{themoviedb_id:100,mal_id:400,anilist_id:200,thetvdb_id:300,type:'TV'},titles:{en:'Fixture Anime',ja:'テスト'},episodes:{1:{episode:'1',airdate:'2025-01-01',tvdbShowId:300,tvdbId:301,seasonNumber:1,episodeNumber:1,absoluteEpisodeNumber:1}},episodeCount:1};
const base={row,zip,ggDelay:5,detail:{id:100,name:'Fixture Anime',original_name:'テスト',original_language:'ja'},catalogue:{data:{Page:{media:[{id:200,idMal:400,countryOfOrigin:'JP',format:'TV',title:{english:'Fixture Anime',native:'テスト'},startDate:{year:2025,month:1,day:1}}]}}},jikan:{data:[{mal_id:400,type:'TV',title:'Fixture Anime',title_english:'Fixture Anime',title_japanese:'テスト',aired:{from:'2025-01-01T00:00:00Z'}}]},season:{episodes:[{season_number:1,episode_number:1,air_date:'2025-01-01'}]},bee:{success:true,sub:{streams:[{url:'https://media.test/master',type:'hls'}],subtitles:[{url:'https://media.test/en',label:'English'},{url:'https://media.test/ms',lang:'ms'},{url:'https://media.test/id',language:'Indonesian'},{url:'https://media.test/fr',label:'French'}],intro:{start:10,end:20}}},gg:{anilistId:200,episode:1,audio:'sub',streams:[{url:'https://gg.test/video.mp4',proxied_url:'/proxy?url=fixture',type:'mp4',quality:'1080p',audio:'sub',isActive:true}]},master:'#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nsegment.ts\n',mp4:'\x00\x00\x00 ftypisom',rangeStatus:206,rangeHeaders:{'content-range':'bytes 0-511/50000','content-length':'512'},context:{tmdbId:'100',mediaType:'tv',tmdb:{id:100,original_language:'ja'}}};
async function run(change={},args=['100','tv',1,1],memo){
 const d=Object.assign(clone(base),change),calls=[],logs=[];
 function response(data,status=200,headers={}){const body=typeof data==='string'?data:JSON.stringify(data);return {ok:status>=200&&status<300,status,headers:{get:k=>headers[k.toLowerCase()]||null},text:async()=>body,json:async()=>JSON.parse(body)}}
 const ctx={module:{exports:{}},URL,AbortController:d.noAbort?undefined:AbortController,setTimeout,clearTimeout,console:{log:x=>logs.push(x)},VUEO_DISCOVERY_CONTEXT:d.context,fetch:async(u,o={})=>{
  calls.push({u,o});
  const delay=u.includes('api.aniclover')?d.beeDelay:u.includes('api.animetsu.site/watch')?d.ggDelay:0;
  if(delay)await new Promise((resolve,reject)=>{const t=setTimeout(resolve,delay);if(o.signal)o.signal.addEventListener('abort',()=>{clearTimeout(t);reject(Error('aborted'))},{once:true});});
  assert(!u.includes('animetsu.live'));assert(!/\/dub\//.test(u));
  if(u.includes('arm.haglund.dev'))return response(d.armRows||[d.row]);
  if(u.includes('api.ani.zip'))return response(u.includes('mal_id=401')&&d.extraZip?d.extraZip:d.zip);
  if(u.includes('api.themoviedb.org/3/tv/100/season/'))return response(d.season);
  if(u.includes('api.themoviedb.org/3/')&&d.detailStatus)return response({},d.detailStatus);
  if(u.includes('api.themoviedb.org/3/'))return response({...d.detail,original_language:d.origin||d.detail.original_language});
  if(u==='https://graphql.anilist.co'){if(d.catalogueDelay)await new Promise(resolve=>setTimeout(resolve,d.catalogueDelay));return response(d.catalogue,d.catalogueStatus||200);}
  if(u.includes('api.jikan.moe/v4/anime?q='))return response(d.jikan);
  if(u.includes('v3-cinemeta'))return response(d.cinemeta||{meta:{videos:[]}});
  if(u.includes('api.aniclover.cc'))return response(d.bee,u.includes('/'+d.failedAni+'/')?503:d.beeStatus||200);
  if(u.includes('api.animetsu.site/watch'))return response(d.gg,u.includes('/'+d.failedAni+'/')?503:d.ggStatus||200);
  if(u==='https://media.test/master')return response(d.master);
  if(u.includes('/proxy?')||u==='https://gg.test/video.mp4'){assert.equal(o.headers.Range,'bytes=0-511');return response(d.mp4,d.rangeStatus,d.rangeHeaders)}
  throw Error('Unexpected request '+u);
 }};
 if(memo)ctx.vueoMetadataCache=s=>{const q=JSON.parse(s);if(q.op==='put')memo.set(q.key,q.value);return JSON.stringify(q.op==='get'?memo.get(q.key)||null:q.value)};
 vm.createContext(ctx);vm.runInContext(code,ctx);const streams=await ctx.module.exports.getStreams(...args);return {streams,calls,logs};
}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name)}
(async()=>{
 await test('Shared VUEO title avoids a new TMDB detail fetch',async()=>{const c=clone(base.context);c.tmdb.name='Fixture Anime';const r=await run({context:c});assert(r.streams.length);assert(!r.calls.some(x=>x.u.includes('api.themoviedb')))});
 await test('Unique title goes directly to sources without ARM/AniZip/season metadata',async()=>{const r=await run();assert.equal(r.streams.length,1);assert(!r.calls.some(x=>x.u.includes('arm.haglund')||x.u.includes('api.ani.zip')||x.u.includes('/season/')))});
 await test('Old origin cache cannot reject a successful title route',async()=>{const memo=new Map([['animetsu201:origin:200',{countryOfOrigin:'',mal:'400'}]]);assert.equal((await run({},undefined,memo)).streams.length,1)});
 await test('Original-language metadata is not a mandatory search gate',async()=>{const d=clone(base.detail);delete d.original_language;assert.equal((await run({detail:d})).streams.length,1)});
 await test('Country metadata is not a mandatory search gate',async()=>{const a=clone(base.catalogue);delete a.data.Page.media[0].countryOfOrigin;assert.equal((await run({catalogue:a})).streams.length,1)});
 await test('Confirmed title ID cache skips metadata and search on next episode',async()=>{const memo=new Map();await run({},undefined,memo);const r=await run({},['100','tv',1,2],memo);assert(r.streams.length);assert(r.calls.every(x=>x.u.includes('api.aniclover')||x.u.includes('api.animetsu.site')||x.u.includes('media.test')))});
 await test('Exact episode cache skips search on repeat',async()=>{const memo=new Map();await run({},undefined,memo);const r=await run({},undefined,memo);assert(r.streams.length);assert(!r.calls.some(x=>x.u.includes('graphql.anilist')))});
 await test('Jikan catalogue fallback needs only direct MAL-to-AniList lookup',async()=>{const r=await run({catalogueStatus:403});assert(r.streams.length);assert(r.calls.some(x=>x.u.includes('api.jikan')));assert.equal(r.calls.filter(x=>x.u.includes('api.ani.zip')).length,1);assert(!r.calls.some(x=>x.u.includes('arm.haglund')))});
 await test('Ambiguous title uses mapping only after search',async()=>{const a=clone(base.catalogue);a.data.Page.media.push({...a.data.Page.media[0],id:201,idMal:401});const r=await run({catalogue:a});assert(r.streams.length);const q=r.calls.findIndex(x=>x.u.includes('graphql.anilist')),m=r.calls.findIndex(x=>x.u.includes('arm.haglund'));assert(q>=0&&m>q)});
 await test('Missing title result falls back to verified mapping',async()=>{const r=await run({catalogue:{data:{Page:{media:[]}}},jikan:{data:[]}});assert(r.streams.length);assert(r.calls.some(x=>x.u.includes('arm.haglund')))});
 await test('Unavailable detail metadata still permits mapping fallback',async()=>{const r=await run({detailStatus:503});assert(r.streams.length);assert(r.calls.some(x=>x.u.includes('arm.haglund')))});
 await test('Season two cannot accidentally use unsuffixed first-season title',async()=>{const r=await run({},['100','tv',2,1]);assert.equal(r.streams.length,0);assert(!r.calls.some(x=>x.u.includes('api.aniclover')))});
 await test('Exact season-two title directly selects season-two source ID',async()=>{const a=clone(base.catalogue);a.data.Page.media[0].title={english:'Fixture Anime 2nd Season'};const r=await run({catalogue:a},['100','tv',2,1]);assert(r.streams.length);assert(!r.calls.some(x=>x.u.includes('arm.haglund')))});
 await test('Unrelated search result is never selected',async()=>{const a=clone(base.catalogue);a.data.Page.media[0].title={english:'Other Show',native:'その他'};const r=await run({catalogue:a,jikan:{data:[]},armRows:[]});assert.equal(r.streams.length,0);assert(!r.calls.some(x=>x.u.includes('api.aniclover')))});
 await test('Movie request excludes TV catalogue result',async()=>{const r=await run({armRows:[]},['100','movie']);assert.equal(r.streams.length,0)});
 await test('Exact movie title uses episode one without TV mapping',async()=>{const a=clone(base.catalogue);a.data.Page.media[0].format='MOVIE';const r=await run({catalogue:a},['100','movie']);assert(r.streams.length);assert(r.calls.some(x=>x.u.endsWith('/sub/1')));assert(!r.calls.some(x=>x.u.includes('arm.haglund')))});
 await test('First valid Bee source returns without waiting for GG',async()=>{const t=Date.now(),r=await run({ggDelay:1000});assert.equal(r.streams[0].serverName,'Bee');assert(Date.now()-t<500)});
 await test('GG can win when Bee is slower',async()=>{const t=Date.now(),r=await run({beeDelay:1000,ggDelay:0});assert.equal(r.streams[0].serverName,'GG');assert(Date.now()-t<500)});
 await test('Fast failure does not win against valid slow source',async()=>assert.equal((await run({beeStatus:503,ggDelay:20})).streams[0].serverName,'GG'));
 await test('Other server is cancelled after valid winner',async()=>{const r=await run({ggDelay:1000});assert(r.calls.find(x=>x.u.includes('api.animetsu.site/watch')).o.signal.aborted)});
 await test('Fast completion works without AbortController',async()=>{const t=Date.now();assert((await run({noAbort:true,ggDelay:1000})).streams.length);assert(Date.now()-t<500)});
 await test('Empty source result triggers third-route mapping, with no repeat for identical coordinates',async()=>{const r=await run({beeStatus:503,ggStatus:503});assert.equal(r.streams.length,0);assert(r.calls.some(x=>x.u.includes('arm.haglund')));assert.equal(r.calls.filter(x=>x.u.includes('api.aniclover')).length,1)});
 await test('Failed title source is not stored as a confirmed entry',async()=>{const memo=new Map();await run({beeStatus:503,ggStatus:503},undefined,memo);assert([...memo].filter(([k])=>k.includes(':entry:')).every(([,v])=>v.invalid===true))});
 await test('English Malay Indo subtitles retain declared WebVTT MIME',async()=>{const t=(await run()).streams[0].subtitles;assert.deepEqual(Array.from(t,x=>x.language),['en','ms','id']);assert(t.every(x=>x.mimeType==='text/vtt'))});
 await test('Dub Bee response excluded',async()=>{const b=clone(base.bee);b.audio='dub';assert.equal((await run({bee:b,ggStatus:503})).streams.length,0)});
 await test('Wrong Bee response ID excluded',async()=>{const b=clone(base.bee);b.anilistId=999;assert.equal((await run({bee:b,ggStatus:503})).streams.length,0)});
 await test('English audio source excluded',async()=>{const b=clone(base.bee);b.sub.streams[0].audioLanguage='en';assert.equal((await run({bee:b,ggStatus:503})).streams.length,0)});
 await test('HTML disguised as HLS excluded',async()=>assert.equal((await run({master:'<html>blocked</html>',ggStatus:503})).streams.length,0));
 await test('GG mismatched AniList ID excluded',async()=>{const g=clone(base.gg);g.anilistId=999;assert.equal((await run({gg:g,beeStatus:503})).streams.length,0)});
 await test('GG mismatched episode excluded',async()=>{const g=clone(base.gg);g.episode=2;assert.equal((await run({gg:g,beeStatus:503})).streams.length,0)});
 await test('GG unbounded 200 response excluded',async()=>assert.equal((await run({rangeStatus:200,beeStatus:503})).streams.length,0));
 await test('GG HTML disguised as MP4 excluded',async()=>assert.equal((await run({mp4:'<!DOCTYPE html>',beeStatus:503})).streams.length,0));
 await test('Broadcast date correction remains in mapping fallback',async()=>{const z=clone(base.zip);z.episodes[1].airdate='2024-12-27';z.episodes[1].airDate='2025-01-01';const r=await run({zip:z,catalogue:{data:{Page:{media:[]}}},jikan:{data:[]}});assert(r.streams.length)});
 await test('Invalid request coordinates make no network requests',async()=>{for(const args of [['0','tv',1,1],['100','tv',-1,1],['100','tv',1,0]])assert.equal((await run({},args)).calls.length,0)});
 await test('Failed title source tries a different ID from mapping fallback',async()=>{const a=clone(base.catalogue);a.data.Page.media[0].id=201;a.data.Page.media[0].idMal=401;const r=await run({catalogue:a,failedAni:201});assert(r.streams.length);const urls=r.calls.filter(x=>x.u.includes('api.aniclover')).map(x=>x.u);assert(urls[0].includes('/201/'));assert(urls[1].includes('/200/'))});
 await test('Stale confirmed source entry is invalidated after source failure',async()=>{const memo=new Map();await run({},undefined,memo);await run({beeStatus:503,ggStatus:503},undefined,memo);assert([...memo].filter(([k])=>k.includes(':entry:')).every(([,v])=>v.invalid===true))});
 await test('String shared context with flat title is reused',async()=>{const c=JSON.stringify({tmdbId:'100',mediaType:'tv',title:'Fixture Anime',originalTitle:'テスト'});const r=await run({context:c});assert(r.streams.length);assert(!r.calls.some(x=>x.u.includes('api.themoviedb')))});
 await test('Wrong-content shared context is not reused',async()=>{const c=clone(base.context);c.tmdbId='999';c.tmdb.name='Wrong';const r=await run({context:c});assert(r.streams.length);assert(r.calls.some(x=>x.u.includes('api.themoviedb')))});
 console.log('TOTAL',passed,'passed');
})().catch(e=>{console.error(e);process.exitCode=1});
