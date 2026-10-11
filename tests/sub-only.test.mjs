import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(fs.readFileSync('manifest.json'));
function load(source) {
  const box = { module: { exports: {} }, require, URL, URLSearchParams, Promise, setTimeout, clearTimeout,
    atob, btoa, console: { log() {}, warn() {}, error() {} },
    fetch: async () => { throw Error('Offline test'); } };
  box.globalThis = box; box.global = box;
  vm.createContext(box); vm.runInContext(source, box, { timeout: 3000 });
  return box;
}
const policySource = fs.readFileSync('scripts/sub-only.js', 'utf8');
const stream = (name, extra = {}) => ({ name, url: 'https://cdn.invalid/master.m3u8', ...extra });
test('sub-only keeps English subtitles without treating them as English dub', () => {
  const box = load(policySource);
  const original = stream('HiAnime [MegaPlay] (SUB)', { subtitles: [
    { language: 'eng', url: 'https://cdn.invalid/en.vtt', headers: { Referer: 'https://origin.invalid/' } },
    { language: 'ms-MY', url: 'https://cdn.invalid/ms.vtt' },
    { lang: 'Indonesian', url: 'https://cdn.invalid/id.vtt' },
    { language: 'fr', url: 'https://cdn.invalid/fr.vtt' },
    { name: 'Thumbnails', url: 'https://cdn.invalid/thumbs.vtt' }
  ] });
  const out = box.module.exports.cloudAnimeFilterStreams([original], 'test');
  assert.equal(out.length, 1); assert.equal(out[0].subtitles.length, 3);
  assert.deepEqual(Array.from(out[0].subtitles, s => s.name), ['English', 'Malay', 'Indo']);
  assert.equal(out[0].subtitles[0].headers.Referer, 'https://origin.invalid/');
  assert.equal(original.subtitles.length, 5); assert.equal(original.subtitles[0].name, undefined);
});
test('dub, mixed audio and unknown identity are excluded, including contradictory sub labels', () => {
  const policy = load(policySource).module.exports;
  const input = [stream('Server SUB'), stream('Server DUB'), stream('Sub & Dub'),
    stream('Japanese Dual Audio'), stream('Unknown', { subtitles: [{ language: 'en', url: 'https://cdn.invalid/en.vtt' }] }),
    stream('SUB', { audioLanguage: 'en' }), stream('SUB', { language: 'English' }),
    stream('SUB', { audio: { language: 'hi' } }), stream('SUB', { audioTracks: [{ language: 'ja' }, { language: 'en' }] }),
    stream('SUB', { audioLanguages: ['ja', 'en'] }),
    stream('Server', { audioLanguage: 'ja' })];
  const out = policy.cloudAnimeFilterStreams(input, 'test');
  assert.deepEqual(Array.from(out, s => s.name), ['Server SUB', 'Server']);
});
test('content titles are not audio metadata and cannot turn dub into sub', () => {
  const box = load(policySource);
  box.VUEO_DISCOVERY_CONTEXT = { tmdb: { title: 'Japanese Sub Adventures' } };
  assert.equal(box.module.exports.cloudAnimeAudioDecision(stream('Server', { title: 'Japanese Sub Adventures' })), 'unknown-audio');
  assert.equal(box.module.exports.cloudAnimeAudioDecision(stream('Japanese Sub Adventures')), 'unknown-audio');
  box.VUEO_DISCOVERY_CONTEXT = { tmdb: { title: 'Dub Club' } };
  assert.equal(box.module.exports.cloudAnimeAudioDecision(stream('Server SUB', { title: 'Dub Club' })), 'sub');
});
for (const entry of manifest.scrapers) {
  test(entry.id + ': portable load, host guards and sub gate before display', async () => {
    const source = fs.readFileSync(entry.filename, 'utf8');
    const box = load(source);
    assert.equal(typeof box.module.exports.getStreams, 'function');
    assert.equal(box.getStreams, box.module.exports.getStreams);
    assert.equal((await box.module.exports.getStreams('', 'movie')).length, 0);
    assert.equal((await box.module.exports.getStreams('123', 'unsupported')).length, 0);
    assert.equal((await box.module.exports.getStreams('123', 'tv', 1, 0)).length, 0);
    // Same media URL for sub/dub must retain the sub result, including when dub is first.
    const raw = box.cloudbankWrapProvider({ getStreams: async () => [stream('DUB'), stream('SUB')] }, entry.id, ['tv']);
    const wrapped = box.cloudbankDisplayInstall(raw, entry.name, entry.id);
    box.VUEO_DISCOVERY_CONTEXT = { tmdb: { id: 123, name: 'Fixture Show', first_air_date: '2024-01-01' } };
    const output = await wrapped.getStreams('123', 'tv', 1, 1);
    assert.equal(output.length, 1);
    assert.equal(output[0].url, 'https://cdn.invalid/master.m3u8');
    assert.ok(output[0].title.includes('Fixture Show'));
    assert.ok(!output[0].title.includes('DUB'));
  });
}
