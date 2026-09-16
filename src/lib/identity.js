export function parseIdentity(type, id, extra = {}) {
  if (!['movie','series'].includes(type)) throw new Error('Unsupported type');
  const parts = String(id).split(':');
  if (!/^tt\d{4,12}$/.test(parts[0])) throw new Error('Unsupported IMDb ID');
  let season = null, episode = null;
  if (type === 'series') {
    if (parts.length !== 3 || !/^\d{1,3}$/.test(parts[1]) || !/^\d{1,3}$/.test(parts[2])) throw new Error('Episode ID requires IMDb:season:episode');
    season = Number(parts[1]); episode = Number(parts[2]);
    if (season > 150 || episode > 400) throw new Error('Invalid episode');
  } else if (parts.length !== 1) throw new Error('Movie ID must not contain episode');
  const videoHash = /^[a-f0-9]{16}$/i.test(extra.videoHash || '') ? extra.videoHash.toLowerCase() : '';
  const videoSize = Number.isSafeInteger(Number(extra.videoSize)) && Number(extra.videoSize) > 0 ? Number(extra.videoSize) : null;
  const filename = typeof extra.filename === 'string' ? extra.filename.slice(0,220).replace(/[\\/\x00-\x1f]/g,'') : '';
  return {type, imdb:parts[0], id, season, episode, videoHash, videoSize, filename};
}
export function episodeMatches(item, req) {
  if (req.type !== 'series') return item.season == null && item.episode == null || item.season === 0;
  return Number(item.season) === req.season && Number(item.episode) === req.episode;
}
