/* CloudAnime Reanime v2.0.2 — direct identity route; requires VUEO provider HLS instructions v1. */
(function () {
  "use strict";
  var SITE = "https://reanime.to",
    FLIX = "https://flixcloud.cc";
  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  var META_KEY = "439c478a771f35c05022f9feabcca01c";
  var documents = Object.create(null),
    documentKeys = [];
  function log(stage, text) {
    console.log("[Reanime] " + stage + ": " + text);
  }
  function positive(v) {
    var n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function day(v) {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)
      ? v.slice(0, 10)
      : "";
  }
  function address(u, base) {
    try {
      var x = new URL(u, base);
      return x.protocol === "https:" ? x.href : "";
    } catch (_) {
      return "";
    }
  }
  function host(u) {
    try {
      return new URL(u).hostname;
    } catch (_) {
      return "";
    }
  }
  function flixHost(u) {
    return /^(?:[a-z0-9-]+\.)*flixcloud\.cc$/i.test(host(u));
  }
  function attribute(line, key) {
    var m = new RegExp("(?:[:,])" + key + '=(?:"([^"]*)"|([^,]*))', "i").exec(
      line,
    );
    return m ? (m[1] != null ? m[1] : m[2]) : "";
  }
  function japanese(line) {
    return /^(ja|jpn|japanese)$/i.test(attribute(line, "LANGUAGE"));
  }
  function decodeTable(input) {
    var nodes = (input && input.nodes) || [],
      found = null;
    nodes.forEach(function (node) {
      if (!node || !Array.isArray(node.data)) return;
      var table = node.data,
        memo = Object.create(null),
        count = 0;
      function get(i, depth) {
        if (i === -1) return undefined;
        if (
          !Number.isInteger(i) ||
          i < 0 ||
          i >= table.length ||
          depth > 30 ||
          ++count > 15000
        )
          throw Error("Invalid embed data");
        if (Object.prototype.hasOwnProperty.call(memo, i)) return memo[i];
        var v = table[i],
          out;
        if (Array.isArray(v)) {
          out = [];
          memo[i] = out;
          v.forEach(function (n) {
            out.push(get(n, depth + 1));
          });
          return out;
        }
        if (v && typeof v === "object") {
          out = Object.create(null);
          memo[i] = out;
          Object.keys(v).forEach(function (k) {
            out[k] = get(v[k], depth + 1);
          });
          return out;
        }
        return (memo[i] = v);
      }
      if (
        table[0] &&
        typeof table[0] === "object" &&
        Object.prototype.hasOwnProperty.call(table[0], "w_payload")
      )
        found = get(0, 0);
    });
    return found;
  }
  function bytes(C, wa) {
    var out = new Uint8Array(wa.sigBytes);
    for (var i = 0; i < out.length; i++)
      out[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255;
    return out;
  }
  function words(C, ba) {
    var a = [];
    for (var i = 0; i < ba.length; i++)
      a[i >>> 2] = (a[i >>> 2] || 0) | (ba[i] << (24 - (i % 4) * 8));
    return C.lib.WordArray.create(a, ba.length);
  }
  function base64(C, s) {
    return bytes(C, C.enc.Base64.parse(s));
  }
  function pbkdf(C, password, salt) {
    var suffix = C.lib.WordArray.create([1], 4),
      u = C.HmacSHA256(C.enc.Utf8.parse(salt).concat(suffix), password),
      out = bytes(C, u);
    for (var round = 1; round < 1000; round++) {
      u = C.HmacSHA256(u, password);
      var b = bytes(C, u);
      for (var j = 0; j < 32; j++) out[j] ^= b[j];
    }
    return words(C, out);
  }
  function fields(C, seed) {
    var e = seed;
    for (var i = 0; i < 3; i++) e = C.SHA256(e + i).toString();
    var l = e;
    for (i = 0; i < 3; i++) l = C.SHA256(l + i).toString();
    return {
      kf: "kf_" + e.slice(8, 16),
      iv: "ivf_" + e.slice(16, 24),
      container: "cd_" + e.slice(24, 32),
      array: "ad_" + e.slice(32, 40),
      object: "od_" + e.slice(40, 48),
      token: e.slice(48, 64) + "_" + e.slice(56, 64),
      kf2: l.slice(0, 16) + "_" + l.slice(16, 24),
    };
  }
  function decodePlaylist(C, body, key) {
    if (body.trim().indexOf("#EXTM3U") === 0) return body.trim();
    var b = base64(C, body.trim());
    for (var i = 0; i < b.length; i++) b[i] ^= key[i % key.length];
    var text = words(C, b).toString(C.enc.Utf8);
    if (text.indexOf("#EXTM3U") !== 0) throw Error("Invalid decoded HLS");
    return text;
  }
  function subtitleLanguage(v) {
    v = String(v || "")
      .split(/[([]/, 1)[0]
      .trim()
      .toLowerCase();
    if (/^(?:en|eng|english)$/.test(v)) return "en";
    if (/^(?:ms|msa|may|malay|bahasa melayu)$/.test(v)) return "ms";
    if (/^(?:id|ind|indo|indonesian|bahasa indonesia)$/.test(v)) return "id";
    return "";
  }
  async function getStreams(id, type, season, episode) {
    type = type === "series" ? "tv" : type;
    id = String(id || "");
    if (!/^(?:\d+|tt\d+)$/.test(id) || ["tv", "movie"].indexOf(type) < 0)
      return [];
    if (
      type === "tv" &&
      (!Number.isInteger(Number(season)) ||
        Number(season) < 0 ||
        !positive(episode))
    )
      return [];
    season = Number(season);
    episode = type === "movie" ? 1 : Number(episode);
    var deadline = Date.now() + 18000,
      closed = false,
      requestCount = 0,
      streams = [];
    async function text(url, headers) {
      var left = Math.min(6500, deadline - Date.now());
      if (left <= 0 || closed) throw Error("Request budget reached");
      var timer,
        controller =
          typeof AbortController === "function" ? new AbortController() : null;
      requestCount++;
      try {
        return await Promise.race([
          Promise.resolve()
            .then(function () {
              return fetch(url, {
                headers: Object.assign(
                  {
                    "User-Agent": UA,
                    Accept: "application/json, text/plain, */*",
                  },
                  headers || {},
                ),
                signal: controller ? controller.signal : undefined,
              });
            })
            .then(async function (r) {
              if (!r.ok) {
                var err = Error("HTTP " + r.status + " at " + host(url));
                err.status = r.status;
                throw err;
              }
              var b = await r.text();
              if (b.length > 2000000) throw Error("Response too large");
              return b;
            }),
          new Promise(function (_, reject) {
            timer = setTimeout(function () {
              if (controller) controller.abort();
              reject(Error("HTTP timeout at " + host(url)));
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
      while (documentKeys.length > 12) delete documents[documentKeys.shift()];
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
      rows = rows.filter(function (r) {
        return (
          r &&
          positive(r.anilist) &&
          (/^tt/.test(id) ? r.imdb === id : String(r.themoviedb) === id) &&
          (type === "movie" ? r.media === "MOVIE" : r.media !== "MOVIE")
        );
      });
      var exact = rows.filter(function (r) {
        return (
          r["themoviedb-season"] != null &&
          Number(r["themoviedb-season"]) === season
        );
      });
      if (type === "movie") {
        var movies = rows.filter(function (r) {
          return r["themoviedb-season"] == null;
        });
        if (movies.length === 1)
          return {
            id: Number(movies[0].anilist),
            ep: 1,
            method: "exact movie ID",
          };
        return null;
      }
      // ARM is the season identity authority. No blanket date gate for a unique normal season.
      if (season > 0 && exact.length === 1)
        return {
          id: Number(exact[0].anilist),
          ep: episode,
          method: "exact season ID",
        };
      var candidates = exact.length
        ? exact
        : rows.filter(function (r) {
            return r["themoviedb-season"] == null;
          });
      if (!candidates.length || candidates.length > 4) return null;
      var tmdb = positive(id) || positive(candidates[0].themoviedb);
      if (!tmdb) return null;
      var datePromise = metadata(
        "https://api.themoviedb.org/3/tv/" +
          tmdb +
          "/season/" +
          season +
          "/episode/" +
          episode +
          "?api_key=" +
          META_KEY,
      ).catch(function () {
        return null;
      });
      var datasets = await Promise.all(
          candidates.map(function (r) {
            return metadata(
              "https://api.ani.zip/mappings?anilist_id=" + r.anilist,
            ).catch(function () {
              return null;
            });
          }),
        ),
        epData = await datePromise;
      if (
        !epData ||
        Number(epData.season_number) !== season ||
        Number(epData.episode_number) !== episode ||
        !day(epData.air_date)
      )
        return null;
      var target = day(epData.air_date),
        matches = [];
      datasets.forEach(function (d, i) {
        if (
          !d ||
          !d.mappings ||
          Number(d.mappings.anilist_id) !== Number(candidates[i].anilist) ||
          String(d.mappings.themoviedb_id) !== String(tmdb)
        )
          return;
        var es = Object.keys(d.episodes || {})
          .map(function (k) {
            return d.episodes[k];
          })
          .filter(function (e) {
            return (
              e &&
              positive(e.episode) &&
              [day(e.airDate), day(e.airdate), day(e.airDateUtc)].indexOf(
                target,
              ) >= 0
            );
          });
        if (es.length === 1)
          matches.push({
            id: Number(candidates[i].anilist),
            ep: Number(es[0].episode),
            method: "ambiguous season + exact episode date",
          });
      });
      return matches.length === 1 ? matches[0] : null;
    }
    async function extract(embed, mapped, server) {
      var u = new URL(embed);
      if (!flixHost(embed) || u.hostname !== "flixcloud.cc") return;
      var m = /^\/e\/([a-z0-9]+)$/i.exec(u.pathname);
      if (!m) return;
      var profile = u.searchParams.get("v");
      if (profile && !/^\d{1,2}$/.test(profile)) return;
      var data = decodeTable(
        await json(
          FLIX +
            "/e/" +
            m[1] +
            "/__data.json" +
            (profile ? "?v=" + profile : ""),
          {
            Referer: SITE + "/",
          },
        ),
      );
      if (
        !data ||
        typeof data.obfuscation_seed !== "string" ||
        data.obfuscation_seed.length > 128
      )
        throw Error("Missing playback metadata");
      var C = require("crypto-js"),
        f = fields(C, data.obfuscation_seed),
        o = data.obfuscated_crypto_data[f.container][f.array][0][f.object],
        token = data[f.token];
      if (typeof token !== "string" || !/^[a-zA-Z0-9_-]{1,512}$/.test(token))
        throw Error("Invalid playback token");
      var tok = await json(FLIX + "/api/m3u8/" + token, {
          Referer: FLIX + "/",
        }),
        frag = base64(C, o[f.kf]),
        frag2 = base64(C, data[f.kf2]),
        T = base64(
          C,
          tok[
            C.SHA256(token + "key")
              .toString()
              .slice(0, 10)
          ],
        );
      if (frag.length !== 32 || frag2.length !== 32 || T.length !== 32)
        throw Error("Unsupported key lengths");
      var kernel = flixKernel(base64(C, data.w_payload));
      kernel.memory.set(frag, 1000);
      kernel.memory.set(frag2, 1032);
      kernel.memory.set(T, 1064);
      kernel.run("_s", [parseInt(data.obfuscation_seed.slice(0, 8), 16) | 0]);
      kernel.run("_r", [1000, 1032, 1064, 1096, 32]);
      var key = pbkdf(
          C,
          words(C, kernel.memory.slice(1096, 1128)),
          data.obfuscation_seed,
        ),
        kb = bytes(C, key);
      for (var i = 0; i < 32; i++)
        kb[i] ^= data.obfuscation_seed.charCodeAt(
          i % data.obfuscation_seed.length,
        );
      var aesKey = C.SHA256(words(C, kb)),
        url = C.AES.decrypt(
          {
            ciphertext: C.enc.Base64.parse(
              tok[
                C.SHA256(token + "vid")
                  .toString()
                  .slice(0, 10)
              ],
            ),
          },
          aesKey,
          {
            iv: C.enc.Base64.parse(o[f.iv]),
            mode: C.mode.CBC,
            padding: C.pad.Pkcs7,
          },
        )
          .toString(C.enc.Utf8)
          .trim();
      if (
        !flixHost(url) ||
        !/^https:\/\//.test(url) ||
        !/\.m3u8$/.test(new URL(url).pathname) ||
        !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
          new URL(url).pathname,
        )
      )
        throw Error("Invalid stream URL");
      var ptr = kernel.run("_c", []),
        manifestKey = kernel.memory.slice(ptr, ptr + 32),
        headers = { "User-Agent": UA, Referer: FLIX + "/", Origin: FLIX };
      var master = decodePlaylist(C, await text(url, headers), manifestKey);
      if (master.indexOf("#EXT-X-STREAM-INF:") < 0)
        throw Error("Master HLS not published");
      var audio = master.split(/\r?\n/).filter(function (l) {
        return (
          /^#EXT-X-MEDIA:/.test(l) &&
          attribute(l, "TYPE").toUpperCase() === "AUDIO"
        );
      });
      if (
        (audio.length && !audio.some(japanese)) ||
        (!audio.length && data.audio_type !== "sub")
      )
        throw Error("Japanese HLS audio not verified");
      var tracks = (data.subtitles || [])
        .map(function (t) {
          var lang = subtitleLanguage(t.language),
            src = address(t.url);
          return lang && src
            ? {
                url: src,
                language: lang,
                name:
                  lang === "en" ? "English" : lang === "ms" ? "Malay" : "Indo",
                mimeType:
                  t.format === "ass"
                    ? "text/x-ssa"
                    : t.format === "srt"
                      ? "application/x-subrip"
                      : "text/vtt",
                format: t.format,
                headers: headers,
              }
            : null;
        })
        .filter(Boolean);
      if (closed) return;
      var fragment =
        "vueo_hls_v1=base64-xor&key=" +
        words(C, manifestKey).toString(C.enc.Hex) +
        "&audio=ja,jpn,japanese" +
        "&segment_prefixes=52494646????????57454250,89504e470d0a1a0a" +
        "&segment_key=9d2af147b38e5c70a619e43bd8620fc5&segment_plain=47";
      var source = {
        name: "Reanime / " + server + " (Auto)",
        serverName: server,
        title:
          "AniList " +
          mapped.id +
          " • Episode " +
          mapped.ep +
          " • Japanese Sub",
        url: url + "#" + fragment,
        headers: headers,
        quality: "Auto",
        type: "hls",
        mimeType: "application/x-mpegURL",
        audioLanguage: "ja",
        subtitles: tracks,
        provider: "reanime",
      };
      log(
        "EXTRACT",
        "master HLS verified; Japanese rendition; " +
          tracks.length +
          " subtitle tracks; provider HLS instructions v1",
      );
      return source;
    }
    try {
      var mapped = await mapping();
      if (!mapped) {
        log("MAPPING", "No unambiguous title/episode mapping; skipped");
        return [];
      }
      log(
        "MAPPING",
        "AniList " +
          mapped.id +
          ", episode " +
          mapped.ep +
          " via " +
          mapped.method,
      );
      var res = await json(SITE + "/api/flix/" + mapped.id + "/" + mapped.ep, {
        Referer: SITE + "/",
      });
      if (!res.success || !Array.isArray(res.servers)) {
        log("RESULT", "No published servers");
        return [];
      }
      var seen = Object.create(null);
      var servers = res.servers
        .filter(function (server) {
          if (
            !server ||
            String(server.dataType).toLowerCase() !== "sub" ||
            !server.dataLink
          )
            return false;
          var url = address(server.dataLink);
          if (!url || !flixHost(url)) return false;
          // The profile query distinguishes HD-1 and HD-2 even for a shared access ID.
          var identity = JSON.stringify([url, server.serverName || ""]);
          if (seen[identity]) return false;
          seen[identity] = true;
          return true;
        })
        .slice(0, 6);
      var results = [];
      for (var batch = 0; batch < servers.length; batch += 2) {
        var pair = await Promise.all(
          servers.slice(batch, batch + 2).map(async function (server) {
            try {
              return await extract(
                server.dataLink,
                mapped,
                server.serverName || "FlixCloud",
              );
            } catch (e) {
              log(
                "EXTRACT",
                (server.serverName || "FlixCloud") +
                  ": " +
                  String(e.message).replace(/https?:\/\/\S+/g, "<url>"),
              );
              return null;
            }
          }),
        );
        results = results.concat(pair);
      }
      streams = results.filter(Boolean);
    } catch (e) {
      log("RESULT", String(e.message).replace(/https?:\/\/\S+/g, "<url>"));
    } finally {
      closed = true;
      log(
        "RESULT",
        streams.length + " sources, " + requestCount + " HTTP calls",
      );
    }
    return streams;
  }
  /* Bounded interpreter for the site's small i32-only key module; no eval or WebAssembly required. */
  function flixKernel(bytes) {
    if (
      bytes.length < 8 ||
      bytes.length > 16384 ||
      bytes[0] !== 0 ||
      bytes[1] !== 97 ||
      bytes[2] !== 115 ||
      bytes[3] !== 109 ||
      bytes[4] !== 1
    )
      throw Error("Invalid key module");
    var p = 8,
      types = [],
      funcs = [],
      exports = {},
      bodies = [],
      globals = [0],
      memory = new Uint8Array(65536);
    function leb(signed) {
      var v = 0,
        shift = 0,
        b;
      do {
        if (p >= bytes.length || shift > 35) throw Error("Invalid key module");
        b = bytes[p++];
        v |= (b & 127) << shift;
        shift += 7;
      } while (b & 128);
      return signed && shift < 32 && b & 64 ? v | (-1 << shift) : v;
    }
    function str() {
      var n = leb(),
        s = "";
      while (n--) s += String.fromCharCode(bytes[p++]);
      return s;
    }
    while (p < bytes.length) {
      var section = bytes[p++],
        size = leb(),
        end = p + size;
      if (end > bytes.length) throw Error("Invalid key module");
      if (section === 1) {
        for (var n = leb(); n--; ) {
          if (bytes[p++] !== 96) throw Error("Unsupported key type");
          var a = leb();
          for (var j = 0; j < a; j++)
            if (bytes[p++] !== 127) throw Error("Unsupported key type");
          var r = leb();
          for (j = 0; j < r; j++)
            if (bytes[p++] !== 127) throw Error("Unsupported key result");
          types.push({ args: a, results: r });
        }
      } else if (section === 2) {
        if (leb()) throw Error("Imported key module rejected");
      } else if (section === 3) {
        for (n = leb(); n--; ) funcs.push(leb());
      } else if (section === 7) {
        for (n = leb(); n--; ) {
          var name = str(),
            kind = bytes[p++],
            index = leb();
          if (kind === 0) exports[name] = index;
        }
      } else if (section === 10) {
        for (n = leb(); n--; ) {
          var len = leb(),
            stop = p + len,
            locals = 0;
          for (var groups = leb(); groups--; ) {
            locals += leb();
            if (bytes[p++] !== 127) throw Error("Unsupported local");
          }
          if (locals > 64) throw Error("Key local limit");
          var ops = [],
            open = [];
          while (p < stop) {
            var op = bytes[p++],
              ins = { op: op };
            if (op === 2 || op === 3) {
              if (bytes[p++] !== 64) throw Error("Unsupported block");
              open.push(ops.length);
            } else if (op === 11 && open.length) {
              var at = open.pop();
              ops[at].end = ops.length;
            } else if ([12, 13, 32, 33, 34, 35, 36].indexOf(op) >= 0)
              ins.arg = leb();
            else if (op === 65) ins.arg = leb(true);
            else if (op === 45 || op === 58) {
              leb();
              ins.arg = leb();
            } else if (
              [
                11, 15, 26, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 106,
                107, 108, 113, 114, 115, 116, 117, 118, 119, 120,
              ].indexOf(op) < 0
            )
              throw Error("Unsupported key instruction");
            ops.push(ins);
          }
          if (open.length || p !== stop) throw Error("Invalid key function");
          bodies.push({ locals: locals, ops: ops });
        }
      } else if (section === 11) {
        for (n = leb(); n--; ) {
          if (leb() !== 0 || bytes[p++] !== 65)
            throw Error("Unsupported key data");
          var offset = leb(true);
          if (bytes[p++] !== 11) throw Error("Invalid key data");
          len = leb();
          if (offset < 0 || offset + len > memory.length)
            throw Error("Key memory bounds");
          memory.set(bytes.slice(p, p + len), offset);
          p += len;
        }
      }
      p = end;
    }
    function run(name, args) {
      var f = exports[name],
        body = bodies[f],
        sig = types[funcs[f]];
      if (!body || !sig || args.length !== sig.args)
        throw Error("Missing key export");
      var l = args.concat(Array(body.locals).fill(0)),
        s = [],
        frames = [],
        pc = 0,
        steps = 0;
      function pop() {
        if (!s.length) throw Error("Key stack underflow");
        return s.pop() | 0;
      }
      function address(off) {
        var a = (pop() >>> 0) + off;
        if (a >= memory.length) throw Error("Key memory bounds");
        return a;
      }
      function branch(depth) {
        var at = frames.length - 1 - depth,
          f = frames[at];
        if (!f) throw Error("Invalid key branch");
        if (f.loop) {
          frames.length = at + 1;
          pc = f.start + 1;
        } else {
          frames.length = at;
          pc = f.end + 1;
        }
      }
      while (pc < body.ops.length) {
        if (++steps > 50000) throw Error("Key instruction budget");
        var i = body.ops[pc++],
          o = i.op,
          a,
          b;
        if (o === 2 || o === 3) {
          frames.push({ start: pc - 1, end: i.end, loop: o === 3 });
          continue;
        }
        if (o === 11) {
          if (frames.length) frames.pop();
          else break;
          continue;
        }
        if (o === 12) {
          branch(i.arg);
          continue;
        }
        if (o === 13) {
          if (pop()) branch(i.arg);
          continue;
        }
        if (o === 15) break;
        if (o === 32) {
          s.push(l[i.arg] | 0);
          continue;
        }
        if (o === 33) {
          l[i.arg] = pop();
          continue;
        }
        if (o === 34) {
          a = pop();
          l[i.arg] = a;
          s.push(a);
          continue;
        }
        if (o === 35) {
          s.push(globals[i.arg] | 0);
          continue;
        }
        if (o === 36) {
          globals[i.arg] = pop();
          continue;
        }
        if (o === 65) {
          s.push(i.arg);
          continue;
        }
        if (o === 26) {
          pop();
          continue;
        }
        if (o === 45) {
          s.push(memory[address(i.arg)]);
          continue;
        }
        if (o === 58) {
          a = pop();
          memory[address(i.arg)] = a & 255;
          continue;
        }
        if (o === 69) {
          s.push(pop() === 0 ? 1 : 0);
          continue;
        }
        b = pop();
        a = pop();
        if (o === 106) a = a + b;
        else if (o === 107) a = a - b;
        else if (o === 108) a = Math.imul(a, b);
        else if (o === 113) a = a & b;
        else if (o === 114) a = a | b;
        else if (o === 115) a = a ^ b;
        else if (o === 116) a = a << b;
        else if (o === 117) a = a >> b;
        else if (o === 118) a = a >>> b;
        else if (o === 119) a = (a << b) | (a >>> (32 - b));
        else if (o === 120) a = (a >>> b) | (a << (32 - b));
        else if (o === 70) a = a === b;
        else if (o === 71) a = a !== b;
        else if (o === 72) a = a < b;
        else if (o === 73) a = a >>> 0 < b >>> 0;
        else if (o === 74) a = a > b;
        else if (o === 75) a = a >>> 0 > b >>> 0;
        else if (o === 76) a = a <= b;
        else if (o === 77) a = a >>> 0 <= b >>> 0;
        else if (o === 78) a = a >= b;
        else if (o === 79) a = a >>> 0 >= b >>> 0;
        else throw Error("Unsupported key operation");
        s.push(a | 0);
      }
      return sig.results ? pop() : 0;
    }
    return { memory: memory, run: run };
  }

  module.exports = { getStreams: getStreams };
  if (typeof globalThis !== "undefined") globalThis.getStreams = getStreams;
})();
