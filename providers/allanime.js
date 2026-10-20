/* CloudAnime AllAnime v2.0.0 — current website crypto, exact IDs, Japanese Sub. */
(function () {
  "use strict";
  var CryptoJS = require("crypto-js");
  var SITE = "https://youtu-chan.com",
    API = "https://api.mkissa.net/api";
  var UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  // Public website build data seeds the cache; a rejected build reloads current assets.
  // These are protocol parameters, never title/episode overrides or VUEO rules.
  var documents = Object.create(null),
    documentKeys = [],
    runtimeCache = {
      build: "180",
      mask: [
        210, 95, 113, 21, 228, 205, 125, 137, 27, 125, 1, 230, 205, 68, 37, 183,
        104, 115, 209, 103, 115, 34, 26, 42, 21, 184, 251, 96, 0, 206, 55, 176,
      ],
      config: {
        saltMul: 12,
        saltAdd: 227,
        fragMul: 32,
        fragAdd: 217,
        bootPrefix: "NmmeXF:",
        join: "+",
        parts: ["lane", "buildId", "host", "group", "epoch"],
        omitEmptyLane: false,
        envXor: 42,
      },
      epochMs: 604800000,
      graceMs: 86400000,
      shipped: true,
      time: 0,
    },
    bootstrapCache = null;
  function positive(v) {
    var n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  function log(s, m) {
    console.log("[AllAnime] " + s + ": " + m);
  }
  function address(v, base) {
    try {
      var u = new URL(v, base);
      return u.protocol === "https:" ? u.href : "";
    } catch (_) {
      return "";
    }
  }
  function b64word(value) {
    var s = String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return CryptoJS.enc.Base64.parse(s);
  }
  function bytes(word) {
    var out = [];
    for (var i = 0; i < word.sigBytes; i++)
      out.push((word.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 255);
    return out;
  }
  function word(data) {
    var w = [];
    for (var i = 0; i < data.length; i++)
      w[i >>> 2] = (w[i >>> 2] || 0) | (data[i] << (24 - (i % 4) * 8));
    return CryptoJS.lib.WordArray.create(w, data.length);
  }
  function aesBlock(block, key) {
    // CBC's first block with a zero IV equals ECB. VUEO requires an explicit
    // 16-byte IV even when ECB is requested, so use its supported CBC path.
    var encrypted = CryptoJS.AES.encrypt(word(block), word(key), {
      iv: word(new Array(16).fill(0)),
    });
    return bytes(encrypted.ciphertext).slice(0, 16);
  }
  function xor(a, b) {
    return a.map(function (v, i) {
      return v ^ b[i];
    });
  }
  function multiplyGcm(x, h) {
    var z = new Array(16).fill(0),
      v = h.slice();
    for (var bit = 0; bit < 128; bit++) {
      if (x[bit >>> 3] & (128 >>> bit % 8)) z = xor(z, v);
      var last = v[15] & 1;
      for (var j = 15; j > 0; j--) v[j] = (v[j] >>> 1) | ((v[j - 1] & 1) << 7);
      v[0] >>>= 1;
      if (last) v[0] ^= 225;
    }
    return z;
  }
  function gcmDecrypt(key, iv, payload) {
    if (
      ![16, 24, 32].includes(key.length) ||
      iv.length !== 12 ||
      payload.length < 16 ||
      payload.length > 1048576
    )
      throw new Error("Invalid AES-GCM payload");
    var cipher = payload.slice(0, -16),
      tag = payload.slice(-16),
      zero = new Array(16).fill(0);
    var h = aesBlock(zero, key),
      y = zero.slice(),
      j0 = iv.concat([0, 0, 0, 1]);
    for (var i = 0; i < cipher.length; i += 16) {
      var block = cipher.slice(i, i + 16);
      while (block.length < 16) block.push(0);
      y = multiplyGcm(xor(y, block), h);
    }
    var length = zero.slice(),
      bits = cipher.length * 8;
    for (var k = 15; k >= 8; k--) {
      length[k] = bits % 256;
      bits = Math.floor(bits / 256);
    }
    var expected = xor(multiplyGcm(xor(y, length), h), aesBlock(j0, key)),
      diff = 0;
    for (var t = 0; t < 16; t++) diff |= tag[t] ^ expected[t];
    if (diff) throw new Error("AES-GCM authentication failed");
    var counter = j0.slice(),
      plain = [];
    for (var offset = 0; offset < cipher.length; offset += 16) {
      for (var c = 15; c >= 12; c--) {
        counter[c] = (counter[c] + 1) & 255;
        if (counter[c]) break;
      }
      var mask = aesBlock(counter, key);
      for (var p = 0; p < 16 && offset + p < cipher.length; p++)
        plain.push(cipher[offset + p] ^ mask[p]);
    }
    return CryptoJS.enc.Utf8.stringify(word(plain));
  }
  function utf8(s) {
    return bytes(CryptoJS.enc.Utf8.parse(s));
  }
  function sha(s) {
    return bytes(CryptoJS.SHA256(s));
  }
  function hmac(key, s) {
    return bytes(CryptoJS.HmacSHA256(s, word(key)));
  }
  function ctr(key, iv, data) {
    var counter = iv.concat([0, 0, 0, 1]),
      out = [];
    for (var i = 0; i < data.length; i += 16) {
      for (var j = 15; j >= 12; j--) {
        counter[j] = (counter[j] + 1) & 255;
        if (counter[j]) break;
      }
      var block = aesBlock(counter, key);
      for (var k = 0; k < 16 && i + k < data.length; k++)
        out.push(data[i + k] ^ block[k]);
    }
    return out;
  }
  function gcmEncrypt(key, iv, plain) {
    var c = ctr(key, iv, plain),
      zero = new Array(16).fill(0),
      h = aesBlock(zero, key),
      y = zero.slice();
    for (var i = 0; i < c.length; i += 16) {
      var b = c.slice(i, i + 16);
      while (b.length < 16) b.push(0);
      y = multiplyGcm(xor(y, b), h);
    }
    var len = zero.slice(),
      bits = c.length * 8;
    for (var j = 15; j >= 8; j--) {
      len[j] = bits % 256;
      bits = Math.floor(bits / 256);
    }
    var tag = xor(
      multiplyGcm(xor(y, len), h),
      aesBlock(iv.concat([0, 0, 0, 1]), key),
    );
    return c.concat(tag);
  }
  function unseal(value, key) {
    var raw = bytes(b64word(value));
    if (raw[0] !== 1) throw Error("Unsupported website crypto version");
    return JSON.parse(gcmDecrypt(key, raw.slice(1, 13), raw.slice(13)));
  }
  // Read the public build's literal data. Downloaded JavaScript is never evaluated.
  function arithmetic(s) {
    var tokens = String(s).match(/\d+(?:\.\d+)?|[()+*\/-]/g) || [],
      pos = 0;
    if (tokens.join("") !== String(s).replace(/\s/g, ""))
      throw Error("Unsupported build arithmetic");
    function atom() {
      var t = tokens[pos++];
      if (t === "-") return -atom();
      if (t === "+") return atom();
      if (t === "(") {
        var v = sum();
        if (tokens[pos++] !== ")") throw Error("Build arithmetic");
        return v;
      }
      if (!/^\d/.test(t || "")) throw Error("Build arithmetic");
      return Number(t);
    }
    function mul() {
      var v = atom();
      while (tokens[pos] === "*" || tokens[pos] === "/") {
        var op = tokens[pos++],
          n = atom();
        v = op === "*" ? v * n : v / n;
      }
      return v;
    }
    function sum() {
      var v = mul();
      while (tokens[pos] === "+" || tokens[pos] === "-") {
        var op = tokens[pos++],
          n = mul();
        v = op === "+" ? v + n : v - n;
      }
      return v;
    }
    var result = sum();
    if (pos !== tokens.length || !Number.isFinite(result))
      throw Error("Build arithmetic");
    return result;
  }
  function literal(s) {
    s = s.trim();
    if (s[0] === '"') return JSON.parse(s);
    if (s[0] !== "'" || s[s.length - 1] !== "'")
      throw Error("Build string literal");
    return s.slice(1, -1).replace(/\\(['"\\])/g, "$1");
  }
  function parseRuntime(src) {
    var seed =
      /const (\w+)=(\w+)\((\d+)\),(\w+)=Number\(([^)]+)\),(\w+)=Number\(([^)]+)\),(_\w+)=\[([^\]]+)\],(\w+)=\{v:1,([^}]+)\}/.exec(
        src,
      );
    if (!seed) throw Error("Website crypto build layout changed");
    var wrapper = new RegExp(
      "function " +
        seed[2] +
        "\\(e,t\\)\\{return (\\w+)\\(e-\\{[^:}]+:(\\d+)\\}\\.[^)}]+\\)\\}",
    ).exec(src);
    if (!wrapper) throw Error("Website crypto decoder changed");
    var decoder = wrapper[1],
      qa = new RegExp(
        "function " +
          decoder +
          "\\(e,t\\)\\{return e=e-\\(([^)]+)\\),(\\w+)\\(\\)\\[e\\]\\}",
      ).exec(src);
    if (!qa) throw Error("Website crypto table decoder changed");
    var raw = new RegExp(
      "function " + qa[2] + "\\(\\)\\{const e=\\[(.*?)\\];return",
    ).exec(src);
    if (!raw) throw Error("Website crypto table missing");
    var table = (
      raw[1].match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g) || []
    ).map(literal);
    if (table.length < 200 || table.length > 600)
      throw Error("Website crypto table size");
    var offsets = {},
      root = arithmetic(qa[1]);
    var re = new RegExp(
        "function (\\w+)\\(e,t\\)\\{return " +
          decoder +
          "\\(e-\\{[^:}]+:(\\d+)\\}\\.[^)}]+\\)\\}",
        "g",
      ),
      m;
    while ((m = re.exec(src))) offsets[m[1]] = root + Number(m[2]);
    var props = /parts:\[([^\]]+)\]/.exec(seed[11]);
    if (!props) throw Error("Website crypto field order missing");
    function concat(expr, rotation) {
      var tokens =
        expr.match(/\w+\(\d+\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g) || [];
      if (tokens.join("+") !== expr)
        throw Error("Website crypto literal expression");
      return tokens
        .map(function (t) {
          var c = /^(\w+)\((\d+)\)$/.exec(t);
          if (!c) return literal(t);
          if (offsets[c[1]] == null) throw Error("Unknown crypto decoder");
          var n = (Number(c[2]) - offsets[c[1]] + rotation) % table.length;
          if (n < 0) throw Error("Crypto index");
          return table[n];
        })
        .join("");
    }
    var rotation = -1,
      order;
    for (var r = 0; r < table.length; r++) {
      try {
        var candidate = props[1].split(",").map(function (e) {
          return concat(e, r);
        });
        if (
          candidate.slice().sort().join(",") === "buildId,epoch,group,host,lane"
        ) {
          rotation = r;
          order = candidate;
          break;
        }
      } catch (_) {}
    }
    if (rotation < 0) throw Error("Website crypto order unsupported");
    var data = seed[11],
      cfg = { parts: order };
    ["saltMul", "saltAdd", "fragMul", "fragAdd", "envXor"].forEach(
      function (k) {
        var v = new RegExp("(?:^|,)" + k + ":(\\d+)").exec(data);
        if (!v) throw Error("Website crypto config " + k);
        cfg[k] = Number(v[1]);
      },
    );
    ["bootPrefix", "join"].forEach(function (k) {
      var v = new RegExp("(?:^|,)" + k + ":([^,]+)").exec(data);
      if (!v) throw Error("Website crypto config " + k);
      cfg[k] = concat(v[1], rotation);
    });
    if (!/omitEmptyLane:!1(?:,|$)/.test(data))
      throw Error("Unsupported website crypto lane order");
    var build = concat(seed[2] + "(" + seed[3] + ")", rotation),
      epochMs = arithmetic(seed[5]),
      graceMs = arithmetic(seed[7]);
    var fragments = seed[9].split(",").map(function (e) {
      return bytes(b64word(concat(e, rotation)));
    });
    if (
      !/^\d{1,12}$/.test(build) ||
      epochMs < 300000 ||
      graceMs < 0 ||
      graceMs >= epochMs ||
      fragments.length !== 4 ||
      fragments.some(function (f) {
        return f.length !== 8;
      })
    )
      throw Error("Invalid website crypto build data");
    var salt = [],
      mask = [];
    for (var i = 0; i < 32; i++)
      salt[i] =
        (build.charCodeAt(i % build.length) || 0) ^
        ((i * cfg.saltMul + cfg.saltAdd) & 255);
    for (var f = 0; f < 4; f++)
      for (var j = 0; j < 8; j++)
        mask.push(
          fragments[f][j] ^
            salt[f * 8 + j] ^
            ((f * cfg.fragMul + j * cfg.fragAdd) & 255),
        );
    return {
      build: build,
      epochMs: epochMs,
      graceMs: graceMs,
      mask: mask,
      config: cfg,
      time: Date.now(),
    };
  }

  async function getStreams(id, type, season, episode) {
    id = String(id || "");
    type = type === "series" ? "tv" : type;
    season = Number(season);
    episode = Number(episode);
    if (
      !/^(?:tt\d+|\d+)$/.test(id) ||
      !["tv", "movie"].includes(type) ||
      (type === "tv" &&
        (!Number.isInteger(season) || season < 0 || !positive(episode)))
    )
      return [];
    var calls = 0,
      deadline = Date.now() + 42000;
    async function text(url, extra, body) {
      var left = Math.min(8500, deadline - Date.now());
      if (left <= 0) throw Error("Request budget exhausted");
      var timer,
        control =
          typeof AbortController === "function" ? new AbortController() : null;
      calls++;
      try {
        return await Promise.race([
          fetch(url, {
            method: body ? "POST" : "GET",
            headers: Object.assign(
              { "User-Agent": UA, Referer: SITE + "/", Origin: SITE },
              extra || {},
            ),
            body: body,
            signal: control ? control.signal : undefined,
          }).then(async function (r) {
            if (!r.ok) {
              var err = Error(
                "HTTP " + r.status + " at " + new URL(url).hostname,
              );
              err.status = r.status;
              throw err;
            }
            var b = await r.text();
            if (b.length > 2200000) throw Error("Response too large");
            return b;
          }),
          new Promise(function (_, reject) {
            timer = setTimeout(function () {
              if (control) control.abort();
              reject(Error("HTTP timeout at " + new URL(url).hostname));
            }, left);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    async function json(url, headers, body) {
      return JSON.parse(await text(url, headers, body));
    }
    async function metadata(url) {
      var hit = documents[url];
      if (hit && Date.now() - hit.time < 300000) return hit.data;
      var d = await json(url);
      documents[url] = { time: Date.now(), data: d };
      documentKeys.push(url);
      while (documentKeys.length > 16) delete documents[documentKeys.shift()];
      return d;
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
          });
        });
      });
      return matches.length === 1 ? matches[0] : null;
    }
    async function runtime(force) {
      if (
        !force &&
        runtimeCache &&
        (runtimeCache.shipped || Date.now() - runtimeCache.time < 600000)
      )
        return runtimeCache;
      var home = await text("https://mkissa.to/");
      var app =
        /["'](https:\/\/[^"']+\/_app\/immutable\/entry\/app\.[^"']+\.js)["']/.exec(
          home,
        );
      if (!app) throw Error("Website application entry missing");
      var entry = address(app[1]);
      if (!entry) throw Error("Invalid application entry");
      var code = await text(entry),
        chunk = /["'](\.\.\/chunks\/[^"']+\.js)["']/.exec(code);
      if (!chunk) throw Error("Website crypto chunk missing");
      var bundle = await text(address(chunk[1], entry));
      runtimeCache = parseRuntime(bundle);
      bootstrapCache = null;
      log(
        "CRYPTO",
        "Website build " + runtimeCache.build + " loaded; literal data only",
      );
      return runtimeCache;
    }
    async function session(rt, force) {
      if (
        !force &&
        bootstrapCache &&
        bootstrapCache.build === rt.build &&
        Date.now() < bootstrapCache.switchAt - 5000
      )
        return bootstrapCache;
      var now = Date.now(),
        epoch = Math.floor(now / rt.epochMs),
        epochs =
          now - epoch * rt.epochMs < rt.graceMs && epoch > 0
            ? [epoch - 1, epoch]
            : [epoch],
        last;
      for (var i = 0; i < epochs.length; i++)
        try {
          var vals = {
            buildId: rt.build,
            group: "mirror",
            host: new URL(SITE).hostname,
            epoch: String(epochs[i]),
            lane: "k7",
          };
          var g = hmac(rt.mask, rt.config.bootPrefix + rt.build);
          var proof = CryptoJS.enc.Hex.stringify(
            word(
              hmac(
                g,
                rt.config.parts
                  .map(function (k) {
                    return vals[k];
                  })
                  .join(rt.config.join),
              ),
            ),
          );
          var b = await json(
            new URL(API).origin +
              "/client-crypto/v1/bootstrap?buildId=" +
              encodeURIComponent(rt.build) +
              "&k=k7",
            {
              "x-build-id": rt.build,
              "x-aa-boot": proof,
              "Cache-Control": "no-cache",
            },
          );
          var part = bytes(b64word(b.partB));
          if (
            !Number.isInteger(b.epoch) ||
            b.epoch !== epochs[i] ||
            !(b.switchAt > Date.now()) ||
            b.k !== "k7" ||
            part.length < 32
          )
            throw Error("Invalid website bootstrap");
          var key = part.slice(0, 32).map(function (v, j) {
            return v ^ rt.mask[j];
          });
          bootstrapCache = {
            key: key,
            epoch: b.epoch,
            switchAt: b.switchAt,
            build: rt.build,
          };
          return bootstrapCache;
        } catch (e) {
          last = e;
        }
      if (
        rt.shipped &&
        last &&
        (last.status === 400 ||
          last.status === 401 ||
          last.status === 403 ||
          /build/i.test(last.message))
      ) {
        var fresh = await runtime(true);
        Object.keys(rt).forEach(function (k) {
          delete rt[k];
        });
        Object.assign(rt, fresh);
        return session(rt, true);
      }
      throw last || Error("Website bootstrap unavailable");
    }
    async function gql(query, variables, rt, encrypted, retry) {
      var ext = {
          persistedQuery: {
            version: 1,
            sha256Hash: CryptoJS.enc.Hex.stringify(CryptoJS.SHA256(query)),
          },
        },
        sess;
      if (encrypted) {
        sess = await session(rt, !!retry);
        var ts = Math.floor(Date.now() / 300000) * 300000,
          qh = ext.persistedQuery.sha256Hash;
        var iv = sha(
          sess.epoch + ":" + rt.build + ":" + qh + ":" + ts + ":k7",
        ).slice(0, 12);
        var payload = JSON.stringify({
          v: 1,
          ts: ts,
          epoch: sess.epoch,
          buildId: rt.build,
          qh: qh,
          k: "k7",
        });
        ext.k = "k7";
        ext.aaReq = CryptoJS.enc.Base64.stringify(
          word([1].concat(iv, gcmEncrypt(sess.key, iv, utf8(payload)))),
        );
      }
      var data = await json(
        API +
          "?variables=" +
          encodeURIComponent(JSON.stringify(variables)) +
          "&extensions=" +
          encodeURIComponent(JSON.stringify(ext)),
        { "x-build-id": rt.build },
      );
      if (
        data.errors &&
        data.errors.some(function (e) {
          return /PersistedQueryNotFound/i.test(e.message || "");
        })
      )
        data = await json(
          API,
          { "Content-Type": "application/json", "x-build-id": rt.build },
          JSON.stringify({
            query: query,
            variables: variables,
            extensions: ext,
          }),
        );
      if (data.errors && data.errors.length) {
        var message = String(data.errors[0].message || "GraphQL error");
        if (
          encrypted &&
          !retry &&
          /^AA_CRYPTO_(?:STALE|EXPIRED)$/.test(message)
        )
          return gql(query, variables, rt, true, true);
        throw Error("AllAnime API: " + message);
      }
      if (data.data && data.data.tobeparsed) {
        if (!sess) throw Error("Unexpected encrypted search response");
        data.data = unseal(data.data.tobeparsed, sess.key);
      }
      return data.data || {};
    }
    function identity(show, mapped, anilist) {
      if (!show || !show._id || show.countryOfOrigin !== "JP") return false;
      if (show.malId != null && String(show.malId) !== String(mapped.id))
        return false;
      if (show.aniListId != null && String(show.aniListId) !== String(anilist))
        return false;
      return (
        Number(show.malId) === mapped.id || Number(show.aniListId) === anilist
      );
    }
    async function catalogue(mapped, rt) {
      var d = await metadata(
        "https://api.ani.zip/mappings?mal_id=" + mapped.id,
      );
      if (
        !d.mappings ||
        Number(d.mappings.mal_id) !== mapped.id ||
        !positive(d.mappings.anilist_id)
      )
        throw Error("Missing matching AniZip title identity");
      var anilist = Number(d.mappings.anilist_id),
        titles = d.titles || {},
        queries = [];
      ["x-jat", "ja", "en"].forEach(function (k) {
        var s = titles[k];
        if (typeof s === "string" && s.trim() && !queries.includes(s.trim()))
          queries.push(s.trim());
      });
      if (!queries.length) throw Error("No search title in verified mapping");
      // Romanized title is normally shortest and matches AllAnime's catalogue.
      queries.sort(function (a, b) {
        return /[^\u0000-\u007f]/.test(a) - /[^\u0000-\u007f]/.test(b);
      });
      var query =
        "query($search:SearchInput){shows(search:$search,limit:40,page:1,translationType:sub,countryOrigin:ALL){edges{_id name aniListId malId countryOfOrigin availableEpisodesDetail}}}";
      for (var i = 0; i < Math.min(queries.length, 2); i++) {
        var data = await gql(
          query,
          {
            search: {
              query: queries[i],
              allowAdult: false,
              allowUnknown: false,
            },
          },
          rt,
          false,
        );
        var edges = data.shows && data.shows.edges;
        var hits = Array.isArray(edges)
          ? edges.filter(function (s) {
              return identity(s, mapped, anilist);
            })
          : [];
        var ids = Object.create(null);
        hits = hits.filter(function (s) {
          if (ids[s._id]) return false;
          ids[s._id] = true;
          return true;
        });
        if (hits.length > 1) throw Error("Ambiguous AllAnime catalogue IDs");
        if (hits.length === 1) {
          var sub =
            hits[0].availableEpisodesDetail &&
            hits[0].availableEpisodesDetail.sub;
          if (
            !Array.isArray(sub) ||
            !sub.some(function (e) {
              return String(e) === String(mapped.ep);
            })
          )
            throw Error("Requested Sub episode unavailable");
          return { show: hits[0], anilist: anilist };
        }
      }
      throw Error("No exact AniList/MAL title match");
    }
    async function media(url, server, referer, format) {
      url = address(url);
      if (!url) throw Error("No HTTPS media URL");
      var headers = { "User-Agent": UA, Referer: referer || SITE + "/" },
        b = await text(
          url,
          Object.assign(
            {},
            headers,
            format === "mp4" ? { Range: "bytes=0-4095" } : {},
          ),
        );
      var hls = format === "hls" || b.trim().indexOf("#EXTM3U") === 0;
      if (hls) {
        if (
          !/^#EXTM3U(?:\r?\n|$)/.test(b.trim()) ||
          !/#EXT-X-STREAM-INF:|#EXTINF:/.test(b)
        )
          throw Error("Invalid HLS document");
        var audio = b.split(/\r?\n/).filter(function (l) {
          return /^#EXT-X-MEDIA:TYPE=AUDIO[,\s]/.test(l);
        });
        if (
          audio.some(function (l) {
            var m = /LANGUAGE="([^"]+)"/.exec(l);
            return m && !/^(?:ja|jp|jpn|japanese)$/i.test(m[1]);
          })
        )
          throw Error("Foreign or mixed HLS audio");
      } else if (b.slice(0, 40).indexOf("ftyp") < 0)
        throw Error("Media URL returned non-MP4 data");
      log("EXTRACT", server + ": " + (hls ? "HLS" : "MP4") + " verified");
      return {
        name: "AllAnime",
        provider: "allanime",
        serverName: server,
        title: "Episode " + episode + " • Japanese Sub",
        url: url,
        type: hls ? "hls" : "mp4",
        mimeType: hls ? "application/x-mpegURL" : "video/mp4",
        quality: "Auto",
        audioLanguage: "ja",
        audioType: "sub",
        headers: Object.assign({}, headers, {
          "X-VUEO-HTTP-Transport": "shared",
        }),
        subtitles: [],
      };
    }
    function htmlDecode(s) {
      return s
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }
    async function extract(source, show, mapped) {
      var u = String(source.sourceUrl || ""),
        server = String(source.sourceName || "AllAnime");
      try {
        if (u.indexOf("--") === 0) {
          var hex = u.slice(2);
          if (!/^(?:[0-9a-f]{2})+$/i.test(hex))
            throw Error("Invalid encoded source");
          u = hex.replace(/../g, function (c) {
            return String.fromCharCode(parseInt(c, 16) ^ 56);
          });
          u = address(
            u.replace(/\/clock(?=\?)/, "/clock.json"),
            "https://filelotion.fyi",
          );
          if (!u) throw Error("Invalid clock URL");
          var d = await json(u),
            links = d.links;
          if (!Array.isArray(links)) throw Error("No clock media links");
          var link = links.find(function (l) {
            return l && address(l.link || l.url);
          });
          if (!link) throw Error("Clock source has no media URL");
          return await media(
            link.link || link.url,
            server,
            SITE + "/",
            link.hls ? "hls" : "mp4",
          );
        }
        u = address(u);
        if (!u) throw Error("Invalid source URL");
        if (source.type === "player" || /\.(?:mp4|m3u8)(?:\?|$)/i.test(u))
          return await media(
            u,
            server,
            SITE + "/",
            source.fileExtenstion === "mp4" || /\.mp4(?:\?|$)/i.test(u)
              ? "mp4"
              : "hls",
          );
        if (new URL(u).hostname === "ok.ru") {
          var page = await text(u),
            opts = /data-options="([^"]+)"/.exec(page);
          if (!opts) throw Error("OK player metadata unavailable");
          var config = JSON.parse(htmlDecode(opts[1])),
            meta = config.flashvars && config.flashvars.metadata;
          meta = typeof meta === "string" ? JSON.parse(meta) : meta;
          if (!meta) throw Error("OK metadata missing");
          var label = (meta.movie && meta.movie.title) || "",
            m = /^([A-Za-z0-9]+)_(\d+)_sub$/.exec(label);
          if (m && (m[1] !== show._id || Number(m[2]) !== mapped.ep))
            throw Error("Conflicting OK episode identity");
          return await media(
            meta.hlsMasterPlaylistUrl || meta.ondemandHls,
            server,
            "https://ok.ru/",
            "hls",
          );
        }
        if (/(?:^|\.)mp4upload\.com$/.test(new URL(u).hostname)) {
          var page = await text(u),
            found = /(?:src|file)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/.exec(
              page,
            );
          if (!found) throw Error("MP4 upload file unavailable");
          return await media(found[1], server, u, "mp4");
        }
        return null;
      } catch (e) {
        log("SOURCE", server + ": " + e.message);
        return null;
      }
    }
    var streams = [];
    try {
      // Start independent website bootstrap discovery while resolving the requested season.
      var results = await Promise.all([
          mapping(),
          runtime().then(async function (rt) {
            await session(rt, false);
            return rt;
          }),
        ]),
        mapped = results[0],
        rt = results[1];
      if (!mapped) throw Error("No unambiguous title/episode mapping");
      log(
        "MAPPING",
        "MAL " + mapped.id + ", episode " + mapped.ep + " via " + mapped.method,
      );
      var found = await catalogue(mapped, rt),
        show = found.show;
      var query =
        "query($showId:String!,$episodeString:String!,$translationType:VaildTranslationTypeEnumType!){episode(showId:$showId,episodeString:$episodeString,translationType:$translationType){episodeString sourceUrls show{_id name aniListId malId countryOfOrigin}}}";
      var data = await gql(
          query,
          {
            showId: show._id,
            episodeString: String(mapped.ep),
            translationType: "sub",
          },
          rt,
          true,
        ),
        ep = data.episode;
      if (
        !ep ||
        String(ep.episodeString) !== String(mapped.ep) ||
        !identity(ep.show, mapped, found.anilist) ||
        ep.show._id !== show._id
      )
        throw Error("Episode response identity mismatch");
      var sources = Array.isArray(ep.sourceUrls) ? ep.sourceUrls : [];
      log(
        "MATCH",
        "Exact AniList " +
          found.anilist +
          " / MAL " +
          mapped.id +
          ", episode " +
          mapped.ep +
          "; " +
          sources.length +
          " Sub candidates",
      );
      var hasDefault = sources.some(function (s) {
        return s && s.sourceName === "Default" && s.sourceUrl;
      });
      var fast = sources.filter(function (s) {
        return (
          s &&
          s.sourceUrl &&
          (s.sourceName === "Default" ||
            (!hasDefault && s.type === "player") ||
            /^https:\/\/ok\.ru\//.test(s.sourceUrl))
        );
      });
      streams = (
        await Promise.all(
          fast.slice(0, 4).map(function (s) {
            return extract(s, show, mapped);
          }),
        )
      ).filter(Boolean);
      if (!streams.length) {
        var other = sources.filter(function (s) {
          return (
            s &&
            s.sourceUrl &&
            !fast.includes(s) &&
            (s.sourceUrl.indexOf("--") === 0 ||
              /^https:\/\/(?:www\.)?mp4upload\.com\//.test(s.sourceUrl))
          );
        });
        streams = (
          await Promise.all(
            other.slice(0, 4).map(function (s) {
              return extract(s, show, mapped);
            }),
          )
        ).filter(Boolean);
      }
      var seen = Object.create(null);
      streams = streams.filter(function (s) {
        if (seen[s.url]) return false;
        seen[s.url] = true;
        return true;
      });
    } catch (e) {
      console.error("[AllAnime] " + e.message);
    }
    log("RESULT", streams.length + " sources, " + calls + " HTTP calls");
    return streams;
  }
  module.exports = { getStreams: getStreams };
})();
if (typeof globalThis !== "undefined")
  globalThis.getStreams = module.exports.getStreams;

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

module.exports = cloudAnimeInstallMinimumResolution(module.exports, "allanime");
if (typeof globalThis !== "undefined") globalThis.getStreams = module.exports.getStreams;
if (typeof global !== "undefined") global.getStreams = module.exports.getStreams;
if (typeof self !== "undefined") self.getStreams = module.exports.getStreams;
