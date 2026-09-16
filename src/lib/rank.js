import { episodeMatches } from './identity.js';
const releaseTokens = str => new Set(String(str||'').toLowerCase().replace(/\.(mkv|mp4|avi|srt|vtt|ass)$/,'').split(/[^a-z0-9]+/).filter(x => x.length > 2 && !/^(1080p|720p|2160p|x264|x265|h264|h265|arabic|subs)$/.test(x)));
export function rank(item, req) {
  if (item.lang !== 'ara' || !episodeMatches(item,req)) return -Infinity;
  if (item.imdb && item.imdb !== req.imdb) return -Infinity;
  if (item.moviehash && req.videoHash && item.moviehash !== req.videoHash) return -Infinity;
  if (item.videoSize && req.videoSize && item.videoSize !== req.videoSize) return -Infinity;
  let points = 10;
  if (req.videoHash && item.moviehash === req.videoHash) points += 150;
  if (req.videoSize && item.videoSize === req.videoSize) points += 20;
  if (item.imdb === req.imdb) points += 40;
  // Prefer the public official Stremio source when an account-key download quota is exhausted.
  // Hash-verified matches still carry a larger weight (+150).
  if (item.provider === 'stremio_v3') points += 85;
  const a = releaseTokens(req.filename), b = releaseTokens(item.release);
  if (a.size && b.size) {const common = [...a].filter(x=>b.has(x)).length; points += Math.min(50,common*8);}
  const sourceA = /\b(blu.?ray|web.?dl|webrip|hdtv|dvdrip|remux)\b/i.exec(req.filename||'')?.[0]?.replace(/[^a-z]/gi,'').toLowerCase();
  const sourceB = /\b(blu.?ray|web.?dl|webrip|hdtv|dvdrip|remux)\b/i.exec(item.release||'')?.[0]?.replace(/[^a-z]/gi,'').toLowerCase();
  if (sourceA && sourceB) points += sourceA===sourceB ? 18 : -24;
  points += Math.min(15, Math.log10(Math.max(1,item.downloads||1))*4);
  if (item.hearingImpaired) points -= 5;
  if (item.machineTranslated) points -= 15;
  return points;
}
export function rankAll(items, req, limit = 12) {
  const seen = new Set();
  return items.map(item=>({...item,score:rank(item,req)})).filter(item=>Number.isFinite(item.score))
    .sort((a,b)=>b.score-a.score || a.provider.localeCompare(b.provider)).filter(item=>{const key=`${item.provider}:${item.id}`;if(seen.has(key)) return false; seen.add(key);return true;}).slice(0,limit);
}
