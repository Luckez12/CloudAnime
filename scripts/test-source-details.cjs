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
 const result=context.cloudAnimeSourceDetails([stream],p.name,p.id,p.logo)[0];
 assert.equal(result.name,p.name);assert.equal(result.title,'Actual Season 2 • EP 2\nMegaPlay • Auto • Japanese Audio\nSoftsub • English, Malay');
 for(const key of ['url','headers','subtitles','intro','quality','audioLanguage'])assert.strictEqual(result[key],stream[key]);
 assert.equal(result.provider,p.id);assert.equal(result.logo,p.logo);assert.equal(result.server,undefined);assert.equal(result.serverName,'MegaPlay');assert.equal(stream.name,'old emoji label');
}
const unknown=context.cloudAnimeSourceDetails([{title:'MAL 42 • Episode 1 • Japanese Sub',quality:'Unknown',subtitles:[]}],'HiAnime')[0];
assert.equal(unknown.title,'EP 1');
const hard=context.cloudAnimeSourceDetails([{title:'Example\nJapanese Audio · Sub',subtitleType:'hardsub',audioLanguage:'ja',quality:'1080p'}],'Example')[0];
assert.equal(hard.title,'Example\n1080p • Japanese Audio\nHardsub');
console.log('PASS uniform details and playback field preservation for all 15 providers; unknown metadata and hardsub cases');

const ani=context.cloudAnimeSourceDetails([{title:'Source title',server:'Ani.pm Softsub',quality:'Auto',audioLanguage:'ja',sourceEpisode:1,subtitleType:'softsub'}],'Ani.pm','anipm','logo')[0];
assert.equal(ani.title,'Source title • EP 1\nAni.pm • Auto • Japanese Audio\nSoftsub');assert.equal(ani.server,undefined);assert.equal(ani.serverName,'Ani.pm');
