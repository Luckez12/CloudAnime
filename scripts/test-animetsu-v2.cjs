const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const code=fs.readFileSync(require('path').resolve(__dirname,'../providers/animetsu.js'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const row={themoviedb:100,'themoviedb-season':1,thetvdb:300,'thetvdb-season':1,anilist:200,myanimelist:400,media:'TV',imdb:'tt12345'};
const zip={mappings:{themoviedb_id:100,mal_id:400,anilist_id:200,thetvdb_id:300,type:'TV'},titles:{en:'Fixture Anime'},episodes:{1:{episode:'1',airdate:'2025-01-01',tvdbShowId:300,tvdbId:301,seasonNumber:1,episodeNumber:1,absoluteEpisodeNumber:1}},episodeCount:1};
const base={row,zip,season:{episodes:[{season_number:1,episode_number:1,air_date:'2025-01-01'}]},bee:{success:true,sub:{streams:[{url:'https://media.test/master',type:'hls'}],subtitles:[{url:'https://media.test/en',label:'English'},{url:'https://media.test/ms',lang:'ms'},{url:'https://media.test/id',language:'Indonesian'},{url:'https://media.test/fr',label:'French'}],intro:{start:10,end:20}}},gg:{anilistId:200,episode:1,audio:'sub',streams:[{url:'https://gg.test/video.mp4',proxied_url:'/proxy?url=fixture',type:'mp4',quality:'1080p',audio:'sub',isActive:true}]},master:'#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\nsegment.ts\n',mp4:'\x00\x00\x00 ftypisom',rangeStatus:206,rangeHeaders:{'content-range':'bytes 0-511/50000','content-length':'512'},context:{tmdbId:'100',mediaType:'tv',tmdb:{id:100,original_language:'ja'}}};
async function run(change={},args=['100','tv',1,1],memo){
 const d=Object.assign(clone(base),change),calls=[],logs=[];
 function response(data,status=200,headers={}){const body=typeof data==='string'?data:JSON.stringify(data);return {ok:status>=200&&status<300,status,headers:{get:k=>headers[k.toLowerCase()]||null},text:async()=>body,json:async()=>JSON.parse(body)}}
 const ctx={module:{exports:{}},URL,AbortController,setTimeout,clearTimeout,console:{log:x=>logs.push(x)},VUEO_DISCOVERY_CONTEXT:d.context,fetch:async(u,o={})=>{
  calls.push({u,o});assert(!u.includes('animetsu.live'));assert(!/\/dub\//.test(u));
  if(u.includes('arm.haglund.dev'))return response([d.row]);
  if(u.includes('api.ani.zip'))return response(d.zip);
  if(u.includes('api.themoviedb.org/3/tv/100/season/'))return response(d.season);
  if(u.includes('api.themoviedb.org/3/'))return response({id:100,original_language:d.origin||'ja'});
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
 await test('Bee HLS and GG MP4 both returned',async()=>assert.equal((await run()).streams.length,2));
 await test('English Malay Indo subtitles only; extensionless VTT declared',async()=>{const s=(await run()).streams[0];assert.deepEqual(Array.from(s.subtitles,t=>t.language),['en','ms','id']);assert(s.subtitles.every(t=>t.mimeType==='text/vtt'));assert.equal(s.intro.start,10)});
 await test('Bee query only explicit Sub coordinates',async()=>assert((await run()).calls.some(x=>x.u==='https://api.aniclover.cc/api/watch/200/sub/1')));
 await test('HTML HLS rejected while GG survives',async()=>assert.equal((await run({master:'<html>Forbidden</html>'})).streams[0].serverName,'GG'));
 await test('Bee HTTP 403 isolated from GG',async()=>assert.equal((await run({beeStatus:403})).streams[0].serverName,'GG'));
 await test('GG HTTP failure isolated from Bee',async()=>assert.equal((await run({ggStatus:502})).streams[0].serverName,'Bee'));
 await test('Bee wrong identity rejected',async()=>{let d=clone(base.bee);d.anilistId=999;assert.equal((await run({bee:d})).streams.length,1)});
 await test('Bee top-level Dub rejected',async()=>{let d=clone(base.bee);d.audio='dub';assert.equal((await run({bee:d})).streams.length,1)});
 await test('Bee Sub branch Dub rejected',async()=>{let d=clone(base.bee);d.sub.audio='dub';assert.equal((await run({bee:d})).streams.length,1)});
 await test('Bee source English audio rejected',async()=>{let d=clone(base.bee);d.sub.streams[0].audioLanguage='en';assert.equal((await run({bee:d})).streams.length,1)});
 await test('Bee iframe excluded',async()=>{let d=clone(base.bee);d.sub.streams[0].type='iframe';assert.equal((await run({bee:d})).streams.length,1)});
 await test('Duplicate HLS collapsed',async()=>{let d=clone(base.bee);d.sub.streams.push(d.sub.streams[0]);assert.equal((await run({bee:d})).streams.length,2)});
 await test('Dub branches never consumed',async()=>{let d=clone(base.bee);d.dub={streams:[{url:'https://media.test/dub',type:'hls'}]};assert.equal((await run({bee:d})).streams.length,2)});
 await test('Non-Japanese HLS metadata rejected',async()=>assert.equal((await run({master:'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="en"\n#EXT-X-TARGETDURATION:5\n'})).streams.length,1));
 await test('Mixed HLS selects Japanese rendition',async()=>{let d=await run({master:'#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="ja"\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="en"\n#EXT-X-STREAM-INF:BANDWIDTH=1\na.m3u8\n'});assert(d.streams[0].url.includes('audio=ja,jp,jpn,japanese'))});
 await test('GG wrong AniList identity rejected',async()=>{let d=clone(base.gg);d.anilistId=999;assert.equal((await run({gg:d})).streams.length,1)});
 await test('GG wrong episode rejected',async()=>{let d=clone(base.gg);d.episode=2;assert.equal((await run({gg:d})).streams.length,1)});
 await test('GG Dub rejected',async()=>{let d=clone(base.gg);d.audio='dub';assert.equal((await run({gg:d})).streams.length,1)});
 await test('GG inactive sources rejected',async()=>{let d=clone(base.gg);d.streams[0].isActive=false;assert.equal((await run({gg:d})).streams.length,1)});
 await test('GG unbounded 200 response rejected',async()=>assert.equal((await run({rangeStatus:200})).streams.length,1));
 await test('GG HTML response rejected',async()=>assert.equal((await run({mp4:'<!DOCTYPE html>'})).streams.length,1));
 await test('GG invalid Content-Range rejected',async()=>assert.equal((await run({rangeHeaders:{'content-range':'bytes 100-611/50000'}})).streams.length,1));
 await test('Wrong anime identity mapping rejected before source calls',async()=>{let z=clone(base.zip);z.mappings.anilist_id=999;let d=await run({zip:z});assert.equal(d.streams.length,0);assert(!d.calls.some(x=>x.u.includes('api.aniclover')))});
 await test('Wrong TMDB mapping rejected',async()=>{let z=clone(base.zip);z.mappings.themoviedb_id=999;assert.equal((await run({zip:z})).streams.length,0)});
 await test('Unmatched episode date rejected',async()=>{let z=clone(base.zip);z.episodes[1].airdate='2024-01-01';assert.equal((await run({zip:z})).streams.length,0)});
 await test('Ambiguous same-day episodes rejected',async()=>{let z=clone(base.zip);z.episodes[2]={...z.episodes[1],episode:'2'};assert.equal((await run({zip:z})).streams.length,0)});
 await test('Non-Japanese content rejected',async()=>{let c=clone(base.context);c.tmdb.original_language='zh';assert.equal((await run({context:c})).streams.length,0)});
 await test('Missing context verifies TMDB origin',async()=>{let d=await run({context:null});assert.equal(d.streams.length,2);assert(d.calls.some(x=>x.u.startsWith('https://api.themoviedb.org/3/tv/100?')))});
 await test('No source requests for invalid inputs',async()=>{for(const args of [['0','tv',1,1],['100','tv',-1,1],['100','tv',1,0],['100','music',1,1]]){const r=await run({},args);assert.equal(r.calls.length,0)}});
 await test('Series type normalised',async()=>assert.equal((await run({},['100','series',1,1])).streams.length,2));
 await test('Metadata cache reused; signed streams refreshed',async()=>{const memo=new Map();await run({},undefined,memo);const d=await run({},undefined,memo);assert.equal(d.streams.length,2);assert(!d.calls.some(x=>x.u.includes('arm.haglund')));assert(d.calls.some(x=>x.u.includes('api.aniclover')));assert([...memo.keys()].every(x=>!x.includes('api.aniclover')&&!x.includes('proxy?')))});
 await test('Movie uses verified identity episode one',async()=>{const row={...base.row,media:'MOVIE','themoviedb-season':null},zip=clone(base.zip);zip.mappings.type='MOVIE';const context={...base.context,mediaType:'movie'};assert.equal((await run({row,zip,context},['100','movie'])).streams.length,2)});
 await test('Show-wide absolute request needs independent TVDB identity/date',async()=>{const row={...base.row,'themoviedb-season':null,'thetvdb-season':null},zip=clone(base.zip);zip.episodes[1].absoluteEpisodeNumber=1;const cinemeta={meta:{videos:[{season:2,episode:1,tvdb_id:301,released:'2025-01-01T00:00:00Z'}]}};const d=await run({row,zip,season:{episodes:[]},cinemeta},['100','tv',2,1]);assert.equal(d.streams.length,2)});
 await test('Show-wide absolute request without TVDB identity rejected',async()=>{const row={...base.row,'themoviedb-season':null,'thetvdb-season':null},cinemeta={meta:{videos:[{season:2,episode:1,tvdb_id:999,released:'2025-01-01T00:00:00Z'}]}};const d=await run({row,season:{episodes:[]},cinemeta},['100','tv',2,1]);assert.equal(d.streams.length,0)});
 await test('GG provider episode conflict rejected',async()=>{let d=clone(base.gg);d.providerEpisode=2;assert.equal((await run({gg:d})).streams.length,1)});
 await test('Movie dataset with TV type rejected',async()=>{const row={...base.row,media:'MOVIE','themoviedb-season':null};assert.equal((await run({row},['100','movie'])).streams.length,0)});
 await test('Published subtitle MIME overrides extensionless URL default',async()=>{let b=clone(base.bee);b.sub.subtitles=[{url:'https://media.test/ssa',label:'English',mimeType:'text/x-ssa'},{url:'https://media.test/srt',lang:'id',type:'application/x-subrip'}];const tracks=(await run({bee:b})).streams[0].subtitles;assert.equal(tracks[0].format,'ass');assert.equal(tracks[1].format,'srt')});
 console.log('TOTAL',passed,'passed');
})().catch(e=>{console.error(e);process.exitCode=1});
