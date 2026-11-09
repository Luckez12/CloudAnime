const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 let aborted=0,started=0;
 const ctx={module:{exports:{}},require,URL,AbortController,setTimeout,clearTimeout,console:{log(){},error(){}},fetch:async(u,o={})=>{
  if(u.includes('arm.haglund')){await new Promise(r=>setTimeout(r,20));return{ok:true,text:async()=>'[]'}}
  started++;
  return new Promise((resolve,reject)=>{o.signal.addEventListener('abort',()=>{aborted++;reject(Error('aborted'))},{once:true})});
 }};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('providers/allanime.js','utf8'),ctx);
 const begin=Date.now();let guard;
 try{const result=await Promise.race([ctx.module.exports.getStreams('126437','tv',2,2),new Promise((_,reject)=>{guard=setTimeout(()=>reject(Error('Provider waited for hanging bootstrap')),500)})]);assert.equal(result.length,0);assert(started>0);assert.equal(aborted,started);console.log('PASS no identity exits in '+(Date.now()-begin)+' ms and cancels '+aborted+' hanging requests');}finally{clearTimeout(guard)}
})().catch(e=>{console.error(e);process.exitCode=1});
