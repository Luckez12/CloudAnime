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

/* CloudAnime AnimeKai v2.0.5 — animekai.li published MegaVid MAL route, Sub only. */
(function () {
  "use strict";
  var SITE = "https://megavid.buzz";
  var CATALOGUE = "https://animekai.li";
  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  var documents = Object.create(null),
    documentKeys = [];
  function positive(value) {
    var n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function log(stage, message) {
    console.log("[AnimeKai] " + stage + ": " + message);
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
    var deadline = Date.now() + 24000,
      calls = 0;
    function scope() {
      return { stopped: false, pending: new Set(), cancel: function() {
        this.stopped = true;
        this.pending.forEach(function(cancel) { cancel(); });
        this.pending.clear();
      }};
    }
    async function text(url, extra, task, maxMs) {
      if (task && task.stopped) throw Error("Race request cancelled");
      var left = Math.min(
        url.indexOf(SITE + "/mal/") === 0 ? 10000 : 9000,
        deadline - Date.now(),
        maxMs || 9000,
      );
      if (left <= 0) throw Error("Request budget exhausted");
      var timer, cancel,
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
            cancel = function() {
              if (controller) controller.abort();
              reject(Error("Race request cancelled"));
            };
            if (task) task.pending.add(cancel);
            timer = setTimeout(function () {
              if (controller) controller.abort();
              reject(Error("HTTP timeout at " + new URL(url).hostname));
            }, left);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        if (task && cancel) task.pending.delete(cancel);
      }
    }
    async function json(url, headers, task) {
      var body = (await text(url, headers, task)).replace(/^\uFEFF/, "").trim();
      if (body.charAt(0) === "<") {
        log("RESPONSE", new URL(url).hostname + new URL(url).pathname + ": HTML received where JSON expected");
        throw Error("HTML response instead of source JSON");
      }
      try { return JSON.parse(body); }
      catch (_) { throw Error("Invalid JSON at " + new URL(url).hostname + new URL(url).pathname); }
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
              slugHint: movies[0]["anime-planet"],
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
          slugHint: exact[0]["anime-planet"],
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
      if (
        ids.some(function (key) {
          return !datasetById[key];
        })
      )
        return null;
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
            slugHint: r["anime-planet"],
          });
        });
      });
      return matches.length === 1 ? matches[0] : null;
    }
    async function verify(url, headers, task, maxMs) {
      var body = (await text(url, headers, task, maxMs)).replace(/^\uFEFF/, "").trim();
      if (!body.startsWith("#EXTM3U"))
        throw Error("Source response is not HLS");
      var master = /#EXT-X-STREAM-INF:/.test(body);
      if (!master) throw Error("Source is not a master HLS");
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
    function attributes(tag) {
      var out = Object.create(null), match;
      var re = /([\w-]+)\s*=\s*(["'])(.*?)\2/g;
      while ((match = re.exec(tag))) out[match[1].toLowerCase()] = match[3]
        .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      return out;
    }
    async function episodeServer(mapped) {
      // ARM slug is only a catalogue lookup hint, never identity proof.
      // The episode snapshot must publish the requested episode and bind its
      // player URL to the exact mapped MAL ID, local episode and Sub route.
      var hint = typeof mapped.slugHint === "string" ? mapped.slugHint : "";
      if (!/^[a-z0-9][a-z0-9-]*$/.test(hint)) {
        // The fallback supplies an exact anime identity, not a guessed website slug.
        // Search the catalogue only here; all page/episode/server checks still run.
        var fallback = mapped.titleFallback || await cloudAnimeTitleFallback(id, type, season, episode, deadline);
        if (fallback && (fallback.mal_id !== mapped.id || fallback.episode !== mapped.ep)) throw Error("Catalogue fallback identity conflicts with ID mapping");
        if (!fallback || !fallback.anime_title) throw Error("No verified catalogue lookup title");
        var catalogue = await text(CATALOGUE + "/browse?keyword=" + encodeURIComponent(fallback.anime_title), {Referer:CATALOGUE + "/"});
        var anchors = catalogue.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [], slugs=[];
        anchors.forEach(function(anchor) {
          var tag=anchor.match(/^<a\b[^>]*>/i),attrs=tag&&attributes(tag[0]);
          var href=attrs&&address(attrs.href,CATALOGUE),u=href&&new URL(href);
          var route=u&&u.origin===CATALOGUE&&/^\/watch\/([a-z0-9][a-z0-9-]*)\/?$/.exec(u.pathname);
          if(!route)return;
          var label=attrs.title||anchor.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').trim();
          var keys=fallback.titles.map(cloudAnimeTitleKey);
          if(keys.indexOf(cloudAnimeTitleKey(label))>=0&&slugs.indexOf(route[1])<0)slugs.push(route[1]);
        });
        if(slugs.length!==1) throw Error("No unique exact-title website slug");
        hint=slugs[0];
      }
      var page = CATALOGUE + "/watch/" + hint +
        (mapped.ep === 1 ? "" : "/ep-" + mapped.ep);
      var html = await text(page, { Referer: CATALOGUE + "/" });
      var tags = html.match(/<[a-z][^>]*>/gi) || [];
      var watch = null, published = false, players = [];
      tags.forEach(function(tag) {
        var attrs = attributes(tag);
        if (attrs.id === "watch-page") watch = attrs;
        if (Number(attrs["data-number"]) === mapped.ep &&
            attrs["data-published"] === "1" && attrs["data-has-sub"] === "1") published = true;
        if (attrs["data-server-url"] && attrs["data-lang"] === "sub") players.push(attrs);
      });
      if (!watch || watch["data-anime"] !== hint ||
          Number(watch["data-episode"]) !== mapped.ep || !published)
        throw Error("Requested episode not published or website selected another episode");
      var selected = [], seen = Object.create(null);
      players.forEach(function(attrs) {
        if (/no[- ]?sub|dub\?/i.test(attrs["data-label"] || "")) return;
        var href = address(attrs["data-server-url"], page);
        if (!href) return;
        var u = new URL(href), kind, route;
        // Server 3 (/aniwave/) is excluded even when its route claims the right identity.
        if (u.origin === SITE) {
          kind = "MegaVid";
          route = /^\/mal\/(\d+)\/(\d+)\/sub\/?$/.exec(u.pathname);
        } else if (u.origin === "https://megaplay.buzz") {
          kind = "MegaPlay";
          route = /^\/stream\/mal\/(\d+)\/(\d+)\/sub\/?$/.exec(u.pathname);
        }
        if (!route || Number(route[1]) !== mapped.id || Number(route[2]) !== mapped.ep || seen[kind]) return;
        u.search = ""; u.hash = ""; seen[kind] = true;
        selected.push({url: u.href.replace(/\/$/, ""), kind: kind, origin: u.origin});
      });
      if (!selected.length) throw Error("No supported Sub server bound to the requested MAL/episode");
      log("EPISODE", "Website published exact MAL " + mapped.id + " episode " + mapped.ep + "; " + selected.length + " eligible servers; Server 3 excluded");
      return selected;
    }
    function decryptMega(data) {
      if (!data || typeof data !== "object") throw Error("Invalid MegaPlay payload");
      if (typeof data.enc !== "string") return data;
      if (data.enc.length > 1000000 || !/^[A-Za-z0-9_+/=-]+$/.test(data.enc)) throw Error("Invalid source ciphertext");
      var C = require("crypto-js");
      var key = C.enc.Hex.parse(C.enc.Utf8.parse("i?LMTAx0Q6,:}50U").toString(C.enc.Hex).padEnd(64, "0"));
      var plain = C.AES.decrypt({ciphertext:C.enc.Base64.parse(data.enc.replace(/-/g,"+").replace(/_/g,"/"))}, key,
        {iv:C.enc.Utf8.parse("W0;27ToaUpl_P%'c"), mode:C.mode.CBC, padding:C.pad.Pkcs7}).toString(C.enc.Utf8);
      var decoded = JSON.parse(plain);
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw Error("Invalid decoded source");
      return Object.assign({}, data, decoded);
    }
    function validateIdentity(data, mapped) {
      // Reject conflicting identities if an upstream starts supplying them.
      var identity = data.metadata || data;
      if (
        (identity.mal_id != null && Number(identity.mal_id) !== mapped.id) ||
        (identity.malId != null && Number(identity.malId) !== mapped.id) ||
        (identity.episode != null && Number(identity.episode) !== mapped.ep) ||
        (identity.subOrDub &&
          String(identity.subOrDub).toLowerCase() !== "sub") ||
        (identity.audioLanguage &&
          !/^(?:ja|jpn|japanese)$/i.test(identity.audioLanguage))
      )
        throw Error("Conflicting source identity/audio");
    }
    async function extractCandidate(mapped, server, task) {
      var page = server.url;
      var headers = { "User-Agent": UA, Referer: page, Origin: server.origin };
      var data;
      if (server.kind === "MegaPlay") {
        var html = await text(page, {Referer: CATALOGUE + "/"}, task);
        if (!/\btype\s*:\s*["']sub["']/.test(html)) throw Error("MegaPlay did not confirm Sub channel");
        var player = (html.match(/<[a-z][^>]*>/gi) || []).map(attributes).find(function(t) { return t.id === "megaplay-player"; });
        var playerId = player && player["data-id"];
        if (!/^\d{1,12}$/.test(playerId || "") || !positive(playerId)) throw Error("MegaPlay episode player unavailable");
        data = decryptMega(await json(server.origin + "/stream/getSources?id=" + playerId + "&id=" + playerId,
          Object.assign({}, headers, {"X-Requested-With":"XMLHttpRequest", Accept:"application/json"}), task));
        validateIdentity(data, mapped);
        headers = {"User-Agent":UA, Referer:server.origin + "/", Origin:server.origin};
        var raw = [];
        if (typeof data.file === "string") raw.push(data.file);
        if (data.sources) raw = raw.concat(Array.isArray(data.sources) ? data.sources : [data.sources]);
        var selected = null, healthTried = false;
        for (var i = 0; i < Math.min(raw.length, 3); i++) {
          var u = address(typeof raw[i] === "string" ? raw[i] : raw[i] && (raw[i].file || raw[i].url), page);
          if (!u) continue;
          try { selected = await verify(u, headers, task, Math.min(4000, Math.max(750, deadline - Date.now() - 4500))); break; }
          catch (error) {
            if (task.stopped) throw error;
            log("SOURCE", "MegaPlay: " + error.message);
            if (!healthTried) {
              healthTried = true;
              try {
                var health = await json(server.origin + "/lib/check_domain.json?cache_burst=" + Date.now(), {Referer:page, Accept:"application/json"}, task);
                var host = typeof health.fallback === "string" ? health.fallback.trim().toLowerCase() : "";
                var original = new URL(u);
                if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) && host !== original.hostname) {
                  selected = await verify("https://" + host + original.pathname + original.search, headers, task);
                  log("CDN", "MegaPlay website-declared fallback HLS verified");
                  break;
                }
              } catch (fallbackError) {
                if (task.stopped) throw fallbackError;
                log("CDN", "MegaPlay fallback: " + fallbackError.message);
              }
            }
          }
        }
        if (!selected) throw Error("MegaPlay has no verified HLS source");
        return result(mapped, server, selected, data, headers);
      }
      var api = page + "/source?noax=1";
      log("SOURCE", "MegaVid API " + new URL(api).pathname + "?noax=1; endpointSuffixValid=" + /\/source$/.test(new URL(api).pathname));
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          data = await json(api, Object.assign({}, headers, {Accept:"application/json"}), task);
          break;
        } catch (error) {
          if (task.stopped || attempt || !/HTML response|HTTP 5\d\d|HTTP timeout/.test(error.message)) throw error;
          log("RETRY", "MegaVid temporary response; one retry");
        }
      }
      if (!data || data.status !== "ok")
        throw Error(
          "Source unavailable: " + String((data && data.status) || "unknown"),
        );
      // The website's own fallback bypasses the Animex relay. Some later
      // segments on that relay return HTTP403 although the master is valid.
      if (data.animex === true)
        throw Error(
          "Website fallback unavailable; rejected relay not returned",
        );
      if (
        data.type &&
        !/^(?:hls|m3u8|application\/(?:x-mpegurl|vnd.apple.mpegurl))$/i.test(
          data.type,
        )
      )
        throw Error("Source is not HLS");
      validateIdentity(data, mapped);
      var url = address(data.source);
      if (!url) throw Error("No HTTPS source");
      var selected = await verify(url, headers, task);
      return result(mapped, server, selected, data, headers);
    }
    function result(mapped, server, selected, data, headers) {
      var page = server.url;
      var tracks = Array.isArray(data.tracks) ? data.tracks : [],
        seen = Object.create(null),
        subtitles = [];
      tracks.slice(0, 64).forEach(function (t) {
        if (!t || !/^(?:captions|subtitles)$/.test(t.kind || "")) return;
        var lang = language(t),
          u = address(t.file || t.url, page);
        if (!lang || !u || seen[u]) return;
        seen[u] = true;
        var pathname = new URL(u).pathname;
        subtitles.push({
          url: u,
          language: lang,
          name: lang === "en" ? "English" : lang === "ms" ? "Malay" : "Indo",
          mimeType: /\.(?:ass|ssa)$/i.test(pathname)
            ? "text/x-ssa"
            : /\.srt$/i.test(pathname)
              ? "application/x-subrip"
              : "text/vtt",
          headers: headers,
        });
      });
      log(
        "EXTRACT",
        server.kind + "; website episode/server matched; master HLS verified; " +
          subtitles.length +
          " subtitle tracks supplied",
      );
      return [
        {
          name: "AnimeKai",
          provider: "animekai",
          serverName: server.kind,
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
          subtitles: subtitles.slice(0, 16),
        },
      ];
    }
    async function extract(mapped) {
      var servers = await episodeServer(mapped);
      var jobs = servers.map(function(server) { return {server:server, task:scope()}; });
      return new Promise(function(resolve) {
        var remaining = jobs.length, finished = false;
        jobs.forEach(function(job) {
          extractCandidate(mapped, job.server, job.task).then(function(streams) {
            if (finished) return;
            finished = true;
            jobs.forEach(function(other) { if (other !== job) other.task.cancel(); });
            log("RACE", job.server.kind + " won with verified HLS; other requests cancelled");
            resolve(streams);
          }).catch(function(error) {
            if (finished) return;
            log("SERVER", job.server.kind + ": " + error.message);
            if (--remaining === 0) { finished = true; jobs.forEach(function(j) {j.task.cancel();}); resolve([]); }
          });
        });
      });
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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "animekai");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
