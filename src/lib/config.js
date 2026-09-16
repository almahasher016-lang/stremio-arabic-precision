import { randomBytes } from 'node:crypto';
const number = (value, fallback, min, max) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
};
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (production && (!env.PUBLIC_BASE_URL || !/^https:\/\//.test(env.PUBLIC_BASE_URL))) {
    throw new Error('PUBLIC_BASE_URL must be https in production');
  }
  if (production && (!env.LINK_SIGNING_SECRET || env.LINK_SIGNING_SECRET.length < 32)) {
    throw new Error('LINK_SIGNING_SECRET requires 32+ characters in production');
  }
  const base = env.PUBLIC_BASE_URL ? new URL(env.PUBLIC_BASE_URL).origin : '';
  return Object.freeze({
    production, base, host: env.HOST || '0.0.0.0', port: number(env.PORT, 3000, 1, 65535),
    secret: env.LINK_SIGNING_SECRET || randomBytes(32).toString('hex'),
    searchTimeout: number(env.SEARCH_TIMEOUT_MS, 3500, 300, 20000),
    downloadTimeout: number(env.DOWNLOAD_TIMEOUT_MS, 9000, 500, 30000),
    deadline: number(env.REQUEST_DEADLINE_MS, 6000, 500, 30000),
    searchTTL: number(env.SEARCH_CACHE_TTL_MS, 600000, 1000, 86400000),
    negativeTTL: number(env.NEGATIVE_CACHE_TTL_MS, 45000, 1000, 600000),
    contentTTL: number(env.CONTENT_CACHE_TTL_MS, 86400000, 1000, 604800000),
    maxSubtitles: number(env.MAX_SUBTITLES, 12, 1, 30),
    maxDownloadBytes: number(env.MAX_DOWNLOAD_BYTES, 5242880, 65536, 20971520),
    providers: (env.SUBTITLE_PROVIDERS || 'opensubtitles,subdl,subsource').split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
    opensubtitlesKey: env.OPENSUBTITLES_API_KEY || '', opensubtitlesToken: env.OPENSUBTITLES_TOKEN || '',
    subdlKey: env.SUBDL_API_KEY || '', subsourceKey: env.SUBSOURCE_API_KEY || '',
    subsourceBase: env.SUBSOURCE_BASE_URL || 'https://api.subsource.net/api/v1',
    dataDir: env.DATA_DIR || '',
    referenceSync: env.ENABLE_REFERENCE_SYNC === 'true',
    alassBinary: env.ALASS_BINARY || 'alass',
  });
}
