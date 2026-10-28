// 只记录路径与状态；不采集请求头、查询值、请求体、响应体或 console 文本。
function safePath(value) {
  try {
    const url = new URL(value);
    const route = url.hash.startsWith('#/') ? url.hash.slice(1).split('?')[0] : url.pathname;
    return route.split('/').map(segment =>
      /^[a-zA-Z][a-zA-Z_-]{0,63}$/.test(segment) ? segment : segment ? ':value' : '',
    ).join('/');
  } catch { return '(unknown)'; }
}

function createRecorder(limit = 80) {
  const events = [];
  const active = new Map();
  const started = Date.now();
  let dropped = 0;
  let sequence = 0;
  function record(event) {
    events.push({ atMs: Date.now() - started, ...event });
    if (events.length > limit) { events.shift(); dropped++; }
  }
  function request(request) {
    if (!new URL(request.url()).pathname.startsWith('/api/')) return;
    const entry = { id: ++sequence, method: request.method(), path: safePath(request.url()) };
    active.set(request, entry);
    record({ type: 'request', ...entry });
  }
  function response(response) {
    const entry = active.get(response.request());
    if (entry) record({ type: 'response', ...entry, status: response.status() });
  }
  function finish(request, failed = false) {
    const entry = active.get(request);
    if (!entry) return;
    record({ type: failed ? 'requestfailed' : 'requestfinished', ...entry });
    active.delete(request);
  }
  return {
    record, request, response, finish,
    snapshot: () => ({ dropped, events: [...events], pending: [...active.values()] }),
  };
}

module.exports = { safePath, createRecorder };
