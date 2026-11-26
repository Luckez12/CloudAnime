const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('scripts/episode-identity.js','utf8'),ctx);
const row=(mal,s)=>({themoviedb:123876,'themoviedb-season':s,'thetvdb-season':1,thetvdb:99,myanimelist:mal});
const data=(mal,local,global)=>({mappings:{mal_id:mal,themoviedb_id:123876,thetvdb_id:99},episodeCount:12,episodes:{[local]:{episode:local,seasonNumber:1,episodeNumber:global,tvdbShowId:99}}});
(async()=>{
 const rows=[row(48926,1),row(99999,2)],datasets={48926:data(48926,12,12),99999:data(99999,2,14)};
 let n=0;
 async function test(name,fn){await fn();console.log('PASS '+name);n++}
 const run=(r=rows,d=datasets,ep=14)=>ctx.cloudAnimeLinkedEpisode(r,async u=>d[new URL(u).searchParams.get('mal_id')],1,ep);
 await test('combined E14 selects next entry and local E2',async()=>{const r=await run();assert.equal(r.id,99999);assert.equal(r.ep,2)});
 await test('original E12 keeps original identity',async()=>{const r=await run(rows,datasets,12);assert.equal(r.id,48926);assert.equal(r.ep,12)});
 await test('reversed and duplicate ARM rows give identical result',async()=>{const r=await run([rows[1],rows[0],rows[1]]);assert.equal(r.ep,2)});
 await test('out of range without episode bridge rejects',async()=>{await assert.rejects(run([rows[0]]))});
 await test('wrong series identity rejects',async()=>{const d=JSON.parse(JSON.stringify(datasets));d[99999].mappings.themoviedb_id=1;d[99999].mappings.thetvdb_id=1;await assert.rejects(run(rows,d))});
 await test('ambiguous entries reject',async()=>{const d=JSON.parse(JSON.stringify(datasets));d[48926]=data(48926,14,14);await assert.rejects(run(rows,d))});
 await test('metadata outage cannot silently use original E14',async()=>{await assert.rejects(ctx.cloudAnimeLinkedEpisode(rows,async()=>{throw Error('503')},1,14))});
 await test('wrong TVDB episode season rejects out-of-range request',async()=>{const d=JSON.parse(JSON.stringify(datasets));d[99999].episodes[2].seasonNumber=2;await assert.rejects(run(rows,d))});
 await test('HiAnime entry point resolves combined request before player discovery',async()=>{
  const calls=[],sandbox={module:{exports:{}},URL,AbortController,setTimeout,clearTimeout,console:{log(){}},fetch:async u=>{calls.push(u);const body=u.includes('arm.haglund')?rows:datasets[new URL(u).searchParams.get('mal_id')];return{ok:true,text:async()=>JSON.stringify(body)}}};
  vm.createContext(sandbox);let code=fs.readFileSync('providers/hianime.js','utf8');code=code.replace(/var mapped\s*=\s*await (?=\(async function)/,'return await ');vm.runInContext(code,sandbox);const r=await sandbox.module.exports.getStreams('123876','tv',1,14);assert.equal(r.id,99999);assert.equal(r.ep,2);assert(!calls.some(u=>u.includes('megaplay')));
 });
 await test('separate native seasons resolve published absolute numbering',async()=>{
  const second={...rows[1],'thetvdb-season':2};
  function full(mal,season,start,count){const d=data(mal,1,start);d.episodeCount=count;d.episodes={};for(let i=1;i<=count;i++)d.episodes[i]={episode:i,seasonNumber:season,episodeNumber:i,absoluteEpisodeNumber:start+i-1,tvdbShowId:99};return d;}
  const d={48926:full(48926,1,1,12),99999:full(99999,2,13,12)};
  const r=await run([rows[0],second],d);assert.equal(r.id,99999);assert.equal(r.ep,2);
  d[99999].episodes[2].absoluteEpisodeNumber=99;await assert.rejects(run([rows[0],second],d));
 });
 console.log(n+' mapping regression cases passed');
})().catch(e=>{console.error(e);process.exitCode=1});
