const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('providers/animekai.js','utf8');
async function run(opt={}){
 const calls=[];const ctx={module:{exports:{}},URL,AbortController,setTimeout,clearTimeout,require,console:{log(){}},VUEO_DISCOVERY_CONTEXT:{tmdbId:126437,mediaType:'tv',tmdb:{id:126437,name:'Aoashi',original_language:'ja'}},fetch:async(u)=>{
  calls.push(u);let d;
  if(u.includes('arm.haglund'))d=opt.original?[{themoviedb:126437,'themoviedb-season':2,myanimelist:61603,media:'TV','anime-planet':opt.missingSlug?undefined:'aoashi-season-2'}]:[];
  else if(u.includes('graphql.anilist'))d={data:{Page:{pageInfo:{hasNextPage:false},media:[{id:191788,idMal:opt.catalogueMal||61603,countryOfOrigin:'JP',format:'TV',episodes:24,title:{english:'Aoashi Season 2'}}]}}};
  else if(u.includes('/browse?'))d=opt.browse||'<a class="title" title="Aoashi Season 2" href="/watch/aoashi-season-2">Aoashi Season 2</a>';
  else if(u.includes('animekai.li/watch'))d=`<div id="watch-page" data-anime="aoashi-season-2" data-episode="${opt.active||2}"></div><li data-number="2" data-published="1" data-has-sub="1"></li><span data-server-url="https://megavid.buzz/mal/${opt.playerMal||61603}/2/sub" data-lang="sub" data-label="Server 2"></span>`;
  else if(u.includes('/source?'))d=opt.badSource?'<html>bad</html>':{status:'ok',source:'https://media.test/master'};
  else if(u==='https://media.test/master')d='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=10000\n720.m3u8';
  else throw Error('Unexpected '+u);
  return {ok:true,text:async()=>typeof d==='string'?d:JSON.stringify(d)};
 }};vm.createContext(ctx);vm.runInContext(code,ctx);return {streams:await ctx.module.exports.getStreams('126437','tv',2,2),calls};
}
(async()=>{
 let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name)};
 await test('mapping absent -> exact title -> website slug -> published episode -> verified HLS',async()=>{const r=await run();assert.equal(r.streams.length,1);assert.equal(r.streams[0].serverName,'MegaVid');assert(r.calls.some(u=>u.includes('/browse?')))});
 await test('missing ARM slug recovered only with matching MAL',async()=>{const r=await run({original:true,missingSlug:true});assert.equal(r.streams.length,1)});
 await test('title fallback cannot override original mapped MAL',async()=>{const r=await run({original:true,missingSlug:true,catalogueMal:999});assert.equal(r.streams.length,0);assert(!r.calls.some(u=>u.includes('/browse?')))});
 await test('ambiguous exact website slugs rejected',async()=>{const r=await run({browse:'<a title="Aoashi Season 2" href="/watch/aoashi-season-2">A</a><a title="Aoashi Season 2" href="/watch/aoashi-season-2-other">B</a>'});assert.equal(r.streams.length,0);assert(!r.calls.some(u=>u.includes('/watch/')))});
 await test('fallback still rejects wrong MAL player',async()=>{const r=await run({playerMal:49052});assert.equal(r.streams.length,0);assert(!r.calls.some(u=>u.includes('/source?')))});
 await test('fallback still rejects redirected active episode',async()=>{const r=await run({active:1});assert.equal(r.streams.length,0);assert(!r.calls.some(u=>u.includes('/source?')))});
 await test('video HTML failure after working ID mapping does not trigger title search',async()=>{const r=await run({original:true,badSource:true});assert.equal(r.streams.length,0);assert(!r.calls.some(u=>u.includes('graphql.anilist')||u.includes('/browse?')))});
 console.log(count+' AnimeKai title integration cases passed');
})().catch(e=>{console.error(e);process.exitCode=1});
