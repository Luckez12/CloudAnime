const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/title-fallback.js','utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const base={tmdbId:126437,mediaType:'tv',tmdb:{id:126437,name:'Aoashi',original_language:'ja'}};
const media=(extra={})=>Object.assign({id:191788,idMal:61603,countryOfOrigin:'JP',format:'TV',episodes:24,title:{english:'Aoashi Season 2',romaji:'Aoashi 2nd Season',native:'アオアシ 第2期'},synonyms:[]},extra);
function setup(opt={}) {
 const calls=[],logs=[];
 const ctx={setTimeout,clearTimeout,AbortController,URL,console:{log:x=>logs.push(x)},VUEO_DISCOVERY_CONTEXT:opt.context===undefined?copy(base):opt.context,
 fetch:async(url,options={})=>{
  calls.push({url,options});let d;
  if(url==='https://graphql.anilist.co'){
   if(opt.failAni)throw Error('offline');
   if(opt.aniStatus)return {ok:false,status:opt.aniStatus};
   const q=JSON.parse(options.body).variables.search;
   if(opt.failAlias&&q===opt.failAlias)throw Error('offline alias');
   d={data:{Page:{pageInfo:{hasNextPage:!!opt.more},media:opt.media===undefined?[media()]:opt.media}}};
  }else if(url.includes('api.jikan.moe'))d=opt.jikan||{pagination:{has_next_page:false},data:[{mal_id:61603,title:'Aoashi 2nd Season',title_english:'Aoashi Season 2',type:'TV',episodes:24}]};
  else if(url.includes('api.ani.zip'))d=opt.zip||{mappings:{mal_id:61603,anilist_id:191788}};
  else throw Error('Unexpected URL '+url);
  return {ok:true,status:200,text:async()=>JSON.stringify(d)};
 }};
 if(opt.contextHook)ctx.vueoDiscoveryContext=opt.contextHook;
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,calls,logs,run:(id='126437',type='tv',season=2,episode=2,deadline=Date.now()+20000)=>ctx.cloudAnimeTitleFallback(id,type,season,episode,deadline)};
}
(async()=>{
 let n=0;const test=async(name,fn)=>{await fn();n++;console.log('PASS '+name)};
 await test('working original identity returned unchanged with zero fallback HTTP',async()=>{const x=setup(),v={id:7,ep:2};const r=await x.ctx.cloudAnimeRecoverMapping(async()=>v,'126437','tv',2,2);assert.equal(r,v);assert.equal(x.calls.length,0)});
 await test('mapping null falls back to unique exact title + season',async()=>{const x=setup();const r=await x.ctx.cloudAnimeRecoverMapping(async()=>null,'126437','tv',2,2);assert.equal(r.mal_id,61603);assert.equal(r.anilist,191788);assert.equal(r.episode,2);assert.equal(x.calls.length,1)});
 await test('mapping outage falls back',async()=>{const x=setup();assert(await x.ctx.cloudAnimeRecoverMapping(async()=>{throw Error('HTTP 503')},'126437','tv',2,2));});
 await test('explicit identity conflict cannot be overridden',async()=>{const x=setup();await assert.rejects(x.ctx.cloudAnimeRecoverMapping(async()=>{throw Error('Dataset identity mismatch')},'126437','tv',2,2));assert.equal(x.calls.length,0)});
 for(const [name,opt] of [
 ['first season result',{media:[media({idMal:49052,title:{english:'Aoashi'}})]}],
 ['substring title',{media:[media({title:{english:'The Aoashi Season 2 Story'},synonyms:[]})]}],
 ['duplicate title with different anime IDs',{media:[media(),media({id:999,idMal:888})]}],
 ['conflicting catalogue IDs for same MAL',{media:[media(),media({id:999})]}],
 ['duplicate title cannot be disambiguated by episode count',{media:[media({episodes:1}),media({id:999,idMal:888})]}],
 ['missing AniList country',{media:[media({countryOfOrigin:null})]}],
 ['movie in TV request',{media:[media({format:'MOVIE'})]}],
 ['foreign origin',{media:[media({countryOfOrigin:'CN'})]}],
 ['episode outside known total',{media:[media({episodes:1})]}],
 ['unavailable catalogue metadata',{context:null}],
 ['wrong TMDB context',{context:{...copy(base),tmdbId:999}}],
 ['wrong media type context',{context:{...copy(base),mediaType:'movie'}}],
 ['non-Japanese context',{context:{...copy(base),tmdb:{...base.tmdb,original_language:'en'}}}],
 ['paginated ambiguous results',{more:true}],
 ['empty results',{media:[]}],
 ['part 2 is not season 2',{media:[media({title:{english:'Aoashi Part 2'},synonyms:[]})]}]
 ])await test('reject '+name,async()=>{const x=setup(opt);assert.equal(await x.run(),null)});
 await test('special season zero does not guess a title route',async()=>{const x=setup();assert.equal(await x.run('126437','tv',0,1),null);assert.equal(x.calls.length,0)});
 await test('invalid episode rejected before HTTP',async()=>{const x=setup();assert.equal(await x.run('126437','tv',2,0),null);assert.equal(x.calls.length,0)});
 await test('reserve extractor deadline; expired budget adds zero HTTP',async()=>{const x=setup();assert.equal(await x.run('126437','tv',2,2,Date.now()+2000),null);assert.equal(x.calls.length,0)});
 await test('text context decoded',async()=>{const x=setup({context:JSON.stringify(base)});assert(await x.run())});
 await test('context hook fills missing metadata',async()=>{const x=setup({context:null,contextHook:async()=>JSON.stringify(base)});assert(await x.run())});
 await test('native aliases remain exact and season scoped',async()=>{const x=setup({context:{...copy(base),tmdb:{...base.tmdb,name:'アオアシ'}}});assert(await x.run())});
 await test('ordinal season alias canonicalization',async()=>{const x=setup({media:[media({title:{english:'Aoashi Second Season'},synonyms:[]})]});assert(await x.run())});
 await test('AniList outage uses Jikan + exact MAL/AniList bridge',async()=>{const x=setup({failAni:true});const r=await x.run();assert.equal(r.anilist,191788);assert.equal(x.calls.length,3)});
 await test('wrong Jikan MAL bridge rejected',async()=>{const x=setup({failAni:true,zip:{mappings:{mal_id:999,anilist_id:191788}}});assert.equal(await x.run(),null)});
 await test('Jikan pagination cannot select a first result',async()=>{const x=setup({failAni:true,jikan:{pagination:{has_next_page:true},data:[]}});assert.equal(await x.run(),null)});
 await test('one failed alias does not select from partial AniList results',async()=>{const context=copy(base);context.tmdb.original_name='アオアシ';const x=setup({context,failAlias:'アオアシ Season 2',jikan:{data:[],pagination:{has_next_page:false}}});assert.equal(await x.run(),null);assert(x.calls.some(c=>c.url.includes('api.jikan.moe')))});
 await test('movie fallback preserves local episode one',async()=>{const context={tmdbId:123,mediaType:'movie',tmdb:{id:123,title:'Your Name',original_language:'ja'}},x=setup({context,media:[media({format:'MOVIE',episodes:1,title:{english:'Your Name'}})]});const r=await x.run('123','movie',0,99);assert.equal(r.episode,1)});
 await test('title match does not require air dates',async()=>{const x=setup();const r=await x.run();assert(r);assert(!x.calls.some(c=>/season\/|episodes\//.test(c.url)))});
 await test('unsupported IMDb context does not borrow a TMDB title',async()=>{const x=setup();assert.equal(await x.run('tt15792808'),null);assert.equal(x.calls.length,0)});
 await test('IMDb fallback accepts matching explicit IMDb identity',async()=>{const context=copy(base);context.imdbId='tt15792808';const x=setup({context});assert(await x.run('tt15792808'))});
 console.log(n+' title fallback cases passed');
})().catch(e=>{console.error(e);process.exitCode=1});
