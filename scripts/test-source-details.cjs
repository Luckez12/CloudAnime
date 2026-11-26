const fs=require('fs'),vm=require('vm'),assert=require('assert');
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
const helper=fs.readFileSync('scripts/source-details.js','utf8');
const context={};vm.createContext(context);vm.runInContext(helper,context);
for(const p of manifest.scrapers){
 const code=fs.readFileSync(p.filename,'utf8');
 assert.equal(code.split('/* CLOUDANIME_SOURCE_DETAILS_V1:').length-1,1);
 assert(!code.includes('cloudbankDisplayInstall'));
 assert(code.includes(helper));
 const stream={name:'old emoji label',title:'MAL 123 • Episode 14 • Japanese Sub',sourceTitle:'Actual Season 2',sourceEpisode:2,quality:'Auto',server:'MegaPlay',audioLanguage:'ja',url:'https://sample.invalid/video#key',headers:{Referer:'https://sample.invalid'},subtitles:[{url:'https://sample.invalid/en',language:'en'},{url:'https://sample.invalid/ms',language:'ms'}],intro:{start:1,end:20}};
 const result=context.cloudAnimeSourceDetails([stream],p.name)[0];
 assert.equal(result.name,p.name);assert.equal(result.title,'Actual Season 2\nMegaPlay • Auto\nEP 2 • Japanese Audio • Softsub: English, Malay');
 for(const key of ['url','headers','subtitles','intro','quality','server','audioLanguage'])assert.strictEqual(result[key],stream[key]);
 assert.equal(stream.name,'old emoji label');
}
const unknown=context.cloudAnimeSourceDetails([{title:'MAL 42 • Episode 1 • Japanese Sub',quality:'Unknown',subtitles:[]}],'HiAnime')[0];
assert.equal(unknown.title,'EP 1');
const hard=context.cloudAnimeSourceDetails([{title:'Example\nJapanese Audio · Sub',subtitleType:'hardsub',audioLanguage:'ja',quality:'1080p'}],'Example')[0];
assert.equal(hard.title,'Example\n1080p\nJapanese Audio • Hardsub');
console.log('PASS uniform details and playback field preservation for all 15 providers; unknown metadata and hardsub cases');
