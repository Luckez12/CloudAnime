/* CLOUDANIME_SUB_ONLY_V1: inspect upstream labels before display formatting. */
function cloudAnimeAudioDecision(stream) {
  if (!stream || typeof stream !== 'object') return 'invalid';
  function clean(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
  function japanese(value) { return /^(ja|jp|jpn|japanese|日本語)$/.test(clean(value)); }
  var audio = clean(stream.audioLanguage || stream.audio_language || (typeof stream.audio === 'string' ? stream.audio : stream.audio && (stream.audio.language || stream.audio.lang))); 
  var tracks = Array.isArray(stream.audioLanguages) ? stream.audioLanguages : Array.isArray(stream.audioTracks) ? stream.audioTracks.map(function(track) { return track && (track.language || track.lang); }) : [];
  if (audio && !japanese(audio)) return 'dub-or-unknown-audio';
  if (tracks.length && !tracks.every(japanese)) return 'mixed-or-dub-audio';
  var title = typeof stream.title === 'string' ? stream.title : '';
  var name = typeof stream.name === 'string' ? stream.name : '';
  // Content titles are not language evidence (e.g. a title containing "Dub").
  var context = typeof globalThis !== 'undefined' && globalThis.VUEO_DISCOVERY_CONTEXT;
  var tmdb = context && context.tmdb || {};
  var contentTitles = [tmdb.title, tmdb.name, tmdb.original_title, tmdb.original_name, context && context.title];
  contentTitles.forEach(function(value) {
    if (typeof value === 'string' && value) title = title.split(value).join('');
      name = name.split(value).join('');
  });
  var label = [name, title, stream.audioType, stream.audioFormat, stream.subDub,
    stream.dubSub, stream.version, stream.audioLabel].map(clean).join(' ');
  if (/\b(dub|dubbed|dual[ -]?audio|multi[ -]?audio|multilingual)\b/.test(label)) return 'dub-or-mixed';
  if (/\b(hindi|tamil|telugu|korean|chinese|mandarin|french|arabic|spanish|portuguese)[ -]audio\b/.test(label)) return 'foreign-audio';
  if (/\[(?:english|hindi|tamil|telugu|korean|chinese|mandarin|french|arabic|spanish|portuguese)\]/.test(label)) return 'foreign-audio';
  if (/\benglish[ -]audio\b/.test(label)) return 'dub';
  if (/🌍\s*(english|hindi|tamil|telugu|korean|chinese|mandarin|french|arabic|spanish|portuguese)\b/.test(label)) return 'foreign-audio';
  var generic = clean(stream.language || stream.lang);
  if (generic && !japanese(generic) && !/^(sub|subbed|dub|dubbed)$/.test(generic)) return 'dub-or-unknown-audio';
  if (/^(dub|dubbed)$/.test(generic)) return 'dub';
  if (japanese(audio) || (tracks.length && tracks.every(japanese)) || japanese(generic)) return 'sub';
  if (/\b(sub|subbed|subtitled|hardsub|softsub)\b/.test(label) || /^(sub|subbed)$/.test(generic)) return 'sub';
  if (/\b(japanese|jpn)\b/.test(label) || /🇯🇵/.test(label)) return 'sub';
  return 'unknown-audio';
}

function cloudAnimeSubtitleLanguage(track) {
  var values = [track.language, track.lang, track.srclang, track.name, track.label];
  for (var i = 0; i < values.length; i++) {
    var value = typeof values[i] === 'string' ? values[i].trim().toLowerCase() : '';
    if (/^(en|eng|english)(?:\b|[-_])/.test(value)) return 'English';
    if (/^(ms|msa|may|malay|bahasa melayu)(?:\b|[-_])/.test(value)) return 'Malay';
    if (/^(id|ind|indo|indonesian|bahasa indonesia)(?:\b|[-_])/.test(value)) return 'Indo';
  }
  return '';
}

function cloudAnimeFilterStreams(streams, providerId) {
  if (!Array.isArray(streams)) return [];
  var rejected = 0;
  var result = streams.filter(function(stream) {
    var decision = cloudAnimeAudioDecision(stream);
    if (decision !== 'sub') { rejected++; return false; }
    return true;
  }).map(function(stream) {
    var output = Object.assign({}, stream);
    if (Array.isArray(stream.subtitles)) {
      output.subtitles = stream.subtitles.filter(function(track) {
        return track && typeof track.url === 'string' && /^https?:\/\//i.test(track.url) && cloudAnimeSubtitleLanguage(track);
      }).map(function(track) {
        var label = cloudAnimeSubtitleLanguage(track);
        return Object.assign({}, track, { name: label, language: label === 'English' ? 'en' : label === 'Malay' ? 'ms' : 'id' });
      });
    }
    return output;
  });
  if (rejected && typeof console !== 'undefined' && console.log) {
    console.log('[CloudAnime:' + providerId + '] Sub-only: kept ' + result.length + ', excluded ' + rejected + ' dub/mixed/unknown audio results');
  }
  return result;
}

if (typeof module !== 'undefined') module.exports = { cloudAnimeAudioDecision: cloudAnimeAudioDecision,
  cloudAnimeSubtitleLanguage: cloudAnimeSubtitleLanguage, cloudAnimeFilterStreams: cloudAnimeFilterStreams };
