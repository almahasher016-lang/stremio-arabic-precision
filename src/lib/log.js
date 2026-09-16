const redact = value => typeof value === 'string' ? value.replace(/((?:api[_-]?key|token|secret|authorization))[=:]\s*[^\s&]+/ig, '$1=[REDACTED]') : value;
export function log(level, event, fields = {}, writer = console.log) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/token|secret|key|authorization|url|body|text|filename/i.test(key)) continue;
    safe[key] = redact(value);
  }
  writer(JSON.stringify({time: new Date().toISOString(), level, event, ...safe}));
}
