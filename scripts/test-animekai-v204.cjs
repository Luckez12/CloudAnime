const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),C=require('crypto-js');
const code=fs.readFileSync('providers/animekai.js','utf8');
const server=(kind,ep=2,mal=61603)=>`<span data-server-url="${kind==='p'?'https://megaplay.buzz/stream':kind==='a'?'https://megavid.buzz/aniwave':'https://megavid.buzz'}/mal/${mal}/${ep}/sub" data-lang="sub" data-label="Server"></span>`;
const page=(servers,active=2,published=1)=>`<div id="watch-page" data-anime="aoashi-season-2" data-episode="${active}"></div><li data-number="2" data-published="${published}" data-has-sub="1"></li>${servers}`;
const hls='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=10000\na.m3u8';
const player='<script>settings={type:"sub"}</script><div id="megaplay-player" data-id="180537"></div>';
const key=C.enc.Hex.parse(C.enc.Utf8.parse('i?LMTAx0Q6,:}50U').toString(C.enc.Hex).padEnd(64,'0'));
const encrypted={enc:C.AES.encrypt(JSON.stringify({file:'https://media.test/p'}),key,{iv:C.enc.Utf8.parse("W0;27ToaUpl_P%'c"),mode:C.mode.CBC,padding:C.pad.Pkcs7}).ciphertext.toString(C.enc.Base64),tracks:[{file:'https://media.test/en.vtt',label:'English',kind:'captions'},{file:'https://media.test/sprite.vtt',label:'Thumbnails',kind:'captions'}]};
async function run(opt={}) {
 const calls=[],logs=[],aborts=[];let vAttempts=0;
 const ctx={module:{exports:{}},URL,AbortController,setTimeout,clearTimeout,require,console:{log:x=>logs.push(x)},fetch:async(u,o)=>{
  calls.push(u); if(u.includes('/aniwave/'))throw Error('Server 3 must never be requested');
  let body,status=200,delay=0;
  if(u.includes('arm.haglund'))body=[{themoviedb:126437,'themoviedb-season':2,myanimelist:61603,media:'TV','anime-planet':'aoashi-season-2'}];
  else if(u.includes('animekai.li'))body=opt.html||page(server('p')+server('v')+server('a'));
  else if(u.includes('/stream/mal/')){body=opt.player||player;delay=opt.pDelay||0;}
  else if(u.includes('/stream/getSources')){assert.equal(o.headers['X-Requested-With'],'XMLHttpRequest');body=opt.pPayload||encrypted;}
  else if(u.includes('/source?')){vAttempts++;body=opt.vError||opt.vFirstHtml&&vAttempts===1?'<html>busy</html>':{status:'ok',source:'https://media.test/v',...(opt.vPayload||{})};delay=opt.vDelay||0;}
  else if(u==='https://media.test/p'){body=opt.pHls||hls;delay=opt.pHlsDelay||0;}
  else if(u==='https://media.test/v'){body=opt.vHls||hls;delay=opt.vHlsDelay||0;}
  else throw Error('Unexpected URL '+u);
  if(delay)await new Promise((resolve,reject)=>{const t=setTimeout(resolve,delay);o.signal.addEventListener('abort',()=>{clearTimeout(t);aborts.push(u);reject(Error('aborted'))},{once:true});});
  return {ok:status===200,status,text:async()=>typeof body==='string'?body:JSON.stringify(body)};
 }};
 vm.createContext(ctx);vm.runInContext(code,ctx);const result=await ctx.module.exports.getStreams('126437','tv',2,2);
 return {result,calls,logs,aborts,vAttempts};
}
(async()=>{
 let n=0;async function test(name,fn){await fn();console.log('PASS '+name);n++;}
 await test('Server 1 decrypts real codec and cancels slow Server 2',async()=>{const r=await run({vDelay:80});assert.equal(r.result[0].serverName,'MegaPlay');assert.equal(r.result[0].subtitles.length,1);assert.equal(r.aborts.length,1);});
 await test('Server 2 wins and cancels slow Server 1',async()=>{const r=await run({pDelay:80});assert.equal(r.result[0].serverName,'MegaVid');assert.equal(r.aborts.length,1);});
 await test('fast HTML error cannot win race',async()=>{const r=await run({vError:true,pDelay:20});assert.equal(r.result[0].serverName,'MegaPlay');assert.equal(r.vAttempts,2);});
 await test('Server 2 HTML retry succeeds',async()=>{const r=await run({html:page(server('v')),vFirstHtml:true});assert.equal(r.result.length,1);assert.equal(r.vAttempts,2);});
 await test('race waits for HLS verification, not JSON arrival',async()=>{const r=await run({pHlsDelay:80,vDelay:10});assert.equal(r.result[0].serverName,'MegaVid');assert(r.aborts.includes('https://media.test/p'));});
 await test('invalid HLS loses to valid HLS',async()=>{const r=await run({pHls:'<html>error</html>',vDelay:20});assert.equal(r.result[0].serverName,'MegaVid');});
 await test('both failures return empty and bounded retry',async()=>{const r=await run({player:'<html>error</html>',vError:true});assert.equal(r.result.length,0);assert.equal(r.vAttempts,2);});
 await test('Server 3 only is rejected without source request',async()=>{const r=await run({html:page(server('a'))});assert.equal(r.result.length,0);assert.equal(r.calls.length,2);});
 await test('unpublished episode is rejected before racing',async()=>{const r=await run({html:page(server('p')+server('v'),2,0)});assert.equal(r.result.length,0);assert.equal(r.calls.length,2);});
 await test('redirected episode is rejected before racing',async()=>{const r=await run({html:page(server('p')+server('v'),1)});assert.equal(r.result.length,0);assert.equal(r.calls.length,2);});
 await test('wrong season and wrong episode server routes rejected',async()=>{const r=await run({html:page(server('p',2,49052)+server('v',1))});assert.equal(r.result.length,0);assert.equal(r.calls.length,2);});
 await test('source identity conflict is not retried',async()=>{const r=await run({html:page(server('v')),vPayload:{metadata:{mal_id:49052}}});assert.equal(r.result.length,0);assert.equal(r.vAttempts,1);});
 await test('mixed audio master is rejected',async()=>{const r=await run({html:page(server('v')),vHls:hls+'\n#EXT-X-MEDIA:TYPE=AUDIO,LANGUAGE="en",URI="en.m3u8"'});assert.equal(r.result.length,0);});
 console.log(n+' regression cases passed');
})().catch(e=>{console.error(e);process.exitCode=1});
