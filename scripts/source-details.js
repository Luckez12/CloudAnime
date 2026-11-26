/* CLOUDANIME_SOURCE_DETAILS_V1: display only; no network requests. */
function cloudAnimeSourceDetails(streams, providerName, providerId, logo) {
  if (!Array.isArray(streams)) return streams;
  function clean(value) { return typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() : ''; }
  return streams.map(function(stream) {
    if (!stream || typeof stream !== 'object') return stream;
    var old = clean(stream.title), title = clean(stream.sourceTitle || stream.animeTitle);
    if (!title && !/^(?:MAL|AniList|Episode|Japanese Sub)\b/i.test(old)) {
      title = clean(String(stream.title || '').split(/\r?\n/)[0]).split(/\s*[•·]\s*/)[0].replace(/\s*-\s*Episode\s+\d+.*$/i, '').trim();
      if (/^(?:Anime|Kurage|CloudAnime)$/i.test(title)) title = '';
    }
    var match = /\b(?:Episode\s+|S\d+E)(\d+)\b/i.exec(old);
    var ep = Number(stream.sourceEpisode || match && match[1]);
    var server = clean(stream.serverName || stream.server).replace(/\s+(?:Hardsub|Softsub)$/i, '');
    var quality = clean(String(stream.quality || ''));
    if (/^(?:unknown|undefined|null)$/i.test(quality)) quality = '';
    var audio = clean(stream.audioLanguage || stream.audio);
    audio = /^(?:ja|jp|jpn|japanese)$/i.test(audio) ? 'Japanese Audio' : /^(?:en|eng|english)$/i.test(audio) ? 'English Audio' : audio ? audio + ' Audio' : '';
    var tracks = Array.isArray(stream.subtitles) ? stream.subtitles.filter(function(t) { return t && (t.url || t.file || t.src); }) : [];
    var languages = [];
    tracks.forEach(function(t) {
      var label = clean(t.language || t.lang || t.name || t.label);
      label = /^(?:en|eng|english)$/i.test(label) ? 'English' : /^(?:ms|may|malay)$/i.test(label) ? 'Malay' : /^(?:id|ind|indo|indonesian)$/i.test(label) ? 'Indonesian' : label;
      if (label && languages.indexOf(label) < 0) languages.push(label);
    });
    var subType = clean(stream.subtitleType).toLowerCase();
    var sub = subType === 'hardsub' ? 'Hardsub' : subType === 'softsub' || tracks.length ? 'Softsub' : /\bsub\b/i.test(stream.audioType || '') ? 'Sub' : '';
    if (languages.length && sub !== 'Hardsub') sub += ' • ' + languages.slice(0,2).join(', ') + (languages.length > 2 ? ' +' + (languages.length-2) : '');
    var lines = [[title, Number.isInteger(ep) && ep > 0 ? 'EP ' + ep : ''].filter(Boolean).join(' • '), [server, quality, audio].filter(Boolean).join(' • '), sub].filter(Boolean);
    var output = Object.assign({}, stream, { name: providerName, title: lines.join('\n'), serverName: server, sourceTitle: title, sourceEpisode: Number.isInteger(ep) && ep > 0 ? ep : undefined });
    // Use the same identity/server fields as the providers already rendering correctly.
    delete output.server;
    if (providerId) output.provider = providerId;
    if (logo) output.logo = logo;
    return output;
  });
}
function cloudAnimeInstallSourceDetails(provider, providerName, providerId, logo) {
  var original = provider.getStreams;
  return Object.assign({}, provider, {getStreams:function() {
    var receiver=this,args=arguments;
    return Promise.resolve().then(function(){return original.apply(receiver,args);}).then(function(streams){return cloudAnimeSourceDetails(streams,providerName,providerId,logo);});
  }});
}
/* CLOUDANIME_SOURCE_DETAILS_END */
