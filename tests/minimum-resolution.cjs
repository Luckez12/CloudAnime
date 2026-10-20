const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const policy=fs.readFileSync(path.join(root,'scripts/minimum-resolution.js'),'utf8');
const cases=[];
for(const n of [144,240,360,480,540,576,640,719]){
 cases.push([{quality:n+'p'},false],[{quality:String(n)},false],[{height:n,quality:'Auto'},false]);
}
for(const n of [720,1080,1440,2160,4320]) cases.push([{quality:n+'p'},true],[{height:n},true]);
cases.push([{quality:'SD'},false],[{resolution:'854x480'},false],[{quality:'1920×1080'},true],
 [{quality:'480i'},false],[{name:'Host | 576p Sub'},false],[{quality:'Auto',name:'Host 480p'},false],
 [{quality:'Unknown',filename:'anime.360p.mp4'},false],[{quality:'Unknown',title:'Episode 480'},true],
 [{quality:'Unknown',url:'https://cdn.test/480/720/video.mp4?height=360'},true],
 [{quality:'Auto'},true],[{quality:'Adaptive'},true],[{quality:'Unknown'},true],[{},true],
 [{quality:'HD'},true],[{quality:'FHD'},true],[{quality:'4K'},true],[{quality:'UHD'},true],
 [{quality:null},true],[{quality:'',height:0},true],[{quality:'720p',name:'Old 480p host'},true],
 [{quality:'1080p',height:480},false],[{resolution:'1280x720',quality:'480p'},true]);
let checks=0;
(async()=>{
 for(const provider of manifest.scrapers){
  const code=fs.readFileSync(path.join(root,provider.filename),'utf8');
  new vm.Script(code,{filename:provider.filename});
  const ctx={module:{exports:{}},console:{log(){},error(){},warn(){}},require:()=>({}),URL,URLSearchParams,setTimeout,clearTimeout,AbortController,TextEncoder,TextDecoder,fetch:()=>{throw Error("Unexpected HTTP") }};
  ctx.global=ctx;ctx.self=ctx;vm.createContext(ctx);
  // Evaluate the actual provider initialization, preserving all exports/settings.
  const marker=code.indexOf('/* CLOUDANIME_MINIMUM_RESOLUTION_V1');
  assert(marker>0);vm.runInContext(code.slice(0,marker),ctx);
  assert.equal(typeof ctx.module.exports.getStreams,'function',provider.id);
  const original=ctx.module.exports;
  let received;
  const headers={Referer:'https://site.test'},subtitles=[{url:'https://cdn.test/en.vtt',language:'en'}];
  const fixtures=cases.map(([data],i)=>({...data,url:data.url||'https://cdn.test/'+i,headers,subtitles,id:i}));
  original.getStreams=function(...args){received={args,receiver:this};return Promise.resolve(fixtures)};
  original.settings={kept:true};
  vm.runInContext(code.slice(marker),ctx);
  assert.equal(ctx.getStreams,ctx.module.exports.getStreams);assert.equal(ctx.global.getStreams,ctx.getStreams);assert.equal(ctx.self.getStreams,ctx.getStreams);
  assert.equal(ctx.module.exports.settings,original.settings);
  const output=await ctx.getStreams('tmdb:12','tv',2,4);
  assert.deepEqual(received.args,['tmdb:12','tv',2,4]);
  assert.deepEqual(Array.from(output,s=>s.id),cases.map(([,keep],i)=>keep?i:null).filter(i=>i!==null),provider.id);
  for(const s of output){assert.equal(s,fixtures[s.id]);assert.equal(s.headers,headers);assert.equal(s.subtitles,subtitles)}
  // Both all-low and empty lists finish as empty, without a network fallback here.
  assert.equal(ctx.cloudAnimeMinimumResolution([{quality:'480p'}],provider.id).length,0);
  assert.equal(ctx.cloudAnimeMinimumResolution([],provider.id).length,0);
  checks+=cases.length;console.log('PASS',provider.id,cases.length,'resolution cases; provider init, exports, metadata retained');
 }
 const c={console:{log(){}},VUEO_DISCOVERY_CONTEXT:{tmdb:{name:'The 480p Story'}}};vm.createContext(c);vm.runInContext(policy,c);
 assert.equal(c.cloudAnimeResolutionHeight({title:'The 480p Story | Sub',quality:'Auto'}),null);
 let receiver,args;const p={getStreams:function(){receiver=this;args=Array.from(arguments);return [{quality:'480p'},{quality:'720p'}]}};
 const adapted=c.cloudAnimeInstallMinimumResolution(p,'test');assert.equal((await adapted.getStreams(1,2)).length,1);assert.equal(receiver,adapted);assert.deepEqual(args,[1,2]);
 const error=new Error('upstream');await assert.rejects(()=>c.cloudAnimeInstallMinimumResolution({getStreams(){throw error}},'test').getStreams(),e=>e===error);
 console.log('PASS',checks,'provider resolution cases + context, sync, rejection checks; no HTTP calls');
})().catch(e=>{console.error(e);process.exitCode=1});
