const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync('providers/animekai.js', 'utf8');
const page = (ep=6, published=1, mal=61603, serverEp=ep, label='Server 2') => `<div id="watch-page" data-anime="aoashi-season-2" data-episode="${ep}"></div><li data-number="${ep}" data-published="${published}" data-has-sub="1"></li><span data-server-url="https://megavid.buzz/mal/${mal}/${serverEp}/sub?autoplay=1" data-lang="sub" data-label="${label}"></span>`;
async function run(html, opt={}) {
 const calls=[], logs=[];
 const ctx={module:{exports:{}}, URL, AbortController, setTimeout, clearTimeout, console:{log:x=>logs.push(x)}, fetch:async(url)=>{
  calls.push(url);
  let body;
  if(url.startsWith('https://arm.haglund.dev/')) body=JSON.stringify([{themoviedb:126437,'themoviedb-season':2,myanimelist:61603,media:'TV','anime-planet':opt.noHint?undefined:'aoashi-season-2'}]);
  else if(url.startsWith('https://animekai.li/watch/')) body=html;
  else if(url.includes('/source?')) body=JSON.stringify({status:'ok',source:'https://media.test/master', ...(opt.source||{})});
  else if(url==='https://media.test/master') body='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\n720.m3u8';
  else throw Error('Unexpected URL '+url);
  return {ok:true,text:async()=>body};
 }};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 const streams=await ctx.module.exports.getStreams('126437','tv',2,6);
 return {streams,calls,logs};
}
(async()=>{
 let count=0;
 async function test(name,fn){await fn();count++;console.log('PASS '+name);}
 await test('published exact episode succeeds in four requests',async()=>{const r=await run(page());assert.equal(r.streams.length,1);assert.equal(r.calls.length,4);});
 for(const [name,html] of [
  ['redirect E6 to E5',page(5)],['unpublished E6',page(6,0)],['S1 server on S2 page',page(6,1,49052)],['E1 server on E6 page',page(6,1,61603,1)],['dubious server label',page(6,1,61603,6,'Server 2 (no-sub/dub?)')],['HTML challenge','<html>Checking browser</html>'],['no Sub availability',page().replace('data-has-sub="1"','data-has-sub="0"')]
 ]) await test(name+' stops before source API',async()=>{const r=await run(html);assert.equal(r.streams.length,0);assert.equal(r.calls.length,2);});
 await test('published page with only unsupported or uncertain servers fails closed',async()=>{const html=page(6,1,61603,6,'Server 2 (no-sub/dub?)')+'<span data-server-url="https://megaplay.buzz/stream/mal/61603/6/sub" data-lang="sub" data-label="Server 1"></span>';const r=await run(html);assert.equal(r.streams.length,0);assert.equal(r.calls.length,2);});
 await test('unknown slug hint fails closed',async()=>{const r=await run(page(),{noHint:true});assert.equal(r.streams.length,0);assert.equal(r.calls.length,1);});
 await test('conflicting source identity is rejected',async()=>{const r=await run(page(),{source:{metadata:{mal_id:49052,episode:6}}});assert.equal(r.streams.length,0);});
 await test('Aniwave URL is taken from published page',async()=>{const r=await run(page().replace('buzz/mal/','buzz/aniwave/mal/'));assert.equal(r.streams.length,1);assert(r.calls.some(x=>x.includes('/aniwave/mal/61603/6/sub/source')));});
 await test('allowed subtitle tracks still pass through',async()=>{const r=await run(page(),{source:{tracks:[{kind:'captions',file:'https://media.test/en.vtt',label:'English'},{kind:'captions',file:'https://media.test/sprite.vtt',label:'Thumbnails'}]}});assert.equal(r.streams[0].subtitles.length,1);});
 console.log(count+' regression cases passed');
})().catch(e=>{console.error(e);process.exitCode=1});
