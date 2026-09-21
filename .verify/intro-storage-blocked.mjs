/* 边界：浏览器禁用本地存储（localStorage 访问抛错）时是否陷入
   index → intro → index 循环。注入 shim 让 localStorage getter 抛错。 */
const PORT = process.argv[2] || '9333';
const URL_ = process.argv[3] || 'https://hy-998.github.io/HYWeb/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHIM = `Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { throw new DOMException('denied', 'SecurityError'); } });`;

async function main() {
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;

  await send('Page.navigate', { url: URL_ });
  await sleep(5000);
  const afterRoot = await ev('location.pathname');

  const hasEnter = await ev("!!document.getElementById('enterBtn')");
  if (hasEnter) { await ev("document.getElementById('enterBtn').click()"); await sleep(5000); }
  const afterEnter = await ev('location.pathname');

  console.log(JSON.stringify({ afterRoot, hasEnter, afterEnter, looped: /intro\.html$/.test(afterEnter) }, null, 2));
  ws.close();
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
