/* CloudAnime AnimeNoSub v1.0.0 — standalone runtime provider. */
/* Cloudbank anime mapping adapter. No Node globals or runtime imports. */
function cloudbankAnimeMappingFetch(nativeFetch) {
  var cache = Object.create(null), cacheKeys = [], tmdbKey = "", documents = Object.create(null), documentKeys = [], malTitles = Object.create(null), titleKeys = [];
  function response(data, status) {
    var body = JSON.stringify(data);
    return { ok: status === 200, status: status, statusText: status === 200 ? "OK" : "Not Found",
      headers: { get: function(n) { return String(n).toLowerCase() === "content-type" ? "application/json" : null; } },
      json: function() { return Promise.resolve(JSON.parse(body)); }, text: function() { return Promise.resolve(body); },
      clone: function() { return response(data, status); } };
  }
  function loadJson(url) {
    var timer, settled = false;
    return new Promise(function(resolve) {
      function finish(value) { if (settled) return; settled = true; clearTimeout(timer); resolve(value); }
      timer = setTimeout(function() { finish(null); }, 8000);
      Promise.resolve().then(function() { return nativeFetch(url); }).then(function(r) {
        return r.ok ? r.json() : null;
      }).then(finish, function() { finish(null); });
    });
  }
  function json(url) {
    var hit = documents[url];
    if (hit && Date.now() - hit.time < 300000) return hit.promise;
    var entry = { time: Date.now(), promise: null };
    entry.promise = loadJson(url).then(function(data) {
      if (!data) delete documents[url];
      return data;
    });
    documents[url] = entry;
    documentKeys.push(url);
    if (documentKeys.length > 20) delete documents[documentKeys.shift()];
    return entry.promise;
  }
  function positive(value) { var n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
  function day(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ""; }
  function compatible(a, b) {
    if (!a || !b) return false;
    return Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) <= 86400000;
  }
  async function resolve(id, season, episode, movie) {
    var isImdb = /^tt\d+$/.test(id);
    if (!isImdb && !positive(id)) return null;
    var route = isImdb ? "imdb" : "themoviedb";
    var armPromise = json("https://arm.haglund.dev/api/v2/" + route + "?id=" + encodeURIComponent(id));
    // TMDB episode dates take precedence over Cinemeta's alternative season numbering.
    var metaPromise = !movie && isImdb ? json("https://v3-cinemeta.strem.io/meta/series/" + id + ".json") : Promise.resolve(null);
    var rows = await armPromise;
    if (!Array.isArray(rows)) return null;
    rows = rows.filter(function(r) {
      return r && positive(r.myanimelist) && (isImdb ? r.imdb === id : String(r.themoviedb) === id) &&
        (movie ? r.media === "MOVIE" && r["themoviedb-season"] == null :
          r["themoviedb-season"] != null && Number(r["themoviedb-season"]) === season);
    });
    var seen = Object.create(null);
    rows = rows.filter(function(r) { var key = r.myanimelist; if (seen[key]) return false; seen[key] = true; return true; });
    if (!rows.length || rows.length > 6) return null;
    if (movie) {
      if (rows.length !== 1) return null;
      return { mal_id: positive(rows[0].myanimelist), anilist: positive(rows[0].anilist), mal_episode: 1, episode: 1 };
    }
    if (!isImdb && /^tt\d+$/.test(rows[0].imdb || "")) {
      metaPromise = json("https://v3-cinemeta.strem.io/meta/series/" + rows[0].imdb + ".json");
    }
    var tmdbId = positive(rows[0].themoviedb), target = "", dayIndex = 0;
    var episodeUrl = tmdbKey && tmdbId ? "https://api.themoviedb.org/3/tv/" + tmdbId + "/season/" + season + "?api_key=" + encodeURIComponent(tmdbKey) : "";
    var seasonPromise = episodeUrl ? json(episodeUrl) : Promise.resolve(null);
    var datasetsPromise = Promise.all(rows.map(function(r) { return json("https://api.ani.zip/mappings?mal_id=" + r.myanimelist); }));
    var seasonData = await seasonPromise, metaData = await metaPromise;
    var videos = seasonData && Array.isArray(seasonData.episodes) ? seasonData.episodes :
      metaData && metaData.meta && Array.isArray(metaData.meta.videos) ? metaData.meta.videos : [];
    function number(v) { return Number(v.episode_number != null ? v.episode_number : v.episode != null ? v.episode : v.number); }
    function seasonOf(v) { return Number(v.season_number != null ? v.season_number : v.season); }
    function released(v) { return day(v.air_date || v.released || v.firstAired); }
    var selected = videos.find(function(v) { return seasonOf(v) === season && number(v) === episode; });
    if (!selected || !(target = released(selected))) return null;
    dayIndex = videos.filter(function(v) {
      return released(v) === target && (seasonOf(v) < season || seasonOf(v) === season && number(v) < episode);
    }).length;
    var datasets = await datasetsPromise, matches = [];
    datasets.forEach(function(data, i) {
      if (!data || !data.mappings || Number(data.mappings.mal_id) !== Number(rows[i].myanimelist) || !data.episodes) return;
      var list = Object.keys(data.episodes).map(function(k) { return data.episodes[k]; }).filter(function(e) {
        return e && /^\d+$/.test(String(e.episode)) && positive(e.episode) && compatible(day(e.airdate || e.airDate || e.airDateUtc), target);
      }).sort(function(a,b) { return Number(a.episode) - Number(b.episode); });
      // Exact dates win; +/- one day accounts only for local/UTC broadcast dates.
      var exact = list.filter(function(e) { return day(e.airdate || e.airDate || e.airDateUtc) === target; });
      if (exact.length) list = exact;
      if (!list[dayIndex] || list.length > 1 && dayIndex === 0 &&
          videos.filter(function(v) { return released(v) === target; }).length < list.length) return;
      var titles = data.titles || {}, ep = Number(list[dayIndex].episode);
      matches.push({ mal_id: Number(rows[i].myanimelist), anilist: positive(rows[i].anilist),
        mal_episode: ep, episode: ep, anime_title: titles.en || titles["x-jat"] || titles.ja || "",
        titles: Object.keys(titles).map(function(k) { return titles[k]; }).filter(Boolean), air_date: target });
    });
    return matches.length === 1 ? matches[0] : null;
  }
  return function(url, options) {
    var text = typeof url === "string" ? url : url && url.url, u;
    try { u = new URL(text); } catch (_) { return nativeFetch(url, options); }
    var method = options && options.method ? String(options.method).toUpperCase() : "GET";
    if (u.hostname === "api.themoviedb.org" && u.searchParams.get("api_key")) tmdbKey = u.searchParams.get("api_key");
    var malDetail = /^\/v4\/anime\/(\d+)$/.exec(u.pathname);
    if (method === "GET" && u.hostname === "api.jikan.moe" && malDetail && malTitles[malDetail[1]]) {
      return Promise.resolve(response({ data: { mal_id: Number(malDetail[1]), title: malTitles[malDetail[1]] } }, 200));
    }
    var legacy = u.hostname === "id-mapping-api-malid.hf.space" && u.pathname === "/api/resolve";
    var anikoto = u.hostname === "arm.haglund.dev" && u.pathname === "/api/v2/tmdb";
    if (method !== "GET" || !legacy && !anikoto) return nativeFetch(url, options);
    var id = u.searchParams.get("id") || "", movie = anikoto && !u.searchParams.has("s");
    var season = Number(u.searchParams.get("s")), episode = positive(u.searchParams.get("e"));
    if (!movie && (!Number.isInteger(season) || season < 0 || !episode || !u.searchParams.has("s")))
      return Promise.resolve(response({ error: "Invalid anime episode" }, 404));
    var key = JSON.stringify([id, movie, season, episode]);
    if (!cache[key]) {
      cache[key] = resolve(id, season, episode, movie).then(function(data) {
        if (!data) delete cache[key];
        if (data && data.anime_title) {
          if (!malTitles[data.mal_id]) titleKeys.push(data.mal_id);
          malTitles[data.mal_id] = data.anime_title;
          if (titleKeys.length > 32) delete malTitles[titleKeys.shift()];
        }
        return data;
      }, function() { delete cache[key]; return null; });
      cacheKeys.push(key);
      if (cacheKeys.length > 32) delete cache[cacheKeys.shift()];
    }
    return cache[key].then(function(data) { return response(data || { error: "Verified anime mapping unavailable" }, data ? 200 : 404); });
  };
}

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


(function() {
  'use strict';
  var BASE = 'https://animenosub.to';
  var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var cheerio = require('cheerio-without-node-native');
  var CryptoJS = require('crypto-js');
  function log(stage, message) { console.log('[AnimeNoSub] ' + stage + ': ' + message); }
  function http(value, base) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { var u = new URL(value, base || BASE); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (_) { return ''; }
  }
  function local(value) { var u = http(value); return u && new URL(u).origin === BASE ? u : ''; }
  function norm(value) {
    return String(value || '').toLowerCase().replace(/\benglish sub(?:bed)?\b/g, '').replace(/\((?:uncensored|tv)\)/g, '')
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ').trim();
  }
  function dub(value) { return /(?:^|[\s/()_-])(?:dub(?:bed)?|dual[ -]?audio|multi[ -]?audio)(?:$|[\s/()_-])/i.test(String(value)); }
  function requestScope(deadline) {
    return async function(url, options) {
      var left = Math.min(7500, deadline - Date.now());
      if (left <= 0) throw new Error('Request budget finished');
      var timer, controller = typeof AbortController === 'function' ? new AbortController() : null;
      var opts = Object.assign({}, options || {});
      opts.headers = Object.assign({ 'User-Agent': UA, Referer: BASE + '/' }, opts.headers || {});
      if (controller) opts.signal = controller.signal;
      try {
        return await Promise.race([
          Promise.resolve().then(function() { return fetch(url, opts); }).then(async function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' at ' + new URL(url).hostname);
            var body = await r.text();
            return { ok: true, status: r.status, text: function() { return Promise.resolve(body); },
              json: function() { return Promise.resolve().then(function() { return JSON.parse(body); }); } };
          }),
          new Promise(function(_, reject) { timer = setTimeout(function() { if (controller) controller.abort(); reject(new Error('HTTP timeout')); }, left); })
        ]);
      } finally { clearTimeout(timer); }
    };
  }
  async function getStreams(id, type, season, episode) {
    type = type === 'series' ? 'tv' : type;
    if (!['movie', 'tv'].includes(type) || !/^(?:tt\d+|\d+)$/.test(String(id))) return [];
    if (type === 'tv' && (!Number.isInteger(Number(season)) || Number(season) < 0 || !Number.isInteger(Number(episode)) || Number(episode) < 1)) return [];
    var deadline = Date.now() + 28500, streams = [], closed = false, timer;
    var req = requestScope(deadline), mapping = cloudbankAnimeMappingFetch(req);
    async function text(url, options) { return (await req(url, options)).text(); }
    async function json(url, options) { return (await req(url, options)).json(); }
    async function work() {
      var context = typeof globalThis !== 'undefined' && globalThis.VUEO_DISCOVERY_CONTEXT;
      var tmdb = context && context.tmdb || {};
      if (tmdb.original_language && tmdb.original_language !== 'ja') return;
      // Use the existing strict mapping helper; no title-based season guessing.
      var route = type === 'movie' ? 'https://arm.haglund.dev/api/v2/tmdb?id=' + encodeURIComponent(id) :
        'https://id-mapping-api-malid.hf.space/api/resolve?id=' + encodeURIComponent(id) + '&s=' + season + '&e=' + episode;
      var response = await mapping(route), mapped = response.ok ? await response.json() : null;
      if (!mapped || !mapped.mal_id) { log('MAPPING', 'No verified anime episode'); return; }
      var data = await json('https://api.ani.zip/mappings?mal_id=' + mapped.mal_id);
      if (!data.mappings || Number(data.mappings.mal_id) !== mapped.mal_id) return;
      var ani = await json('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: 'query($mal:Int){Media(idMal:$mal,type:ANIME){idMal countryOfOrigin format title{romaji english native}}}', variables: { mal: mapped.mal_id } }) });
      var media = ani.data && ani.data.Media;
      if (!media || media.idMal !== mapped.mal_id || media.countryOfOrigin !== 'JP' || type === 'movie' && media.format !== 'MOVIE') return;
      var titles = Object.keys(data.titles || {}).map(function(k) { return data.titles[k]; }).concat(Object.values(media.title || {})).filter(Boolean);
      var aliases = Array.from(new Set(titles.map(norm).filter(Boolean)));
      var queries = Array.from(new Set([media.title.romaji, media.title.english].filter(Boolean))).slice(0, 2);
      if (!queries.length) return;
      log('MAPPING', 'MAL ' + mapped.mal_id + ', episode ' + mapped.episode);
      var results = await Promise.all(queries.map(async function(query) {
        try {
          var result = await json(BASE + '/wp-admin/admin-ajax.php', { method: 'POST', headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: BASE },
            body: 'action=ts_ac_do_search&ts_ac_query=' + encodeURIComponent(query) });
          return result.anime && result.anime[0] && result.anime[0].all || [];
        } catch (e) { log('SEARCH', e.message); return []; }
      }));
      var candidates = [], seen = Object.create(null);
      results.flat().forEach(function(item) {
        var url = local(item.post_link);
        if (!url || !/^\/anime\/[^/]+\/$/.test(new URL(url).pathname) || seen[url] || dub(item.post_title + ' ' + url) || !/^sub$/i.test(item.post_sub || '')) return;
        if (type === 'movie' && !/^movie$/i.test(item.post_type || '') || type === 'tv' && /^movie$/i.test(item.post_type || '')) return;
        if (!aliases.includes(norm(item.post_title))) return;
        seen[url] = true; candidates.push(item);
      });
      if (candidates.length !== 1) { log('SEARCH', 'Exact sub title matches: ' + candidates.length + '; skipped ambiguity'); return; }
      var selected = candidates[0], seriesUrl = local(selected.post_link);
      var $series = cheerio.load(await text(seriesUrl));
      var mainTitle = $series('meta[property="og:title"]').attr('content') || $series('title').text();
      if (dub(mainTitle)) return;
      var episodes = [];
      $series('li[data-index]').each(function(_, element) {
        var li = $series(element), label = li.find('.epl-num').text().trim();
        var n = /^movie$/i.test(label) ? 1 : /^\d+$/.test(label) ? Number(label) : 0;
        var url = local(li.find('a[href]').first().attr('href'));
        if (n === Number(mapped.episode) && url && !dub(url) && !episodes.includes(url)) episodes.push(url);
      });
      if (episodes.length !== 1) { log('EPISODE', 'Exact episode unavailable or ambiguous'); return; }
      var epUrl = episodes[0], $ep = cheerio.load(await text(epUrl));
      var epTitle = $ep('meta[property="og:title"]').attr('content') || $ep('title').text();
      if (dub(epTitle)) return;
      var embeds = [], embedSeen = Object.create(null);
      $ep('select option[data-index]').each(function(_, element) {
        var option = $ep(element), label = option.text().trim();
        if (dub(label)) return;
        try {
          var html = CryptoJS.enc.Latin1.stringify(CryptoJS.enc.Base64.parse(option.attr('value') || ''));
          var frame = cheerio.load(html)('iframe').attr('src'), url = http(frame, epUrl);
          if (!url || dub(new URL(url).pathname) || embedSeen[url]) return;
          embedSeen[url] = true; embeds.push({ url: url, label: label });
        } catch (_) {}
      });
      log('SERVERS', embeds.length + ' sub servers');
      await Promise.all(embeds.slice(0, 6).map(async function(embed) {
        try {
          // AnimeNoSub direct.php is a wrapper, not the final video host.
          // Read its iframe/encoded URL without evaluating website JavaScript.
          var embedUrl = embed.url, embedReferer = epUrl, wrapperSeen = Object.create(null);
          for (var hop = 0; hop < 2 && new URL(embedUrl).origin === BASE; hop++) {
            var wrapper = new URL(embedUrl);
            if (wrapper.pathname !== '/direct.php' || !/\/sub(?:[&#]|$)/i.test(wrapper.search) || wrapperSeen[embedUrl]) {
              log('SERVER', 'Invalid or repeated Sub wrapper: ' + wrapper.pathname); return;
            }
            wrapperSeen[embedUrl] = true;
            var wrapperHtml = await text(embedUrl, { headers: { Referer: embedReferer } });
            var next = http(cheerio.load(wrapperHtml)('iframe[src]').first().attr('src'), embedUrl);
            if (!next) {
              var encoded = /\biframeUrl\s*=\s*decodeUrl\s*\(\s*['"]([A-Za-z0-9+/=]+)['"]\s*\)/.exec(wrapperHtml);
              if (encoded) next = http(CryptoJS.enc.Latin1.stringify(CryptoJS.enc.Base64.parse(encoded[1].split('').reverse().join(''))), embedUrl);
            }
            if (!next || dub(new URL(next).pathname)) { log('SERVER', 'Sub wrapper has no usable player URL'); return; }
            log('WRAPPER', wrapper.pathname + ' -> ' + new URL(next).hostname + new URL(next).pathname);
            embedReferer = embedUrl; embedUrl = next;
          }
          embed = { url: embedUrl, label: embed.label };
          var u = new URL(embed.url), host = u.hostname, headers = { Referer: u.origin + '/', Origin: u.origin, 'User-Agent': UA };
          var sources = [], tracks = [], server;
          if (/^([a-z0-9-]+\.)?upn\.one$/i.test(host)) {
            server = 'Nova';
            var code = /^#([a-z0-9]+)$/i.exec(u.hash);
            if (!code) return;
            var hex = (await text('https://nova.upn.one/api/v1/video?id=' + code[1] + '&w=1920&h=1080&r=', { headers: { Referer: 'https://nova.upn.one/' } })).trim();
            if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 32) return;
            var decrypted = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Hex.parse(hex) }, CryptoJS.enc.Hex.parse('6b69656d7469656e6d75613931316361'),
              { iv: CryptoJS.enc.Hex.parse('313233343536373839306f6975797472'), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
            var nova = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
            sources = [{ file: nova.cf || nova.source }]; headers.Referer = 'https://nova.upn.one/'; headers.Origin = 'https://nova.upn.one';
          } else if (/^(?:www\.)?vidmoly\.(net|biz|to)$/i.test(host)) {
            server = 'Vidmoly';
            var html = await text(embed.url), m = /sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i.exec(html);
            if (m) sources = [{ file: m[1] }];
            headers.Referer = 'https://vidmoly.biz/'; headers.Origin = 'https://vidmoly.biz';
          } else if (/^megaplay\.[a-z]+$/i.test(host) && /^\/stream\//.test(u.pathname)) {
            server = 'MegaPlay';
            var html = await text(embed.url, { headers: { Referer: embedReferer } }), page = cheerio.load(html), fileId = page('[data-id]').first().attr('data-id');
            if (!fileId || !/^[a-z0-9_-]+$/i.test(fileId)) { log('MegaPlay', 'Player unavailable'); return; }
            var payload = await json(u.origin + '/stream/getSources?id=' + encodeURIComponent(fileId) + '&id=' + encodeURIComponent(fileId), {
              headers: { Referer: embed.url, 'X-Requested-With': 'XMLHttpRequest' } });
            if (payload.encrypted || payload.enc) { log('MegaPlay', 'Encrypted source response (enc/encrypted); MegaPlay decoding required'); return; }
            sources = Array.isArray(payload.sources) ? payload.sources : payload.sources && payload.sources.file ? [payload.sources] : [];
            tracks = Array.isArray(payload.tracks) ? payload.tracks.filter(function(t) { return /^(captions|subtitles)$/.test(t.kind); }).map(function(t) {
              return { url: http(t.file, embed.url), language: t.srclang || t.language || '', label: t.label || '' };
            }) : [];
          } else { log('SERVER', 'Unsupported host: ' + host); return; }
          var valid = sources.map(function(source) { return { url: http(source.file || source.url, embed.url), label: source.label || '' }; }).filter(function(source) { return /\.m3u8(?:[?#]|$)/i.test(source.url); });
          // Return each server's master first. Keep the original media headers and do not emit embed pages.
          var resolved = await Promise.all(valid.map(async function(source) {
            try {
              var manifest = await text(source.url, { headers: headers });
              if (!/^\s*#EXTM3U/.test(manifest)) return null;
              // An explicitly foreign/multiple audio group is rejected even on a Sub server.
              var audio = manifest.split(/\r?\n/).filter(function(line) { return /^#EXT-X-MEDIA:.*TYPE=AUDIO/.test(line); });
              if (audio.some(function(line) { var lang = /LANGUAGE="([^"]+)"/.exec(line); return !lang || !/^(ja|jp|jpn)$/i.test(lang[1]); })) return { rejectedAudio: true };
              return { source: source, master: /#EXT-X-STREAM-INF:/.test(manifest) };
            } catch (e) { log(server, e.message); return null; }
          }));
          if (resolved.some(function(item) { return item && item.rejectedAudio; })) { log(server, 'Foreign or unidentified audio group; skipped server'); return; }
          resolved = resolved.filter(Boolean);
          if (resolved.some(function(item) { return item.master; })) resolved = resolved.filter(function(item) { return item.master; });
          resolved.forEach(function(item) {
            if (closed || streams.some(function(s) { return s.url === item.source.url && s.server === server; })) return;
            var quality = item.master ? 'Auto' : /^\d{3,4}p$/.test(item.source.label) ? item.source.label : 'Unknown';
            streams.push({ name: 'AnimeNoSub · ' + server + ' · ' + quality, title: selected.post_title + '\nJapanese Audio · Sub\n' + server + ' · ' + quality,
              url: item.source.url, quality: quality, type: 'hls', audioLanguage: 'ja', audioType: 'sub', server: server,
              headers: headers, subtitles: tracks });
          });
        } catch (e) { log('SERVER', e.message); }
      }));
    }
    try {
      await Promise.race([work().catch(function(e) { log('ERROR', e.message); }), new Promise(function(resolve) { timer = setTimeout(resolve, 28500); })]);
    } finally { closed = true; clearTimeout(timer); }
    log('RESULT', streams.length + ' validated sub streams');
    return cloudAnimeFilterStreams(streams, 'animenosub');
  }
  module.exports = { getStreams: getStreams };
  if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;
  if (typeof global !== 'undefined') global.getStreams = getStreams;
})();

/* CLOUDBANK_PLAYIMDB_DISPLAY_START */
/* CLOUDBANK_PLAYIMDB_DISPLAY_V1
 * Embedded in each provider: the app downloads standalone JavaScript files.
 * Presentation only. No network requests and no changes to playback fields.
 */
function cloudbankDisplayInstall(provider, providerName, providerId) {
  if (providerId === "playimdb") return provider; // Reference output stays exactly upstream.
  var details = Object.create(null);
  var keys = [];
  function remember(key, value) {
    if (!details[key]) keys.push(key);
    details[key] = value;
    while (keys.length > 16) delete details[keys.shift()];
  }
  if (typeof vueoSharedTmdb === "function") {
    var shared = vueoSharedTmdb;
    vueoSharedTmdb = function(url, fallback) {
      var match = /\/3\/(movie|tv)\/(\d+)(?:\?|$)/.exec(String(url));
      return Promise.resolve(shared(url, fallback)).then(function(value) {
        if (match && value && typeof value === "object") remember(match[1] + "/" + match[2], value);
        return value;
      });
    };
  }
  function clean(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE0F\u200D]/g, "").replace(/\s+/g, " ").trim();
  }
  function usable(value) {
    var text = clean(value);
    return /^(?:unknown(?: title)?|n\/?a|none|null|undefined|auto|stream|original[- ]audio)$/i.test(text) ? "" : text;
  }
  function unique(list) {
    return list.filter(function(value, index) { return value && list.indexOf(value) === index; });
  }
  var languages = { en: "English", eng: "English", english: "English", ms: "Malay", msa: "Malay", may: "Malay", malay: "Malay", id: "Indonesian", ind: "Indonesian", indo: "Indonesian", indonesian: "Indonesian", hi: "Hindi", hin: "Hindi", hindi: "Hindi", ta: "Tamil", tam: "Tamil", tamil: "Tamil", te: "Telugu", tel: "Telugu", telugu: "Telugu", ja: "Japanese", jpn: "Japanese", japanese: "Japanese", ko: "Korean", kor: "Korean", korean: "Korean", zh: "Chinese", zho: "Chinese", chi: "Chinese", chinese: "Chinese", es: "Spanish", spa: "Spanish", spanish: "Spanish", fr: "French", fra: "French", fre: "French", french: "French", de: "German", deu: "German", ger: "German", german: "German", ar: "Arabic", ara: "Arabic", arabic: "Arabic", pt: "Portuguese", por: "Portuguese", portuguese: "Portuguese", ru: "Russian", rus: "Russian", russian: "Russian", it: "Italian", ita: "Italian", italian: "Italian", th: "Thai", tha: "Thai", thai: "Thai", vi: "Vietnamese", vie: "Vietnamese", vietnamese: "Vietnamese", ml: "Malayalam", mal: "Malayalam", malayalam: "Malayalam", bn: "Bengali", ben: "Bengali", bengali: "Bengali", tr: "Turkish", tur: "Turkish", turkish: "Turkish" };
  function language(value) {
    var text = clean(value).toLowerCase().replace(/[-_](?:us|gb|my|id|cn|tw|br|pt)$/, "");
    return languages[text] || "";
  }
  function metadata(id, type) {
    if (details[type + "/" + id]) return details[type + "/" + id];
    var raw = typeof globalThis !== "undefined" ? globalThis.VUEO_DISCOVERY_CONTEXT : null;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (_) { raw = null; } }
    if (!raw || typeof raw !== "object") return {};
    var tmdb = raw.tmdb || raw;
    var contextId = raw.tmdbId || tmdb.id;
    if (String(contextId) !== String(id) || (raw.mediaType && raw.mediaType !== type)) return {};
    return tmdb;
  }
  function format(stream, index, meta, type, season, episode) {
    if (!stream || typeof stream !== "object" || !stream.url) return stream;
    var output = Object.assign({}, stream);
    var originalTitle = typeof stream.title === "string" ? stream.title : "";
    var displayTitle = usable(meta.title || meta.name);
    var year = /\b(?:19|20)\d{2}\b/.exec(clean(meta.release_date || meta.first_air_date || meta.year));
    var lines = [];
    if (displayTitle) {
      if (year) displayTitle += " (" + year[0] + ")";
      if (type === "tv" && Number.isInteger(Number(season)) && Number(season) >= 0 && Number(episode) >= 1) {
        displayTitle += " · S" + (Number(season) < 10 ? "0" : "") + Number(season) + "E" + (Number(episode) < 10 ? "0" : "") + Number(episode);
      }
      lines.push(displayTitle);
    } else {
      // Keep a source-provided content title when it is recognisable as one.
      var first = clean(originalTitle.split(/\r?\n/)[0]);
      var providerLabel = clean(providerName.replace(/\s+V\d+$/i, ""));
      var isProviderTitle = providerLabel && first.toLowerCase().indexOf(providerLabel.toLowerCase()) === 0;
      var isTechnicalTitle = /^(?:\d{3,4}p|4k|Server\s+\d+|Unknown|Subtitles:|WEB[- ]DL|BluRay|HLS|M3U8|MP4|DASH)\b/i.test(first);
      if (first && /[A-Za-z\u0080-\uFFFF]/.test(first) && !isProviderTitle && !isTechnicalTitle) lines.push(first);
    }
    var text = [stream.name, originalTitle, stream.fileName, stream.filename, stream.videoCodec, stream.codec, stream.audioCodec, stream.audioChannels, stream.releaseSource, stream.sourceQuality, stream.hdr].map(clean).join(" ");
    // Film titles containing words such as English or BluRay are not technical metadata.
    var contentTitle = clean(meta.title || meta.name) || (lines.length ? lines[0] : "");
    if (contentTitle) text = text.split(contentTitle).join("");
    var quality = usable(stream.quality);
    var resolution = /\b(2160|1440|1080|720|576|480|360|240|144)p?\b/i.exec(quality);
    if (!resolution) resolution = /\b(2160|1440|1080|720|576|480|360|240|144)p\b/i.exec(text);
    var qualityLabel = resolution ? (resolution[1] === "2160" ? "4K" : resolution[1] + "p") : (/\b4k\b/i.test(quality + " " + text) ? "4K" : "");
    var audioLang = language(stream.audioLanguage || stream.language || stream.lang);
    var audioLanguages = Array.isArray(stream.audioLanguages) ? unique(stream.audioLanguages.map(language)) : [];
    if (!audioLang && audioLanguages.length === 1) audioLang = audioLanguages[0];
    var explicitAudio = /\b(English|Malay|Indonesian|Hindi|Tamil|Telugu|Japanese|Korean|Chinese|Spanish|French|Arabic)[ -]Audio\b/i.exec(text);
    if (!audioLang && explicitAudio) audioLang = language(explicitAudio[1]);
    var labelledAudio = /🌍\s*([^|\n]+)/.exec(originalTitle);
    if (!audioLang && labelledAudio) audioLang = language(labelledAudio[1]);
    var filenameAudio = /(?:^|[._ -])(English|Malay|Indonesian|Hindi|Tamil|Telugu|Japanese|Korean|Chinese)(?=[._ -]|$)/i.exec(clean(stream.fileName || stream.filename));
    if (!audioLang && filenameAudio) audioLang = language(filenameAudio[1]);
    // MovieBlast exposes its language as a trailing parenthesised code.
    var parenthesised = /\(([A-Za-z]{2,3})\)\s*$/.exec(clean(originalTitle));
    if (!audioLang && parenthesised) audioLang = language(parenthesised[1]);
    var audioLabel = audioLang ? audioLang + " Audio" : "";
    if (audioLanguages.length > 1) audioLabel = "Multi Audio (" + audioLanguages.join(", ") + ")";
    if (/^original$/i.test(clean(stream.audioLanguage)) || /\boriginal[- ]audio\b/i.test(text)) audioLabel = "Original Audio";
    if (/\bdual[- ]audio\b/i.test(text)) audioLabel = "Dual Audio" + (audioLang ? " (" + audioLang + ")" : "");
    else if (/\b(?:multi[- ]audio|multilingual)\b/i.test(text)) audioLabel = "Multi Audio" + (audioLang ? " (" + audioLang + ")" : "");
    var server = usable(stream.serverName || stream.server || stream.sourceName);
    var labelledServer = /📌\s*([^|\n]+)/.exec(originalTitle);
    if (!server && labelledServer) server = usable(labelledServer[1]);
    if (!server) {
      server = clean(stream.name);
      [providerName, providerName.replace(/\s+V\d+$/i, ""), providerId, providerId.replace(/-v\d+$/, "")].forEach(function(label) {
        label = clean(label);
        if (!label) return;
        if (server.toLowerCase().indexOf(label.toLowerCase()) === 0) server = server.slice(label.length).trim();
      });
      if (!server) {
        var titleServer = clean(originalTitle);
        var baseLabel = clean(providerName.replace(/\s+V\d+$/i, ""));
        if (baseLabel && titleServer.toLowerCase().indexOf(baseLabel.toLowerCase() + " - ") === 0) {
          server = titleServer.slice(baseLabel.length + 3).replace(/\([A-Za-z]{2,3}\)\s*$/, "").trim();
        }
      }
      server = server.replace(/\b\d{3,4}p\b|\b(?:4k|FHD|UHD|Auto)\b/gi, "")
        .replace(/\((?:English|Hindi|Tamil|Telugu|Malay|Indonesian|EN|HI|TA|TE|MS|ID)\)/gi, "").trim();
      // Keep descriptive host names; omit names consisting of quality/audio labels.
      if (/\b(?:\d{3,4}p|4k|audio|FHD|UHD|HLS|M3U8|MP4|BluRay|WEB-DL)\b/i.test(server)) {
        var numbered = /\bServer\s+\d+\b/i.exec(server);
        server = numbered ? numbered[0] : "";
      }
      server = usable(server.replace(/^[|·: -]+|[|·: -]+$/g, ""));
      if (server.length > 80) server = "";
    }
    if (!server) server = "Server " + (index + 1);
    var path = String(stream.url).split(/[?#]/)[0];
    var formatLabel = /\.m3u8$/i.test(path) ? "HLS" : /\.mp4$/i.test(path) ? "MP4" : /\.mkv$/i.test(path) ? "MKV" : /\.mpd$/i.test(path) ? "DASH" : "";
    if (!formatLabel) {
      var declared = clean(stream.format || stream.mimeType || stream.type);
      if (/^(?:hls|m3u8|application\/(?:vnd\.apple\.mpegurl|x-mpegurl))$/i.test(declared)) formatLabel = "HLS";
      else if (/^(?:mp4|video\/mp4)$/i.test(declared)) formatLabel = "MP4";
      else if (/^(?:dash|application\/dash\+xml)$/i.test(declared)) formatLabel = "DASH";
    }
    var minutes = Number(stream.runtimeMinutes || (type === "movie" ? meta.runtime : 0));
    var duration = minutes > 0 && Number.isFinite(minutes) ? Math.round(minutes) + " min" : "";
    if (!duration) { var dm = /\b(\d+)\s*min(?:utes)?\b/i.exec(clean(stream.duration) + " " + text); if (dm && Number(dm[1]) > 0) duration = dm[1] + " min"; }
    var firstLine = lines.length ? "🎬 " + lines[0] : "";
    // Match PlayIMDb's original typography and order, without its guessed defaults.
    if (displayTitle) {
      firstLine = type === "tv" ? "🎬 " + usable(meta.title || meta.name) + " - S" + Number(season) + "E" + Number(episode) + (year ? " (" + year[0] + ")" : "") :
        "🎬 " + usable(meta.title || meta.name) + (year ? " - " + year[0] : "");
    }
    var qualityDisplay = qualityLabel === "4K" ? "2160P" : qualityLabel.toUpperCase();
    var audioDisplay = audioLabel.replace(/[- ]Audio/g, "").trim();
    var infoLine = [qualityDisplay ? "💎 " + qualityDisplay : "", audioDisplay ? "🌍 " + audioDisplay : ""].filter(Boolean).join(" | ");
    var bottomLine = [formatLabel ? "🎞️ " + (formatLabel === "HLS" ? "M3U8" : formatLabel) : "", duration ? "⏱️ " + duration : "", "📌 " + server].filter(Boolean).join(" | ");
    var nameQuality = qualityLabel === "4K" ? "4K UHD" : qualityLabel === "1080p" ? "1080p FHD" : qualityLabel === "720p" ? "720p HD" : qualityLabel;
    output.name = ["🟡 " + providerName, nameQuality, audioLabel ? audioLabel.replace(/ Audio/g, "-Audio") : ""].filter(Boolean).join(" | ");
    output.title = [firstLine, infoLine, bottomLine].filter(Boolean).join("\n");
    return output;
  }
  var original = provider.getStreams;
  var adapted = Object.assign({}, provider);
  adapted.getStreams = function(id, type, season, episode) {
    var args = arguments;
    var mediaType = type === "series" ? "tv" : type;
    return Promise.resolve().then(function() { return original.apply(provider, args); }).then(function(streams) {
      if (!Array.isArray(streams)) return streams;
      var meta = metadata(id, mediaType);
      streams = cloudAnimeFilterStreams(streams, "animenosub");
      return streams.map(function(stream, index) {
        try { return format(stream, index, meta, mediaType, season, episode); } catch (_) { return stream; }
      });
    });
  };
  return adapted;
}
module.exports = cloudbankDisplayInstall(module.exports, "AnimeNoSub", "animenosub");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
/* CLOUDBANK_PLAYIMDB_DISPLAY_END */
