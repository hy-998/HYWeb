/* 量化"首访时主页闪一下"的时长：在 index 文档里注入探针，
   记录 FCP 与 clone.js 跳转发生的时间点，跳转后在 intro.html 读回。 */
const PORT = process.argv[2] || '9333';
const URL_ = process.argv[3] || 'https://hy-998.github.io/HYWeb/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROBE = `
  (function () {
    if (!/\\/HYWeb\\/(index\\.html)?$/.test(location.pathname)) return;
    try {
      sessionStorage.removeItem('hy_fcp');
      sessionStorage.setItem('hy_doc_start', String(performance.timeOrigin));
      new PerformanceObserver(function (l) {
        l.getEntries().forEach(function (e) {
          if (e.name === 'first-contentful-paint') {
            sessionStorage.setItem('hy_fcp', String(e.startTime));
            sessionStorage.setItem('hy_fcp_wall', String(performance.timeOrigin + e.startTime));
          }
        });
      }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver(function (l) {
        l.getEntries().forEach(function (e) {
          if (e.name === 'largest-contentful-paint' && !sessionStorage.getItem('hy_lcp')) {
            sessionStorage.setItem('hy_lcp', String(performance.timeOrigin + e.startTime));
          }
        });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}
  })();
`;

async function main() {
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const marks = [];
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
      return;
    }
    if (m.method === 'Network.responseReceived' && m.params.type === 'Document') {
      marks.push({ t: m.params.response.timing ? m.params.response.timing.requestTime : null, kind: 'doc-response', url: m.params.response.url });
    }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) {
      marks.push({ t: Date.now() / 1000, kind: 'commit', url: m.params.frame.url });
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Storage.clearDataForOrigin', { origin: 'https://hy-998.github.io', storageTypes: 'local_storage' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });

  await send('Page.navigate', { url: URL_ });
  await sleep(6000);
  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
  const href = await evalJs('location.href');
  const probe = await evalJs(`JSON.stringify({
    fcp: sessionStorage.getItem('hy_fcp'),
    fcpWall: sessionStorage.getItem('hy_fcp_wall'),
    docStart: sessionStorage.getItem('hy_doc_start'),
    lcp: sessionStorage.getItem('hy_lcp')
  })`);
  console.log(JSON.stringify({ href, probe: JSON.parse(probe), marks }, null, 2));
  ws.close();
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
