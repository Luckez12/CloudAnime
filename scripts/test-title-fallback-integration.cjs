const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const baseline=JSON.parse(fs.readFileSync('scripts/fixtures/title-fallback-baseline.json','utf8'));
const crypto=require('node:crypto');
const context={tmdbId:126437,mediaType:'tv',tmdb:{id:126437,name:'Aoashi',original_language:'ja'}};
const arm={themoviedb:126437,'themoviedb-season':2,myanimelist:61603,anilist:191788,media:'TV',imdb:'tt15792808',thetvdb:407840,'thetvdb-season':2,'anime-planet':'aoashi-season-2'};
function sandbox(working){
 const calls=[];
 const fetch=async(u,o={})=>{
  calls.push(u);let d;
  if(u.includes('arm.haglund'))d=working?[arm]:[];
  else if(u.includes('graphql.anilist'))d={data:{Page:{pageInfo:{hasNextPage:false},media:[{id:191788,idMal:61603,countryOfOrigin:'JP',format:'TV',episodes:24,title:{english:'Aoashi Season 2',romaji:'Aoashi 2nd Season'}}]}}};
  else if(u.includes('cinemeta'))d={meta:{videos:[{season:2,episode:2,released:'2020-01-02T12:00:00Z'}]}};
  else if(u.includes('api.ani.zip'))d={mappings:{mal_id:61603,anilist_id:191788,themoviedb_id:126437,thetvdb_id:407840},titles:{en:'Aoashi Season 2'},episodeCount:24,episodes:{2:{episode:2,airdate:'2020-01-02',airDate:'2020-01-02',seasonNumber:2,episodeNumber:2,tvdbShowId:407840}}};
  else throw Error('Unexpected HTTP '+u);
  return {ok:true,status:200,text:async()=>JSON.stringify(d),json:async()=>d,headers:{get:()=>null}};
 };
 const ctx={module:{exports:{}},exports:{},fetch,require,URL,AbortController,setTimeout,clearTimeout,console:{log(){},error(){}},VUEO_DISCOVERY_CONTEXT:context,atob,btoa,TextEncoder,TextDecoder,Buffer};vm.createContext(ctx);
 return {ctx,calls,fetch};
}
function instrumentDirect(code,name){
 if(name==='allanime'){
  const a=code.indexOf('      var results = await Promise.all(['),b=code.indexOf('      if (!mapped)',a);
  assert(a>=0&&b>a);
  const block=code.slice(a,b),start=block.indexOf('(async function()'),end=block.indexOf('})()',start)+4;
  assert(start>=0&&end>start);
  return code.slice(0,a)+'      return await '+block.slice(start,end)+';\n'+code.slice(b);
 }
 assert(/var mapped\s*=\s*await \(async function/.test(code));return code.replace(/var mapped\s*=\s*await (?=\(async function)/,'return await ');
}
async function direct(name,working){
 const s=sandbox(working);const code=instrumentDirect(fs.readFileSync('providers/'+name+'.js','utf8'),name);
 vm.runInContext(code,s.ctx);return {value:await s.ctx.module.exports.getStreams('126437','tv',2,2),calls:s.calls};
}
async function legacy(name,working){
 const s=sandbox(working);vm.runInContext(fs.readFileSync('providers/'+name+'.js','utf8'),s.ctx);
 const mapped=await s.ctx.cloudbankAnimeMappingFetch(s.fetch,Date.now()+20000)('https://id-mapping-api-malid.hf.space/api/resolve?id=126437&s=2&e=2');
 return {value:await mapped.json(),calls:s.calls};
}
(async()=>{
 let n=0;
 for(const name of ['allanime','animekai','hianime','kurage','reanime','vidnest']){
  const a=baseline.providers[name],b=await direct(name,true);assert.deepEqual(JSON.parse(JSON.stringify(b.value)),JSON.parse(JSON.stringify(a.value)),name+' ID object');assert.deepEqual(b.calls,a.calls,name+' ID requests');assert(!b.calls.some(u=>u.includes('graphql.anilist')));console.log('PASS '+name+' original mapping + requests unchanged');n++;
  const f=await direct(name,false);assert(f.value,name);assert.equal(f.value.id,['kurage','reanime','vidnest'].includes(name)?191788:61603,name);assert.equal(f.value.episode||f.value.ep,2);assert(f.calls.some(u=>u.includes('graphql.anilist')),name);console.log('PASS '+name+' real mapping failure -> exact-title adapter shape');n++;
 }
 for(const name of ['animedunya','animegg','animenosub','animeonsen','anipm']){
  const a=baseline.providers[name],b=await legacy(name,true);assert.deepEqual(JSON.parse(JSON.stringify(b.value)),JSON.parse(JSON.stringify(a.value)),name+' ID object');assert.deepEqual(b.calls,a.calls,name+' ID requests');assert(!b.calls.some(u=>u.includes('graphql.anilist')));console.log('PASS '+name+' original mapping + requests unchanged');n++;
  const f=await legacy(name,false);assert.equal(f.value.mal_id,61603);assert.equal(f.value.anilist,191788);assert.equal(f.value.episode,2);assert(f.value.titles.includes('Aoashi Season 2'));console.log('PASS '+name+' embedded mapping failure -> full title identity');n++;
 }
 // Verify the existing AllAnime bootstrap still starts while mapping is pending.
 {
  const s=sandbox(true),native=s.ctx.fetch;
  s.ctx.fetch=async(u,o)=>{if(u.includes('arm.haglund')){await new Promise(resolve=>setTimeout(resolve,15));assert.equal(s.ctx.__runtimeStarted,true,'bootstrap must not wait for mapping');}return native(u,o);};
  let code=fs.readFileSync('providers/allanime.js','utf8');
  const re=/runtime\(\)\.then\(async function \(rt\) \{\s*await session\(rt, false\);\s*return rt;\s*\}\)/;
  assert(re.test(code));code=code.replace(re,'Promise.resolve().then(function(){globalThis.__runtimeStarted=true;return {};})');
  vm.runInContext(code,s.ctx);await s.ctx.module.exports.getStreams('126437','tv',2,2);assert(s.ctx.__runtimeStarted);console.log('PASS AllAnime bootstrap remains concurrent with mapping');n++;
 }
 for(const name of ['animetsu','anizone','animesalt','animeworld'])assert.equal(crypto.createHash('sha256').update(fs.readFileSync('providers/'+name+'.js')).digest('hex'),baseline.unchanged[name],name+' unchanged');
 console.log('PASS four title-first provider files unchanged');n++;
 // Evaluate every original standalone script with real declared Node packages.
 for(const file of fs.readdirSync('providers').filter(f=>f.endsWith('.js'))){const s=sandbox(true);vm.runInContext(fs.readFileSync('providers/'+file,'utf8'),s.ctx,{filename:file});assert.equal(typeof s.ctx.module.exports.getStreams,'function',file);}
 console.log('PASS all 15 standalone modules load and export getStreams');n++;
 console.log(n+' integration checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
