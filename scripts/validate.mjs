import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(typeof manifest.name === 'string' && manifest.name.trim(), 'Manifest name is required');
assert(/^\d+\.\d+\.\d+$/.test(manifest.version || ''), 'Invalid manifest version');
assert(Array.isArray(manifest.scrapers), 'scrapers must be an array');
const ids = new Set();
const files = new Set();
for (const scraper of manifest.scrapers) {
  assert(/^[a-z0-9][a-z0-9-]*$/.test(scraper.id || ''), 'Invalid provider id');
  assert(!ids.has(scraper.id), 'Duplicate provider id: ' + scraper.id);
  ids.add(scraper.id);
  for (const field of ['name', 'description', 'author']) {
    assert(typeof scraper[field] === 'string' && scraper[field].trim(), scraper.id + ': missing ' + field);
  }
  assert(/^\d+\.\d+\.\d+$/.test(scraper.version || ''), scraper.id + ': invalid version');
  assert(typeof scraper.enabled === 'boolean', scraper.id + ': enabled must be boolean');
  assert(Array.isArray(scraper.supportedTypes) && scraper.supportedTypes.length > 0 &&
    scraper.supportedTypes.every(type => ['movie', 'tv'].includes(type)), scraper.id + ': invalid supportedTypes');
  assert(/^providers\/[a-z0-9][a-z0-9-]*\.js$/.test(scraper.filename || ''), scraper.id + ': invalid filename');
  assert(!files.has(scraper.filename), 'Duplicate provider filename');
  files.add(scraper.filename);
  assert(fs.existsSync(scraper.filename), 'Missing ' + scraper.filename);
  assert(!fs.lstatSync(scraper.filename).isSymbolicLink(), 'Provider must not be a symlink');
  new vm.Script(fs.readFileSync(scraper.filename, 'utf8'), { filename: scraper.filename });
}
for (const file of fs.readdirSync('providers')) {
  if (file.endsWith('.js') && file !== '_template.js') {
    assert(files.has(path.posix.join('providers', file)), 'Unregistered provider: ' + file);
  }
}
console.log('Validated ' + manifest.scrapers.length + ' anime providers.');
