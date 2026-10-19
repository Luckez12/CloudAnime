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
  if(u.includes('api.themoviedb.org/3/'))return response({...d.detail,original_language:d.origin||d.detail.original_language});
  if(u==='https://graphql.anilist.co')return response(d.catalogue,d.catalogueStatus||200);
  if(u.includes('api.jikan.moe/v4/anime?q='))return response(d.jikan);
  if(u.includes('v3-cinemeta'))return response(d.cinemeta||{meta:{videos:[]}});
  if(u.includes('api.aniclover.cc'))return response(d.bee,d.beeStatus||200);
  if(u.includes('api.animetsu.site/watch'))return response(d.gg,d.ggStatus||200);
  if(u==='https://media.test/master')return response(d.master);
  if(u.includes('/proxy?')||u==='https://gg.test/video.mp4'){assert.equal(o.headers.Range,'bytes=0-511');return response(d.mp4,d.rangeStatus,d.rangeHeaders)}
  throw Error('Unexpected request '+u);
 }};
 if(memo)ctx.vueoMetadataCache=s=>{const q=JSON.parse(s);if(q.op==='put')memo.set(q.key,q.value);return JSON.stringify(q.op==='get'?memo.get(q.key)||null:q.value)};
 vm.createContext(ctx);vm.runInContext(code,ctx);const streams=await ctx.module.exports.getStreams(...args);return {streams,calls,logs};
}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name)}
(async()=>{
 await test('First validated Bee result returns without waiting for GG',async()=>{const t=Date.now(),r=await run({ggDelay:1000});assert.equal(r.streams.length,1);assert.equal(r.streams[0].serverName,'Bee');assert(Date.now()-t<500)});
 await test('GG can win when Bee is slower',async()=>{const t=Date.now(),r=await run({beeDelay:1000});assert.equal(r.streams[0].serverName,'GG');assert(Date.now()-t<500)});
 await test('Fast failure does not beat slower valid result',async()=>{const r=await run({beeStatus:503,ggDelay:25});assert.equal(r.streams[0].serverName,'GG')});
 await test('Empty fast result still waits for other server',async()=>{let b=clone(base.bee);b.sub.streams=[];assert.equal((await run({bee:b,ggDelay:25})).streams[0].serverName,'GG')});
 await test('Invalid fast HLS does not beat valid MP4',async()=>assert.equal((await run({master:'<html>blocked</html>',ggDelay:25})).streams[0].serverName,'GG'));
 await test('Both failed servers return empty',async()=>assert.equal((await run({beeStatus:503,ggStatus:502})).streams.length,0));
 await test('Loser AbortSignal is cancelled',async()=>{const r=await run({ggDelay:1000});const call=r.calls.find(x=>x.u.includes('api.animetsu.site/watch'));assert(call.o.signal.aborted)});
 await test('Race works without AbortController support',async()=>{const t=Date.now(),r=await run({noAbort:true,ggDelay:1000});assert.equal(r.streams[0].serverName,'Bee');assert(Date.now()-t<500);});
 await test('English Malay Indo subtitles only',async()=>assert.deepEqual(Array.from((await run()).streams[0].subtitles,t=>t.language),['en','ms','id']));
 await test('Extensionless WebVTT MIME preserved',async()=>assert((await run()).streams[0].subtitles.every(t=>t.mimeType==='text/vtt')));
 await test('Dub result excluded',async()=>{let b=clone(base.bee);b.audio='dub';assert.equal((await run({bee:b,ggStatus:503})).streams.length,0)});
 await test('English audio stream excluded',async()=>{let b=clone(base.bee);b.sub.streams[0].audioLanguage='en';assert.equal((await run({bee:b,ggStatus:503})).streams.length,0)});
 await test('Non-Japanese HLS audio metadata excluded',async()=>assert.equal((await run({master:'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="en"\n#EXT-X-TARGETDURATION:5\n',ggStatus:503})).streams.length,0));
 await test('Mixed HLS requires Japanese rendition selection',async()=>assert((await run({master:'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="ja"\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="en"\n#EXT-X-TARGETDURATION:5\n'})).streams[0].url.includes('audio=ja')));
 await test('GG mismatched ID rejected',async()=>{let g=clone(base.gg);g.anilistId=999;assert.equal((await run({gg:g,beeStatus:503})).streams.length,0)});
 await test('GG mismatched episode rejected',async()=>{let g=clone(base.gg);g.episode=2;assert.equal((await run({gg:g,beeStatus:503})).streams.length,0)});
 await test('GG inactive MP4 excluded',async()=>{let g=clone(base.gg);g.streams[0].isActive=false;assert.equal((await run({gg:g,beeStatus:503})).streams.length,0)});
 await test('Unbounded 200 MP4 response excluded',async()=>assert.equal((await run({rangeStatus:200,beeStatus:503})).streams.length,0));
 await test('HTML disguised as MP4 excluded',async()=>assert.equal((await run({mp4:'<!DOCTYPE html>',beeStatus:503})).streams.length,0));
 await test('Invalid byte range excluded',async()=>assert.equal((await run({rangeHeaders:{'content-range':'bytes 100-611/50000'},beeStatus:503})).streams.length,0));
 await test('Normal ARM path avoids catalogue search',async()=>assert(!(await run()).calls.some(x=>x.u==='https://graphql.anilist.co')));
 await test('Missing ARM mapping uses verified catalogue fallback',async()=>{const r=await run({armRows:[]});assert.equal(r.streams.length,1);assert(r.logs.some(x=>x.includes('Verified candidates=1')))});
 await test('Premiere five days before TV broadcast accepted with constant schedule',async()=>{let season=clone(base.season);season.episodes[0].air_date='2025-01-06';assert.equal((await run({armRows:[],season})).streams.length,1)});
 await test('Premiere mismatch over seven days rejected',async()=>{let season=clone(base.season);season.episodes[0].air_date='2025-02-06';assert.equal((await run({armRows:[],season})).streams.length,0)});
 await test('Native title mismatch rejected even with English title match',async()=>{let a=clone(base.catalogue);a.data.Page.media[0].title.native='違う';let j=clone(base.jikan);j.data[0].title_japanese='違う';assert.equal((await run({armRows:[],catalogue:a,jikan:j})).streams.length,0)});
 await test('Search catalogue anime format must match request',async()=>{let a=clone(base.catalogue);a.data.Page.media[0].format='MOVIE';let j=clone(base.jikan);j.data[0].type='Movie';assert.equal((await run({armRows:[],catalogue:a,jikan:j})).streams.length,0)});
 await test('Conflicting reciprocal TMDB ID rejected',async()=>{let z=clone(base.zip);z.mappings.themoviedb_id=999;assert.equal((await run({armRows:[],zip:z})).streams.length,0)});
 await test('AniZip dataset may lack TMDB ID when titles and schedule verify',async()=>{let z=clone(base.zip);delete z.mappings.themoviedb_id;assert.equal((await run({armRows:[],zip:z})).streams.length,1)});
 await test('Conflicting MAL/AniList identity rejected',async()=>{let z=clone(base.zip);z.mappings.anilist_id=999;assert.equal((await run({armRows:[],zip:z})).streams.length,0)});
 await test('Missing episode date rejected',async()=>{let z=clone(base.zip);delete z.episodes[1].airdate;assert.equal((await run({armRows:[],zip:z})).streams.length,0)});
 await test('Duplicate episode records rejected',async()=>{let z=clone(base.zip);z.episodes.other={...z.episodes[1]};assert.equal((await run({armRows:[],zip:z})).streams.length,0)});
 await test('Unrequested title is never first-result fallback',async()=>{let a=clone(base.catalogue);a.data.Page.media[0].title={native:'その他',english:'Other'};assert.equal((await run({armRows:[],catalogue:a,jikan:{data:[]}})).streams.length,0)});
 await test('AniList failure uses Jikan catalogue evidence',async()=>assert.equal((await run({armRows:[],catalogueStatus:403})).streams.length,1));
 await test('Metadata cache reused; source routes refreshed',async()=>{const memo=new Map();await run({},undefined,memo);const r=await run({},undefined,memo);assert.equal(r.streams.length,1);assert(!r.calls.some(x=>x.u.includes('arm.haglund')));assert(r.calls.some(x=>x.u.includes('api.aniclover')))});
 await test('Invalid coordinates make no network requests',async()=>{for(const args of [['0','tv',1,1],['100','tv',-1,1],['100','tv',1,0]])assert.equal((await run({},args)).calls.length,0)});
 await test('Verified movie mapping remains supported',async()=>{const row={...base.row,media:'MOVIE','themoviedb-season':null},zip=clone(base.zip);zip.mappings.type='MOVIE';assert.equal((await run({row,zip},['100','movie'])).streams.length,1)});
 await test('Catalogue premiere can precede AniZip broadcast by five days',async()=>{let a=clone(base.catalogue);a.data.Page.media[0].startDate={year:2024,month:12,day:27};assert.equal((await run({armRows:[],catalogue:a})).streams.length,1)});
 await test('Second episode must preserve first-episode schedule difference',async()=>{let z=clone(base.zip),season=clone(base.season);z.episodes[2]={...z.episodes[1],episode:'2',airdate:'2025-01-08'};season.episodes.push({season_number:1,episode_number:2,air_date:'2025-01-20'});assert.equal((await run({armRows:[],zip:z,season},['100','tv',1,2])).streams.length,0)});
 await test('Ambiguous independently verified catalogue candidates rejected',async()=>{let a=clone(base.catalogue),z=clone(base.zip);a.data.Page.media.push({...a.data.Page.media[0],id:201,idMal:401});z.mappings.mal_id=401;z.mappings.anilist_id=201;assert.equal((await run({armRows:[],catalogue:a,extraZip:z})).streams.length,0)});
 await test('Catalogue identity cache avoids new searches on next episode',async()=>{const memo=new Map(),z=clone(base.zip),season=clone(base.season);z.episodes[2]={...z.episodes[1],episode:'2',airdate:'2025-01-08'};season.episodes.push({season_number:1,episode_number:2,air_date:'2025-01-08'});const d={armRows:[],zip:z,season};await run(d,undefined,memo);const r=await run(d,['100','tv',1,2],memo);assert.equal(r.streams.length,1);assert(!r.calls.some(x=>x.u.includes('graphql.anilist')||x.u.includes('api.jikan')))});
 await test('AniZip English alias can verify the already matched catalogue ID',async()=>{let z=clone(base.zip);delete z.titles.ja;assert.equal((await run({armRows:[],zip:z})).streams.length,1)});
 await test('Broadcast date matches even when earlier streaming date differs',async()=>{let z=clone(base.zip);z.episodes[1].airdate='2024-12-27';z.episodes[1].airDate='2025-01-01';const r=await run({zip:z});assert.equal(r.streams.length,1);assert(!r.calls.some(x=>x.u.includes('graphql.anilist')))});
 await test('Streaming date matches when broadcast date differs',async()=>{let z=clone(base.zip);z.episodes[1].airDate='2025-01-06';assert.equal((await run({zip:z})).streams.length,1)});
 await test('Neither published date matches target; no unverified source',async()=>{let z=clone(base.zip);z.episodes[1].airDate='2024-12-20';z.episodes[1].airdate='2024-12-19';const r=await run({zip:z,catalogue:{data:{Page:{media:[]}}},jikan:{data:[]}});assert.equal(r.streams.length,0)});
 console.log('TOTAL',passed,'passed');
})().catch(e=>{console.error(e);process.exitCode=1});
