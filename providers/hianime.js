/* CLOUDANIME_TITLE_FALLBACK_V1: embedded in standalone providers; no runtime imports. */
function cloudAnimeTitleKey(value) {
  var s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (s.normalize) s = s.normalize('NFKC');
  var ordinals = {second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
  s = s.replace(/\b(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+season\b/g, function(_, n) {return 'season '+ordinals[n];})
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g, 'season $1')
    .replace(/第\s*(\d+)\s*期/g, 'season $1');
  // Do not strip numbers, part/cour labels or sequel suffixes.
  return s.replace(/[^a-z0-9\u00c0-\uffff]/g, '');
}
async function cloudAnimeTitleFallback(id, type, season, episode, deadline) {
  id=String(id); type=type==='series'?'tv':type; season=Number(season); episode=type==='movie'?1:Number(episode);
  if (!/^(?:tt\d+|[1-9]\d*)$/.test(id) || !['tv','movie'].includes(type) ||
      type==='tv'&&(!Number.isInteger(season)||season<1||!Number.isInteger(episode)||episode<1)) return null;
  // Leave time for the existing extractor; never extend its deadline.
  var until=Math.min(Date.now()+7000,typeof deadline==='number'?deadline-2500:Infinity), calls=0;
  if (until<=Date.now()) return null;
  async function bounded(work, limit) {
    var timer;
    try { return await Promise.race([Promise.resolve().then(work),new Promise(function(_,reject){timer=setTimeout(function(){reject(Error('Title fallback timeout'));},Math.max(1,Math.min(limit,until-Date.now())));})]); }
    finally { clearTimeout(timer); }
  }
  async function request(url, options) {
    if (Date.now()>=until) throw Error('Title fallback budget exhausted');
    var controller=typeof AbortController==='function'?new AbortController():null, timer;
    options=Object.assign({},options||{});options.headers=Object.assign({Accept:'application/json'},options.headers||{});
    if(controller) options.signal=controller.signal;
    calls++;
    try {
      return await Promise.race([
        Promise.resolve().then(function(){return fetch(url,options);}).then(async function(r){
          if(!r.ok)throw Error('Catalogue HTTP '+r.status);
          var body=await r.text();if(body.length>1500000)throw Error('Catalogue response too large');return JSON.parse(body);
        }),
        new Promise(function(_,reject){timer=setTimeout(function(){if(controller)controller.abort();reject(Error('Catalogue timeout'));},Math.max(1,Math.min(3000,until-Date.now())));})
      ]);
    } finally { clearTimeout(timer); }
  }
  function positive(n){return Number.isInteger(Number(n))&&Number(n)>0?Number(n):null;}
  function read(value){if(typeof value==='string')try{return JSON.parse(value);}catch(_){return null;}return value;}
  function compatible(ctx){
    if(!ctx||typeof ctx!=='object')return false;
    var d=ctx.tmdb||ctx, ref=ctx.tmdbId!=null?ctx.tmdbId:d.id;
    if(/^tt/.test(id)){if(String(ctx.imdbId||d.imdb_id||d.external_ids&&d.external_ids.imdb_id||'')!==id)return false;}
    else if(String(ref)!==id)return false;
    var kind=ctx.mediaType||ctx.type;
    return (!kind||kind===type||kind==='series'&&type==='tv')&&(!d.original_language||d.original_language==='ja');
  }
  function namesFor(n){
    var key=cloudAnimeTitleKey(n);
    if(!key)return [];
    if(type==='movie'||season===1)return [key];
    // A later requested season never accepts an unsuffixed first-season title.
    var numbered=/season(\d+)$/.exec(key);
    if(numbered)return Number(numbered[1])===season?[key]:[];
    return [cloudAnimeTitleKey(n+' Season '+season)];
  }
  function match(c, keys){
    if(!positive(c.mal)||!c.names.some(function(n){return keys.indexOf(cloudAnimeTitleKey(n))>=0;}))return false;
    if(type==='movie'?c.format!=='MOVIE':['TV','TV_SHORT','ONA'].indexOf(c.format)<0)return false;
    if(c.country!=='JP'&&!c.jikan)return false;
    return true;
  }
  try {
    var ctx=read(typeof globalThis!=='undefined'&&globalThis.VUEO_DISCOVERY_CONTEXT);
    if(!compatible(ctx)&&typeof globalThis.vueoDiscoveryContext==='function'&&!/^tt/.test(id))
      ctx=read(await bounded(function(){return globalThis.vueoDiscoveryContext('https://api.themoviedb.org/3/'+type+'/'+id);},2000));
    if(!compatible(ctx))return null;
    var d=ctx.tmdb||ctx, names=[d.name,d.title,d.original_name,d.original_title].concat(ctx.aliases||[]);
    var alt=d.alternative_titles||{};(alt.titles||alt.results||[]).forEach(function(x){if(x)names.push(x.title);});
    names=names.filter(function(n,i,a){return typeof n==='string'&&n.trim()&&a.indexOf(n)===i;});
    var keys=[];names.forEach(function(n){namesFor(n).forEach(function(k){if(keys.indexOf(k)<0)keys.push(k);});});
    if(!keys.length)return null;
    var queries=names.filter(function(n){return namesFor(n).length;}).slice(0,2).map(function(n){
      return type==='tv'&&season>1&&!/season\d+$/.test(cloudAnimeTitleKey(n))?n+' Season '+season:n;
    });
    queries=queries.filter(function(q,i,a){return a.indexOf(q)===i;});
    console.log('[CloudAnime] TITLE_FALLBACK: mapping unavailable; exact title/season search; '+queries.length+' queries');
    var query='query($search:String!){Page(perPage:25){pageInfo{hasNextPage} media(search:$search,type:ANIME){id idMal countryOfOrigin format episodes title{english romaji native} synonyms}}}';
    var candidates=[], catalogueFailed=false, incomplete=false;
    var results=await Promise.all(queries.map(async function(q){
      try {
        var r=await request('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:query,variables:{search:q}})});
        var page=r&&r.data&&r.data.Page;
        if(!page||!Array.isArray(page.media))throw Error('Invalid anime catalogue');
        if(page.pageInfo&&page.pageInfo.hasNextPage){incomplete=true;return [];}
        return page.media.filter(Boolean).map(function(m){var t=m.title||{};return {mal:positive(m.idMal),ani:positive(m.id),country:m.countryOfOrigin,format:m.format,count:positive(m.episodes),names:[t.english,t.romaji,t.native].concat(m.synonyms||[])};});
      } catch(_){catalogueFailed=true;return [];}
    }));
    if(incomplete)return null;
    // Do not select a partial result set when one alias search was unavailable.
    if(catalogueFailed){
      if(d.original_language!=='ja')return null;
      var j=await request('https://api.jikan.moe/v4/anime?q='+encodeURIComponent(queries[0])+'&limit=25');
      if(!j||!Array.isArray(j.data)||j.pagination&&j.pagination.has_next_page)return null;
      candidates=j.data.filter(Boolean).map(function(m){return {mal:positive(m.mal_id),ani:null,country:null,jikan:true,format:String(m.type||'').toUpperCase().replace(/ /g,'_'),count:positive(m.episodes),names:[m.title,m.title_english,m.title_japanese].concat(m.title_synonyms||[],(m.titles||[]).map(function(t){return t.title;}))};});
    }else results.forEach(function(items){candidates=candidates.concat(items);});
    candidates=candidates.filter(function(c){return match(c,keys);});
    var unique=Object.create(null);candidates.forEach(function(c){var old=unique[c.mal];if(old&&old.ani&&c.ani&&old.ani!==c.ani)throw Error('Conflicting catalogue IDs');unique[c.mal]=c;});
    candidates=Object.keys(unique).map(function(k){return unique[k];});
    if(candidates.length!==1){console.log('[CloudAnime] TITLE_FALLBACK: exact candidates='+candidates.length+'; skipped');return null;}
    var chosen=candidates[0];
    if(chosen.count&&episode>chosen.count)return null;
    if(!chosen.ani){
      var zip=await request('https://api.ani.zip/mappings?mal_id='+chosen.mal),m=zip&&zip.mappings;
      if(!m||Number(m.mal_id)!==chosen.mal||!positive(m.anilist_id))return null;
      chosen.ani=Number(m.anilist_id);
    }
    var aliases=chosen.names.filter(function(n,i,a){return typeof n==='string'&&n.trim()&&a.indexOf(n)===i;}),title=aliases.find(function(n){return keys.indexOf(cloudAnimeTitleKey(n))>=0;});
    var value={mal_id:chosen.mal,anilist:chosen.ani,mal_episode:episode,episode:episode,anime_title:title,titles:aliases,expectedEpisodes:chosen.count,animeplanet_slug:'',mapping_method:'exact-title-season-fallback',title_fallback:true};
    console.log('[CloudAnime] TITLE_FALLBACK: unique MAL '+value.mal_id+' / AniList '+value.anilist+'; episode '+episode+'; '+calls+' HTTP calls');
    return value;
  }catch(error){console.log('[CloudAnime] TITLE_FALLBACK: unavailable; '+error.message);return null;}
}
async function cloudAnimeRecoverMapping(original, id, type, season, episode, deadline) {
  try {var mapped=await original();if(mapped)return mapped;}
  catch(error){
    // A known conflict is not a missing identity and must never be overridden.
    if(/conflict|disagree|mismatch|overlap/i.test(String(error&&error.message)))throw error;
  }
  return cloudAnimeTitleFallback(id,type,season,episode,deadline);
}
/* CLOUDANIME_TITLE_FALLBACK_END */

/* CloudAnime HiAnime v2.0.0 — verified ID mapping, one HTTP engine, Sub only. */
(function () {
  "use strict";
  var SITE = "https://megaplay.buzz";
  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  var documents = Object.create(null),
    documentKeys = [];
  function positive(value) {
    var n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function log(stage, message) {
    console.log("[HiAnime] " + stage + ": " + message);
  }
  function address(value, base) {
    if (typeof value !== "string" || value.length > 8192) return "";
    try {
      var u = new URL(value, base);
      return u.protocol === "https:" ? u.href : "";
    } catch (_) {
      return "";
    }
  }
  function attribute(tag, name) {
    var m = new RegExp(
      "(?:^|\\s)" + name + "\\s*=\\s*[\"']([^\"']*)[\"']",
      "i",
    ).exec(tag);
    return m ? m[1] : "";
  }
  function language(track) {
    var fields = [
      track.language,
      track.lang,
      track.srclang,
      track.label,
      track.name,
    ];
    for (var i = 0; i < fields.length; i++) {
      var s =
        typeof fields[i] === "string" ? fields[i].trim().toLowerCase() : "";
      if (/^(?:en|eng|english)(?:$|[\s_(-])/.test(s)) return "en";
      if (/^(?:ms|msa|may|malay|bahasa melayu)(?:$|[\s_(-])/.test(s))
        return "ms";
      if (/^(?:id|ind|indo|indonesian|bahasa indonesia)(?:$|[\s_(-])/.test(s))
        return "id";
    }
    return "";
  }
  async function getStreams(id, type, season, episode) {
    id = String(id || "");
    type = type === "series" ? "tv" : type;
    season = Number(season);
    episode = Number(episode);
    if (!/^(?:tt\d+|\d+)$/.test(id) || (type !== "tv" && type !== "movie"))
      return [];
    if (
      type === "tv" &&
      (!Number.isInteger(season) || season < 0 || !positive(episode))
    )
      return [];
    var deadline = Date.now() + 18000,
      calls = 0;
    async function text(url, extra) {
      var left = Math.min(6500, deadline - Date.now());
      if (left <= 0) throw Error("Request budget exhausted");
      var timer,
        controller =
          typeof AbortController === "function" ? new AbortController() : null;
      var opts = {
        headers: Object.assign(
          { "User-Agent": UA, Referer: SITE + "/" },
          extra || {},
        ),
      };
      if (controller) opts.signal = controller.signal;
      calls++;
      try {
        return await Promise.race([
          Promise.resolve()
            .then(function () {
              return fetch(url, opts);
            })
            .then(async function (r) {
              if (!r.ok)
                throw Error(
                  "HTTP " + r.status + " at " + new URL(url).hostname,
                );
              var body = await r.text();
              if (body.length > 2000000)
                throw Error("Response exceeds size limit");
              return body;
            }),
          new Promise(function (_, reject) {
            timer = setTimeout(function () {
              if (controller) controller.abort();
              reject(Error("HTTP timeout at " + new URL(url).hostname));
            }, left);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function json(url, headers) {
      return JSON.parse(await text(url, headers));
    }
    async function metadata(url) {
      var hit = documents[url];
      if (hit && Date.now() - hit.time < 300000) return hit.data;
      var data = await json(url);
      documents[url] = { time: Date.now(), data: data };
      documentKeys.push(url);
      while (documentKeys.length > 16) delete documents[documentKeys.shift()];
      return data;
    }
    async function mapping() {
      var rows = await metadata(
        "https://arm.haglund.dev/api/v2/" +
          (/^tt/.test(id) ? "imdb" : "themoviedb") +
          "?id=" +
          encodeURIComponent(id),
      );
      if (!Array.isArray(rows)) return null;
      var seen = Object.create(null);
      rows = rows.filter(function (r) {
        if (
          !r ||
          !positive(r.myanimelist) ||
          !(/^tt/.test(id) ? r.imdb === id : String(r.themoviedb) === id) ||
          (type === "movie" ? r.media !== "MOVIE" : r.media === "MOVIE")
        )
          return false;
        var key = [
          r.myanimelist,
          r["themoviedb-season"],
          r.thetvdb,
          r["thetvdb-season"],
        ].join(":");
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      if (type === "movie") {
        var movies = rows.filter(function (r) {
          return r["themoviedb-season"] == null;
        });
        return movies.length === 1
          ? {
              id: Number(movies[0].myanimelist),
              ep: 1,
              method: "exact movie ID",
            }
          : null;
      }
      var exact = rows.filter(function (r) {
        return (
          r["themoviedb-season"] != null &&
          Number(r["themoviedb-season"]) === season
        );
      });
      if (season > 0 && exact.length === 1)
        return {
          id: Number(exact[0].myanimelist),
          ep: episode,
          method: "exact season ID",
        };
      var candidates = exact.filter(function (r) {
        return (
          r["thetvdb-season"] != null &&
          Number(r["thetvdb-season"]) === season &&
          positive(r.thetvdb)
        );
      });
      if (!candidates.length) {
        log("MAPPING", "No explicit season-order bridge");
        return null;
      }
      var datasetById = Object.create(null),
        ids = [];
      candidates.forEach(function (r) {
        var key = String(r.myanimelist);
        if (ids.indexOf(key) < 0) ids.push(key);
      });
      for (var offset = 0; offset < ids.length; offset += 4) {
        await Promise.all(
          ids.slice(offset, offset + 4).map(async function (key) {
            datasetById[key] = await metadata(
              "https://api.ani.zip/mappings?mal_id=" + key,
            ).catch(function () {
              return null;
            });
          }),
        );
      }
      var matches = [],
        matched = Object.create(null);
      candidates.forEach(function (r) {
        var d = datasetById[String(r.myanimelist)];
        if (
          !d ||
          !d.mappings ||
          Number(d.mappings.mal_id) !== Number(r.myanimelist) ||
          String(d.mappings.themoviedb_id) !== String(r.themoviedb) ||
          Number(d.mappings.thetvdb_id) !== Number(r.thetvdb)
        )
          return;
        Object.keys(d.episodes || {}).forEach(function (key) {
          var e = d.episodes[key];
          if (
            !e ||
            !positive(e.episode) ||
            e.seasonNumber == null ||
            e.episodeNumber == null ||
            Number(e.tvdbShowId) !== Number(r.thetvdb) ||
            Number(e.seasonNumber) !== season ||
            Number(e.episodeNumber) !== episode
          )
            return;
          var identity = r.myanimelist + ":" + Number(e.episode);
          if (matched[identity]) return;
          matched[identity] = true;
          matches.push({
            id: Number(r.myanimelist),
            ep: Number(e.episode),
            method: "ARM linked season + AniZip exact episode",
          });
        });
      });
      return matches.length === 1 ? matches[0] : null;
    }
    function decrypt(data) {
      if (typeof data.enc !== "string") return data;
      if (data.enc.length > 1000000 || !/^[A-Za-z0-9_+/=-]+$/.test(data.enc))
        throw Error("Invalid source ciphertext");
      var C = require("crypto-js");
      // Public website AES-CBC codec; key bytes are zero-padded to 32 as in its WebCrypto code.
      var key = C.enc.Hex.parse(
        C.enc.Utf8.parse("i?LMTAx0Q6,:}50U")
          .toString(C.enc.Hex)
          .padEnd(64, "0"),
      );
      var cipher = C.enc.Base64.parse(
        data.enc.replace(/-/g, "+").replace(/_/g, "/"),
      );
      var plain = C.AES.decrypt({ ciphertext: cipher }, key, {
        iv: C.enc.Utf8.parse("W0;27ToaUpl_P%'c"),
        mode: C.mode.CBC,
        padding: C.pad.Pkcs7,
      }).toString(C.enc.Utf8);
      var decoded = JSON.parse(plain);
      if (!decoded || typeof decoded !== "object")
        throw Error("Invalid decrypted source payload");
      return Object.assign({}, data, decoded);
    }
    async function verify(url, headers) {
      var body = (await text(url, headers)).replace(/^\uFEFF/, "").trim();
      if (!body.startsWith("#EXTM3U"))
        throw Error("Source response is not HLS");
      var master = /#EXT-X-STREAM-INF:/.test(body);
      if (!master && !/#EXTINF:/.test(body))
        throw Error("HLS has no media entries");
      var refs = body
        .split(/\r?\n/)
        .map(function (s) {
          return s.trim();
        })
        .filter(function (s) {
          return s && s.charAt(0) !== "#";
        });
      if (
        !refs.length ||
        refs.some(function (s) {
          return !address(s, url);
        })
      )
        throw Error("Invalid HLS media references");
      var audio = body.match(/^#EXT-X-MEDIA:.*TYPE=AUDIO.*$/gm) || [];
      if (
        audio.some(function (s) {
          return !/LANGUAGE="(?:ja|jpn|japanese)"/i.test(s);
        })
      )
        throw Error("Mixed or unverified HLS audio");
      return { url: url, master: master };
    }
    async function extract(mapped) {
      var page = SITE + "/stream/mal/" + mapped.id + "/" + mapped.ep + "/sub";
      var html = await text(page);
      if (!/\btype\s*:\s*["']sub["']/.test(html))
        throw Error("Page did not confirm Sub channel");
      var tags = html.match(/<[^!][^>]*>/g) || [],
        player = tags.find(function (tag) {
          return attribute(tag, "id") === "megaplay-player";
        });
      var playerId = player && attribute(player, "data-id");
      if (!/^\d{1,12}$/.test(playerId || "") || !positive(playerId))
        throw Error("Mapped episode player unavailable");
      var data = decrypt(
        await json(
          SITE + "/stream/getSources?id=" + playerId + "&id=" + playerId,
          { Referer: page, Origin: SITE, "X-Requested-With": "XMLHttpRequest" },
        ),
      );
      var rawSources = [];
      if (typeof data.file === "string") rawSources.push({ file: data.file });
      if (data.sources && !Array.isArray(data.sources))
        rawSources.push(data.sources);
      if (Array.isArray(data.sources))
        rawSources = rawSources.concat(data.sources);
      var seen = Object.create(null),
        sources = rawSources
          .map(function (s) {
            return address(
              typeof s === "string" ? s : s && (s.file || s.url),
              page,
            );
          })
          .filter(function (u) {
            if (!u || seen[u]) return false;
            seen[u] = true;
            return true;
          })
          .slice(0, 6);
      if (!sources.length) throw Error("No source URLs in decoded response");
      var headers = { "User-Agent": UA, Referer: SITE + "/", Origin: SITE },
        selected = null,
        fallbackTried = false;
      // Website-published CDN failover, requested only after an unusable source response.
      for (var i = 0; i < sources.length; i++) {
        try {
          selected = await verify(sources[i], headers);
        } catch (error) {
          if (!fallbackTried) {
            fallbackTried = true;
            try {
              var health = await metadata(SITE + "/lib/check_domain.json");
              var fallback =
                typeof health.fallback === "string"
                  ? health.fallback.toLowerCase()
                  : "";
              var original = new URL(sources[i]);
              if (
                /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(
                  fallback,
                ) &&
                fallback !== original.hostname
              ) {
                selected = await verify(
                  "https://" + fallback + original.pathname + original.search,
                  headers,
                );
                log("CDN", "Website fallback master verified");
              }
            } catch (_) {}
          }
          if (!selected) log("SOURCE", error.message);
        }
        if (selected && selected.master) break;
      }
      if (!selected) throw Error("No verified HLS source");
      var tracks = Array.isArray(data.tracks) ? data.tracks : [],
        trackSeen = Object.create(null);
      var subtitles = tracks
        .filter(function (t) {
          return t && /^(?:captions|subtitles)$/.test(t.kind || "");
        })
        .map(function (t) {
          var lang = language(t),
            url = address(t.file || t.url, page);
          if (!lang || !url || trackSeen[url]) return null;
          trackSeen[url] = true;
          var path = new URL(url).pathname,
            mime = /\.(?:ass|ssa)$/i.test(path)
              ? "text/x-ssa"
              : /\.srt$/i.test(path)
                ? "application/x-subrip"
                : "text/vtt";
          return {
            url: url,
            language: lang,
            name: lang === "en" ? "English" : lang === "ms" ? "Malay" : "Indo",
            mimeType: mime,
            headers: headers,
          };
        })
        .filter(Boolean)
        .slice(0, 16);
      log(
        "EXTRACT",
        (selected.master ? "Master HLS" : "Media HLS") +
          " verified; Japanese/Sub route; " +
          subtitles.length +
          " external subtitles",
      );
      return [
        {
          name: "HiAnime",
          serverName: "MegaPlay",
          title:
            "MAL " + mapped.id + " • Episode " + mapped.ep + " • Japanese Sub",
          url: selected.url,
          type: "hls",
          mimeType: "application/x-mpegURL",
          quality: "Auto",
          audioLanguage: "ja",
          audioType: "sub",
          headers: Object.assign({}, headers, {
            "X-VUEO-HTTP-Transport": "shared",
          }),
          subtitles: subtitles,
          provider: "hianime",
        },
      ];
    }
    var streams = [];
    try {
      var mapped = await (async function() {
        var value = await cloudAnimeRecoverMapping(function() { return mapping(); }, id, type, season, episode, deadline);
        if (!value || !value.title_fallback) return value;
        return {id:value.mal_id, ep:value.episode, method:value.mapping_method,
          titleFallback:value, slugHint:value.animeplanet_slug};
      })();
      if (!mapped)
        log("MAPPING", "No unambiguous title/episode mapping; skipped");
      else {
        log(
          "MAPPING",
          "MAL " +
            mapped.id +
            ", episode " +
            mapped.ep +
            " via " +
            mapped.method,
        );
        streams = await extract(mapped);
      }
    } catch (error) {
      log("ERROR", error.message);
    }
    log("RESULT", streams.length + " sources, " + calls + " HTTP calls");
    return streams;
  }
  module.exports = { getStreams: getStreams };
})();

/* CLOUDANIME_MINIMUM_RESOLUTION_V1: standalone in every provider; no app changes or HTTP probes. */
function cloudAnimeResolutionHeight(stream) {
  function height(value, bare) {
    if (typeof value === 'number') return isFinite(value) && value > 0 ? value : null;
    if (typeof value !== 'string') return null;
    var text = value.trim(), match = /(?:^|[^0-9])(\d{2,5})\s*[x×]\s*(\d{2,5})(?![0-9])/i.exec(text);
    if (match) return +match[2];
    match = /(?:^|[^a-z0-9])(\d{2,5})\s*[pi](?=$|[^a-z0-9])/i.exec(text);
    if (match) return +match[1];
    if (bare && /^\d{2,5}$/.test(text)) return +text;
    if (bare && /^(?:sd|standard[ -]definition)$/i.test(text)) return 480;
    if (bare && /^(?:hd|fhd|full[ -]?hd|uhd|[248]k)$/i.test(text)) return 720;
    return null;
  }
  if (!stream || typeof stream !== 'object') return null;
  // Published dimensions take priority over broad display labels.
  var value = height(stream.height, true);
  if (value !== null) return value;
  var fields = ['resolution', 'quality', 'sourceQuality', 'qualityLabel'];
  for (var i = 0; i < fields.length; i++) {
    value = height(stream[fields[i]], true);
    if (value !== null) return value;
  }
  // Only explicit resolution syntax in labels/files; never infer from URL IDs,
  // episode numbers, file sizes or bitrate. Auto/Unknown alone remain allowed.
  var labels = ['name', 'title', 'fileName', 'filename'];
  var context = typeof globalThis !== 'undefined' && globalThis.VUEO_DISCOVERY_CONTEXT;
  var tmdb = context && context.tmdb || {};
  var titles = [tmdb.title, tmdb.name, tmdb.original_title, tmdb.original_name, context && context.title];
  for (var j = 0; j < labels.length; j++) {
    var label = typeof stream[labels[j]] === 'string' ? stream[labels[j]] : '';
    titles.forEach(function(title) { if (typeof title === 'string' && title) label = label.split(title).join(''); });
    value = height(label, false);
    if (value !== null) return value;
  }
  return null;
}
function cloudAnimeMinimumResolution(streams, providerId) {
  if (!Array.isArray(streams)) return streams;
  var rejected = 0;
  var result = streams.filter(function(stream) {
    var height = cloudAnimeResolutionHeight(stream);
    if (height !== null && height < 720) { rejected++; return false; }
    return true;
  });
  if (rejected && typeof console !== 'undefined' && console.log) {
    console.log('[CloudAnime][' + providerId + '] QUALITY_FILTER: rejected ' + rejected + ' below 720p; Auto/Unknown allowed');
  }
  return result;
}
function cloudAnimeInstallMinimumResolution(provider, providerId) {
  if (!provider || typeof provider.getStreams !== 'function') return provider;
  var original = provider.getStreams;
  var adapted = Object.assign({}, provider);
  adapted.getStreams = function() {
    var args = arguments, receiver = this;
    return Promise.resolve().then(function() { return original.apply(receiver, args); })
      .then(function(streams) { return cloudAnimeMinimumResolution(streams, providerId); });
  };
  return adapted;
}
/* CLOUDANIME_MINIMUM_RESOLUTION_END */

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "hianime");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
