/* Embedded in HiAnime so its standalone provider needs no extra imports. */
async function cloudAnimeLinkedEpisode(rows, read, season, episode) {
  var anchors = rows.filter(function(row) {
    return row && Number(row['themoviedb-season']) === season &&
      row['themoviedb-season'] != null && row['thetvdb-season'] != null &&
      Number(row['thetvdb-season']) === season && Number(row.thetvdb) > 0;
  });
  if (!anchors.length) return null;
  var candidates = rows.filter(function(row) {
    return Number(row.myanimelist) > 0 && row['thetvdb-season'] != null && anchors.some(function(anchor) {
        return String(anchor.themoviedb) === String(row.themoviedb) && Number(anchor.thetvdb) === Number(row.thetvdb);
      });
  }).filter(function(row, index, list) {
    return list.findIndex(function(other) { return Number(other.myanimelist) === Number(row.myanimelist); }) === index;
  });
  if (candidates.length > 12) throw Error('Episode mapping exceeds candidate budget');
  var matches = [], outside = false, parts = [];
  for (var offset = 0; offset < candidates.length; offset += 4) {
    var batch = candidates.slice(offset, offset + 4);
    var datasets = await Promise.all(batch.map(function(row) {
      return read('https://api.ani.zip/mappings?mal_id=' + Number(row.myanimelist));
    }));
    batch.forEach(function(row, index) {
      var data = datasets[index], mapping = data && data.mappings;
      if (!mapping || Number(mapping.mal_id) !== Number(row.myanimelist) ||
          String(mapping.themoviedb_id) !== String(row.themoviedb) ||
          Number(mapping.thetvdb_id) !== Number(row.thetvdb)) throw Error('Conflicting episode mapping identity');
      if (Number(row['themoviedb-season']) === season && Number(data.episodeCount) > 0 && episode > Number(data.episodeCount)) outside = true;
      parts.push({row:row,data:data});
      Object.values(data.episodes || {}).forEach(function(entry) {
        if (!entry || entry.seasonNumber == null || entry.episodeNumber == null ||
            Number(entry.tvdbShowId) !== Number(row.thetvdb) || Number(entry.seasonNumber) !== season ||
            Number(entry.episodeNumber) !== episode || !Number.isInteger(Number(entry.episode)) || Number(entry.episode) < 1) return;
        var result = {id:Number(row.myanimelist), ep:Number(entry.episode), method:'linked exact episode identity'};
        if (!matches.some(function(hit) { return hit.id === result.id && hit.ep === result.ep; })) matches.push(result);
      });
    });
  }
  if (matches.length > 1) throw Error('Conflicting episode mapping candidates');
  if (matches.length === 1) return matches[0];
  if (outside && season === 1) {
    var ranges = parts.map(function(part) {
      var entries = Object.values(part.data.episodes || {}).filter(function(entry) {
        return entry && /^[1-9]\d*$/.test(String(entry.episode));
      }).sort(function(a,b) { return Number(a.episode)-Number(b.episode); });
      if (!entries.length || entries.length !== Number(part.data.episodeCount)) return null;
      var start = Number(entries[0].absoluteEpisodeNumber);
      if (!Number.isInteger(start) || start < 1) return null;
      if (!entries.every(function(entry,index) {
        return Number(entry.episode) === index+1 && Number(entry.tvdbShowId) === Number(part.row.thetvdb) &&
          Number(entry.absoluteEpisodeNumber) === start+index && Number(entry.seasonNumber) > 0;
      })) return null;
      return {start:start,end:start+entries.length-1,entries:entries,row:part.row};
    });
    if (ranges.every(Boolean)) {
      ranges.sort(function(a,b) { return a.start-b.start; });
      var next=1, selected=null, complete=true;
      ranges.forEach(function(range) {
        if (range.start !== next) complete=false;
        next=range.end+1;
        if (episode >= range.start && episode <= range.end)
          selected={id:Number(range.row.myanimelist),ep:Number(range.entries[episode-range.start].episode),method:'verified continuous absolute episode mapping'};
      });
      if (complete && selected) return selected;
    }
  }
  if (outside) throw Error('No verified episode mapping outside original anime range');
  return null;
}
