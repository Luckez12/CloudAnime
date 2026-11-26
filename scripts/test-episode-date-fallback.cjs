const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const helper=fs.readFileSync('scripts/episode-identity.js','utf8');
const rows=[{themoviedb:123,'themoviedb-season':1,thetvdb:99,'thetvdb-season':1,myanimelist:101},{themoviedb:123,'themoviedb-season':2,thetvdb:99,'thetvdb-season':2,myanimelist:102}];
function part(mal,season,start,count){const episodes={};for(let i=1;i<=count;i++)episodes[i]={episode:i,seasonNumber:season,episodeNumber:i,absoluteEpisodeNumber:start+i-1,tvdbShowId:99,airDate:'2026-01-'+String(i).padStart(2,'0')};return {mappings:{mal_id:mal,themoviedb_id:123,thetvdb_id:99},episodeCount:count,episodes};}
function dataset(){return {101:part(101,1,1,12),102:part(102,2,13,12)};}
function context(hook){const c={setTimeout,clearTimeout};if(hook)c.vueoDiscoveryContext=hook;vm.createContext(c);vm.runInContext(helper,c);return c;}
async function run(d,hook,season=1,ep=14,r=rows){return context(hook).cloudAnimeLinkedEpisode(r,async u=>{const v=d[new URL(u).searchParams.get('mal_id')];if(v instanceof Error)throw v;return v;},season,ep);}
const seasonData=(date='2026-10-08')=>({season_number:1,episodes:[{season_number:1,episode_number:14,air_date:date}]});
function dated(){const d=dataset();for(const p of Object.values(d))for(const e of Object.values(p.episodes))delete e.absoluteEpisodeNumber;d[102].episodes[2].airDate='2026-10-09';return d;}
(async()=>{let n=0;async function test(name,fn){await fn();n++;console.log('PASS '+name);}
await test('separate TMDB part IDs accepted with matching MAL and TVDB',async()=>{const d=dataset();d[102].mappings.themoviedb_id=456;assert.equal((await run(d)).id,102);});
await test('separate show IDs require matching MAL and AniList before date fallback',async()=>{const d=dated(),r=rows.map(x=>({...x,anilist:x.myanimelist+1000}));d[101].mappings.anilist_id=1101;d[102].mappings.anilist_id=1102;d[102].mappings.themoviedb_id=456;d[102].mappings.thetvdb_id=88;for(const e of Object.values(d[102].episodes))e.tvdbShowId=88;const hit=await run(d,async()=>seasonData(),1,14,r);assert.equal(hit.id,102);assert.equal(hit.ep,2);});
await test('missing TMDB part ID accepted with independent TVDB proof',async()=>{const d=dataset();delete d[102].mappings.themoviedb_id;assert.equal((await run(d)).ep,2);});
await test('conflicting MAL or TVDB still rejected before date fallback',async()=>{for(const k of ['mal_id','thetvdb_id']){const d=dated();d[102].mappings[k]=999;await assert.rejects(run(d,async()=>seasonData()),/identity/);}});
await test('incomplete later part does not block earlier absolute target',async()=>{const d=dataset();d[102].episodeCount=24;delete d[102].episodes[12];assert.equal((await run(d)).ep,2);});
await test('unrelated later dataset outage does not block exact target',async()=>{const d=dataset();d[102]=Error('503');assert.equal((await run(d,null,1,4)).id,101);});
await test('failed dataset does not silently use original out of range coordinates',async()=>{const d=dataset();d[102]=Error('503');await assert.rejects(run(d),/unavailable/);});
await test('date fallback resolves split season with one day tolerance',async()=>{let calls=0;const r=await run(dated(),async url=>{calls++;assert.equal(url,'https://api.themoviedb.org/3/tv/123/season/1');return seasonData();});assert.equal(r.ep,2);assert.equal(r.id,102);assert.equal(r.method,'verified episode date fallback');assert.equal(calls,1);});
await test('date fallback works for merged season 2 without absolute offset guessing',async()=>{const r=rows.map(x=>({...x,'themoviedb-season':x['themoviedb-season']+1}));const data=seasonData();data.season_number=2;data.episodes[0].season_number=2;const hit=await run(dated(),async()=>data,2,14,r);assert.equal(hit.id,102);assert.equal(hit.ep,2);});
await test('exact mapping does not fetch date metadata',async()=>{assert.equal((await run(dataset(),()=>{throw Error('Must not run')},1,4)).ep,4);});
await test('large gap alone cannot establish an episode mapping',async()=>{await assert.rejects(run(dated(),async()=>seasonData('2028-10-08')),/No verified/);});
await test('ambiguous same-date source episodes rejected',async()=>{const d=dated();d[102].episodes[3].airDate='2026-10-08';await assert.rejects(run(d,async()=>seasonData()),/Conflicting/);});
await test('wrong season response cannot supply the target date',async()=>{const d=seasonData();d.episodes[0].season_number=2;await assert.rejects(run(dated(),async()=>d),/No verified/);});
await test('shared cached season dates avoid additional request',async()=>{const c=context(()=>{throw Error('Must not run')});c.VUEO_DISCOVERY_CONTEXT={tmdbId:123,tmdb:{id:123},...seasonData()};const d=dated();assert.equal((await c.cloudAnimeLinkedEpisode(rows,async u=>d[new URL(u).searchParams.get('mal_id')],1,14)).ep,2);});
for(const p of JSON.parse(fs.readFileSync('manifest.json')).scrapers)assert(fs.readFileSync(p.filename,'utf8').startsWith(helper),p.id);
console.log(n+' date/identity regression cases; shared resolver verified in all 15 providers');
})().catch(e=>{console.error(e);process.exitCode=1;});
