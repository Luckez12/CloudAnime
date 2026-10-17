const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../providers/reanime.js'),'utf8');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/linked-episodes.json'),'utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
async function run(src,rows,datasets,season,episode,type='tv',id='220542'){
 let calls=[],mapped=null;
 let box={module:{exports:{}},URL,setTimeout,clearTimeout,console:{log(){}},fetch:async(url)=>{
 calls.push(url);let u=new URL(url),data;
 if(u.hostname==='arm.haglund.dev')data=rows;
 else if(u.hostname==='api.ani.zip')data=datasets[u.searchParams.get('anilist_id')]||null;
 else if(u.hostname==='api.themoviedb.org')data={id:220542,name:'The Apothecary Diaries',first_air_date:'2023-01-01'}; // Actual broker behavior: series-shaped metadata, not episode data.
 else if(u.hostname==='reanime.to'){mapped=u.pathname;data={success:false};}
 else throw Error('Unexpected endpoint');
 return{ok:true,status:200,text:async()=>JSON.stringify(data)};
 }};vm.runInNewContext(src,box,{timeout:1500});await box.module.exports.getStreams(id,type,season,episode);return{calls,mapped};
}
(async()=>{
 for(const e of [1,2,3,4]){
  const r=await run(source,fixture.arm,fixture.datasets,1,e);assert.equal(r.mapped,'/api/flix/161645/'+e);assert(!r.calls.some(u=>u.includes('themoviedb.org')));assert.equal(r.calls.length,6); // ARM + four datasets + Reanime; mapping itself five calls.
 }
 let r=await run(source,fixture.arm,fixture.datasets,1,25);assert.equal(r.mapped,null);
 let d=clone(fixture.datasets);d['161645'].episodes['1'].tvdbShowId=999;r=await run(source,fixture.arm,d,1,1);assert.equal(r.mapped,null);
 d=clone(fixture.datasets);d['161645'].mappings.themoviedb_id='999';r=await run(source,fixture.arm,d,1,1);assert.equal(r.mapped,null);
 let a=clone(fixture.arm);a[0]['thetvdb-season']=2;r=await run(source,a,fixture.datasets,1,1);assert.equal(r.mapped,null);
 a=clone(fixture.arm);a[1]['thetvdb-season']=1;d=clone(fixture.datasets);d['176301'].episodes['1'].seasonNumber=1;r=await run(source,a,d,1,1);assert.equal(r.mapped,null);
 // Unique season and movie paths stay unchanged and do not load AniZip.
 r=await run(source,[fixture.arm[0]],{},1,3);assert.equal(r.mapped,'/api/flix/161645/3');assert.equal(r.calls.length,2);
 r=await run(source,[{anilist:5,themoviedb:99,media:'MOVIE'}],{},null,null,'movie','99');assert.equal(r.mapped,'/api/flix/5/1');assert.equal(r.calls.length,2);
 if(process.env.REANIME_OLD_SOURCE){const old=fs.readFileSync(process.env.REANIME_OLD_SOURCE,'utf8');r=await run(old,fixture.arm,fixture.datasets,1,1);assert.equal(r.mapped,null);assert(r.calls.some(u=>u.includes('themoviedb.org')));}
 console.log('PASS: captured-data S1E1–4, broker-shaped metadata regression, zero TMDB episode calls, wrong IDs/season/ambiguous matches rejected, unsupported E25 skipped, existing unique/movie paths preserved.');
})().catch(e=>{console.error(e);process.exit(1)});
