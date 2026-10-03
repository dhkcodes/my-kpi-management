const WebSocket = require('ws');
const fs = require('fs');
const http = require('http');

const CDP = 'http://127.0.0.1:9223';
const BASE = 'http://127.0.0.1:18182';
const getJson = (url) => new Promise((resolve, reject) => http.get(url, (res) => {
  let body = ''; res.on('data', (c) => body += c); res.on('end', () => resolve(JSON.parse(body)));
}).on('error', reject));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const targets = await getJson(`${CDP}/json`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('No CDP page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id; pending.set(callId, { resolve, reject });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id) {
      const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id);
      return msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
    if (msg.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = msg.params;
    const url = new URL(request.url);
    const path = url.pathname;
    let body;
    if (path === '/api/v1/auth/session') {
      body = { userKey: 'mobile-gate', displayName: 'Mobile Gate', loginId: 'mobile.gate', access: 'Admin', status: 'ACTIVE', menuPermissions: {} };
    } else if (path === '/api/v1/calendar/events') {
      body = [{ id: 4201, ownerUserKey: 'mobile-gate', versionNo: 1, title: 'Mobile Calendar Gate', startsAt: '2026-10-06T00:00:00+09:00', endsAt: null, allDay: false, hasEndTime: false, timeUnknown: true, forcePrivate: false, status: 'SCHEDULED', timezone: 'Asia/Seoul', accountId: 4, location: null, description: 'Read-only mobile fixture', visibility: 'PRIVATE', effectiveVisibility: 'PRIVATE', effectiveAccess: 'EDIT' }];
    } else if (path === '/api/v1/calendar/events/4201/shares' || path === '/api/v1/calendar/shares') {
      body = [];
    } else if (path.startsWith('/api/v1/collaboration/directory/')) {
      body = [];
    } else if (path.startsWith('/api/')) {
      body = [];
    }
    if (body !== undefined) {
      await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
    } else {
      await send('Fetch.continueRequest', { requestId });
    }
  });
  await new Promise((r) => ws.once('open', r));
  await send('Page.enable'); await send('Runtime.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*://127.0.0.1:18182/api/*', requestStage: 'Request' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  async function gate(route, expected, screenshot) {
    await send('Page.navigate', { url: `${BASE}/` });
    await delay(600);
    await send('Runtime.evaluate', { expression: `history.pushState({}, '', '/${route}'); window.dispatchEvent(new PopStateEvent('popstate'));` });
    let result;
    for (let i = 0; i < 50; i++) {
      await delay(200);
      result = await send('Runtime.evaluate', { expression: `(() => ({ text: document.body?.innerText || '', ready: document.readyState, innerWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body?.scrollWidth || 0, fatal: [...document.querySelectorAll('body *')].some(e => /fatal|uncaught|application error/i.test(e.textContent || '')) }))()`, returnByValue: true });
      const value = result.result.value;
      if (value.ready === 'complete' && expected.every((token) => value.text.includes(token))) break;
    }
    const value = result.result.value;
    const missing = expected.filter((token) => !value.text.includes(token));
    if (missing.length) throw new Error(`${route}: missing text ${missing.join(', ')}\n${value.text.slice(0, 2000)}`);
    if (value.scrollWidth > value.innerWidth + 1 || value.bodyWidth > value.innerWidth + 1) throw new Error(`${route}: horizontal overflow ${JSON.stringify(value)}`);
    if (value.fatal) throw new Error(`${route}: fatal error marker found`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
    return { route, viewport: `${value.innerWidth}x844`, scrollWidth: value.scrollWidth, bodyWidth: value.bodyWidth, expected };
  }

  const results = [];
  const calendar = await gate('calendar', ['Calendar', 'Today', '전체 공유 관리'], '/home/opc/tmp/kap-calendar-mobile.png');
  results.push(calendar);
  results.push(await gate('meeting-notes', ['Meeting Notes', 'Create note', 'Codex · 연결 기능 미준비'], '/home/opc/tmp/kap-meeting-notes-mobile.png'));
  fs.writeFileSync('/home/opc/tmp/kap_mobile_gate.json', JSON.stringify({ passed: true, results }, null, 2));
  console.log(JSON.stringify({ passed: true, results }, null, 2));
  ws.close();
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
