// おとラボ: 音シミュの旧ページ（combine / quincke / resonance）がなみラボの移転先へ飛ぶかの確認
// 実行: node test-redirect.js（torao-cos.github.io への通信は横取りして URL だけ記録する）
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8164;
const ROOT = __dirname;
const N = 'https://torao-cos.github.io/nami-lab/';
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); }

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/^\//, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  const browser = await chromium.launch({ headless: true });
  const L = `http://127.0.0.1:${PORT}/`;

  async function landing(url, js = true) {
    const ctx = await browser.newContext({ javaScriptEnabled: js });
    const page = await ctx.newPage();
    let hit = null;
    await ctx.route('https://torao-cos.github.io/**', r => { r.fulfill({ status: 200, contentType: 'text/html', body: '<p>nami</p>' }); });
    page.on('framenavigated', f => { if (f === page.mainFrame() && f.url().startsWith(N)) hit = f.url(); });
    await page.goto(url).catch(() => { });
    for (let i = 0; i < 40 && !hit; i++) await page.waitForTimeout(100);
    await ctx.close();
    return hit;
  }

  const cases = [
    ['combine.html', N + 'sound.html#combine'],
    ['combine.html?mode=proj', N + 'sound.html?mode=proj#combine'],
    ['quincke.html', N + 'applied.html#quincke'],
    ['quincke.html?mode=proj#quincke', N + 'applied.html?mode=proj#quincke'],
    ['resonance.html', N + 'sound.html#string'],
    ['resonance.html#string', N + 'sound.html#string'],
    ['resonance.html#drive', N + 'sound.html#drive'],
    ['resonance.html?mode=proj#pipe', N + 'sound.html?mode=proj#pipe'],
    ['resonance.html?mode=dark#tube', N + 'sound.html?mode=dark#tube'],
    ['resonance.html#nothing', N + 'sound.html#string']
  ];
  for (const [src, want] of cases) {
    const got = await landing(L + src);
    check(`${src} → ${want.replace(N, 'nami-lab/')}`, got === want, String(got));
  }
  // JS なし（meta refresh）
  for (const [src, want] of [['combine.html', N + 'sound.html#combine'], ['quincke.html', N + 'applied.html#quincke'], ['resonance.html', N + 'sound.html#string']]) {
    const got = await landing(L + src, false);
    check(`JS なしでも meta refresh で ${src} → ${want.replace(N, 'nami-lab/')}`, got === want, String(got));
  }
  // リダイレクトページのリンク 1 行
  for (const src of ['combine.html', 'quincke.html', 'resonance.html']) {
    const s = fs.readFileSync(path.join(ROOT, src), 'utf8');
    const links = s.match(/<a href="([^"]+)"/g) || [];
    check(`${src} はリンク 1 行・移転先を指す`, links.length === 1 && links[0].includes(N), links.join(' '));
  }

  // index.html: simSel・footer・パンくず
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('https://torao-cos.github.io/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>nami</p>' }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(L + 'index.html?mode=proj'); await page.waitForTimeout(400);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#simSel option')].map(o => o.value).filter(Boolean));
    check('simSel は nami-lab を直接指す（6 項目）', opts.length === 6 && opts.every(v => v.startsWith('https://torao-cos.github.io/nami-lab/')), opts.join(' '));
    const foot = await page.evaluate(() => [...document.querySelectorAll('footer a')].map(a => a.getAttribute('href')));
    check('footer のリンクは nami-lab を直接指す', foot.length === 3 && foot.every(h => h.startsWith(N)), foot.join(' '));
    const crumb = await page.evaluate(() => { const c = document.querySelector('header.top .crumb'); return c && { text: c.textContent.replace(/\s+/g, ' ').trim(), href: c.querySelector('a').getAttribute('href') }; });
    check('パンくず「SciCos 理科ラボ › おとラボ」', crumb && crumb.text === 'SciCos 理科ラボ›おとラボ' && crumb.href === '../scicos-lab/', JSON.stringify(crumb));
    const nav = page.waitForNavigation({ url: u => u.toString().startsWith(N) });
    await page.selectOption('#simSel', N + 'sound.html#drive');
    await nav;
    check('投影モードで simSel → ?mode=proj を引き継ぐ', page.url() === N + 'sound.html?mode=proj#drive', page.url());
    check('index.html の pageerror 0', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close(); server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
