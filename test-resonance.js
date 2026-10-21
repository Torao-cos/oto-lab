// おとラボ resonance.html（弦の振動と気柱の共鳴）自動検証
// 実行: node test-resonance.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8163;
const ROOT = path.resolve(__dirname, '..');   // D:/claude_projects（../nami-lab/common.js を解決するため）
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const OUT = path.join(__dirname, 'test-results');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const TABS = ['string', 'drive', 'pipe', 'tube'];

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const f = path.join(ROOT, u.replace(/^\//, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);
  const base = `http://127.0.0.1:${PORT}/oto-lab/resonance.html`;
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });

  /* ---------- 1. 全タブ × 手元/投影 × 2サイズ：エラー0・横スクロールなし・スクショ ---------- */
  for (const mode of ['dark', 'proj']) {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      await page.goto(`${base}?mode=${mode}#string`);
      await page.waitForTimeout(700);
      for (const tab of TABS) {
        await page.evaluate(h => { location.hash = h; }, '#' + tab);
        await page.waitForTimeout(650);
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, act: document.querySelector('nav.tabs button.active').textContent }));
        check(`[${mode} ${w}] #${tab} 横スクロールなし`, o.sw <= o.iw, `${o.sw}/${o.iw} active=${o.act}`);
        await page.screenshot({ path: path.join(OUT, `resonance-${tab}-${mode}-${w}.png`), fullPage: true });
      }
      check(`[${mode} ${w}] 全タブでエラーなし`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  /* ---------- 2. 操作と数値 ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${base}?mode=dark#string`);
  await page.waitForTimeout(700);
  check('タブが4つ', (await page.locator('nav.tabs button').count()) === 4);
  const formula = () => page.evaluate(() => document.querySelector('.view.show .controls .formula').textContent);

  // --- タブ1 ---
  let r = await page.evaluate(() => { const d = __oto_debug.string; d.setL(0.6); d.setV(120); d.setN(2); return d.calc(); });
  check('弦 2倍振動 L=0.60 v=120 → λ=0.60 m, f=200 Hz', near(r.lam, 0.6, 1e-9) && near(r.f, 200, 1e-9), JSON.stringify(r));
  await page.waitForTimeout(100);
  let ft = await formula();
  check('弦 読み出しに数値代入（200.0 Hz）', ft.includes('2 × 0.60 m / 2') && ft.includes('200.0 Hz'), ft);
  r = await page.evaluate(() => { const d = __oto_debug.string; d.setN(3); d.setL(0.9); d.setV(150); const c = d.calc(); let m = 0; for (let t = 0; t < 3; t += 0.01) m = Math.max(m, Math.abs(d.y(0, t)), Math.abs(d.y(c.L, t)), Math.abs(d.y(c.L / 3, t))); return { c, m }; });
  check('弦 3倍振動 L=0.90 v=150 → f=250 Hz', near(r.c.f, 250, 1e-9), r.c.f);
  check('弦 両端と節（x=L/3）で変位が常に0', r.m < 1e-9, r.m.toExponential(2));
  // 長さスライダーをマウスでドラッグ
  const sliderDrag = async (idx, fromFrac, toFrac) => {
    const box = await page.locator('.view.show .controls input[type=range]').nth(idx).boundingBox();
    await page.mouse.move(box.x + box.width * fromFrac, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (fromFrac + (toFrac - fromFrac) * i / 10), box.y + box.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const L0 = (await page.evaluate(() => __oto_debug.string.calc().L));
  await sliderDrag(0, 0.2, 0.9);
  const L1 = (await page.evaluate(() => __oto_debug.string.calc().L));
  check('弦 L スライダーをマウスでドラッグ → L が変わる', L1 > L0 + 0.1, `${L0} → ${L1}`);
  // 進行波トグル
  await page.locator('.view.show label', { hasText: '左右に進む波を表示' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'resonance-string-traveling.png') });
  // 音（トグル→停止ボタン）
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(200);
  const on1 = await page.evaluate(() => __oto_debug.string.sound.voice.on);
  await page.locator('.view.show button.stopSnd').click();
  await page.waitForTimeout(100);
  const on2 = await page.evaluate(() => ({ v: __oto_debug.string.sound.voice.on, c: __oto_debug.string.sound.toggle.get() }));
  check('音トグルで鳴り、停止ボタンで止まる', on1 === true && on2.v === false && on2.c === false, JSON.stringify({ on1, on2 }));
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(100);
  await page.evaluate(() => { location.hash = '#pipe'; });
  await page.waitForTimeout(300);
  check('タブ切替で音が止まる', await page.evaluate(() => !__oto_debug.string.sound.voice.on));

  // --- タブ2 ---
  await page.evaluate(() => { location.hash = '#drive'; });
  await page.waitForTimeout(500);
  r = await page.evaluate(() => {
    const d = __oto_debug.drive, f1 = d.f1();
    const peaks = [1, 2, 3, 4, 5, 6].map(n => d.amp(n * f1));
    const mids = [1, 2, 3, 4, 5].map(n => d.amp((n + 0.5) * f1));
    // 固有振動数の近くが局所最大か
    const local = [1, 2, 3].every(n => d.amp(n * f1) > d.amp(n * f1 * 0.98) && d.amp(n * f1) > d.amp(n * f1 * 1.02));
    const Y = d.shape(170); const y0 = Y(0), yL = Y(0.6);
    return { f1, peaks, mids, local, y0, yL, fMax: d.fMax() };
  });
  check('振動子 既定 f₁ = v/(2L) = 100 Hz', near(r.f1, 100, 1e-9), r.f1);
  check('振動子 固有振動数で振幅が大きい（≒20倍）', r.peaks.every(p => p > 15 && p < 25), r.peaks.map(p => p.toFixed(2)).join(','));
  check('振動子 固有振動数の間では小さい（<2倍）', r.mids.every(p => p < 2), r.mids.map(p => p.toFixed(2)).join(','));
  check('振動子 固有振動数の近くが局所最大', r.local);
  check('振動子 境界条件 Y(0)=1, Y(L)=0', near(r.y0[0], 1, 1e-9) && near(r.y0[1], 0, 1e-9) && Math.hypot(...r.yL) < 1e-9, JSON.stringify(r));
  const c0 = await page.evaluate(() => __oto_debug.drive.recCount());
  const fA = await page.evaluate(() => __oto_debug.drive.getF());
  await sliderDrag(2, 0.08, 0.5);
  const fB = await page.evaluate(() => __oto_debug.drive.getF());
  const c1 = await page.evaluate(() => __oto_debug.drive.recCount());
  check('振動子 f スライダーをマウスでドラッグ → f が変わる', fB > fA + 100, `${fA} → ${fB}`);
  check('振動子 動かした範囲がグラフに記録される', c1 > c0 + 500, `${c0} → ${c1}`);
  ft = await formula();
  check('振動子 読み出し（λ = v/f に数値代入）', ft.includes('λ = v/f = 120 m/s /'), ft);
  await page.locator('.view.show button', { hasText: '+10' }).click();
  await page.waitForTimeout(100);
  const fC = await page.evaluate(() => __oto_debug.drive.getF());
  check('振動子 微調整 +10 Hz', near(fC, fB + 10, 0.11), `${fB} → ${fC}`);
  await page.locator('.view.show button', { hasText: '自動で掃引' }).click();
  await page.waitForTimeout(1500);
  const sw = await page.evaluate(() => ({ s: __oto_debug.drive.sweeping(), f: __oto_debug.drive.getF() }));
  check('振動子 自動で掃引で f が増える', sw.s && sw.f > fC + 10, JSON.stringify(sw));
  await page.locator('.view.show button', { hasText: '掃引を止める' }).click();
  await page.evaluate(() => { const d = __oto_debug.drive; d.setF(0); for (let f = 0; f <= 400; f += 2) d.setF(f); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'resonance-drive-recorded.png') });
  await page.locator('.view.show button', { hasText: 'グラフを消す' }).click();
  check('振動子 グラフを消す', (await page.evaluate(() => __oto_debug.drive.recCount())) === 1);

  // --- タブ3 ---
  await page.evaluate(() => { location.hash = '#pipe'; });
  await page.waitForTimeout(400);
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('closed'); d.setL(0.5); d.setV(340); d.setCorr(false); d.setN(3); return d.geom(); });
  check('閉管 3倍振動 L=0.50 → λ=0.667 m, f=510 Hz', near(r.lam, 2 / 3, 1e-9) && near(r.f, 510, 1e-9), `${r.lam} ${r.f}`);
  await page.waitForTimeout(100);
  ft = await formula();
  check('閉管 読み出し L = nλ/4（数値代入）', ft.includes('λ = 4L/n = 4 × 0.50 m / 3') && ft.includes('510.0 Hz'), ft);
  r = await page.evaluate(() => { const d = __oto_debug.pipe; const G = d.geom(); return { u0: G.u(0), uL: G.u(G.L), nodes: G.nodes, antis: G.antis }; });
  check('閉管 閉端は変位の節・開口端は腹', Math.abs(r.u0) < 1e-12 && near(Math.abs(r.uL), 1, 1e-9), JSON.stringify(r));
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('open'); d.setN(2); return d.geom(); });
  check('開管 2倍振動 L=0.50 → f=680 Hz', near(r.f, 680, 1e-9), r.f);
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('closed'); d.setN(1); d.setCorr(true); d.setR(3); return d.geom(); });
  check('閉管 補正ON r=3cm → Δx=1.8cm, λ=4(L+Δx)=2.072 m, f=164.1 Hz', near(r.dx, 0.018, 1e-9) && near(r.lam, 2.072, 1e-9) && near(r.f, 340 / 2.072, 1e-9), `${r.dx} ${r.lam} ${r.f}`);
  check('閉管 補正ON 腹は管口の Δx 外側', near(r.antis[0], 0.518, 1e-9), r.antis.join(','));
  await page.evaluate(() => __oto_debug.pipe.setDens(true));
  await page.evaluate(() => __oto_debug.pipe.setN(5));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'resonance-pipe-dens-corr.png') });
  r = await page.evaluate(() => { const d = __oto_debug.pipe; d.setType('open'); d.setN(3); return d.geom(); });
  check('開管 補正ON L+2Δx = 3λ/2', near(r.lam, 2 * (0.5 + 0.036) / 3, 1e-9), r.lam);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'resonance-pipe-open-corr.png') });
  await page.evaluate(() => { const d = __oto_debug.pipe; d.setDens(false); d.setCorr(false); d.setType('closed'); d.setN(1); });

  // --- タブ4 ---
  await page.evaluate(() => { location.hash = '#tube'; });
  await page.waitForTimeout(500);
  r = await page.evaluate(() => {
    const d = __oto_debug.tube, lam = d.lam(), dx = d.dX();
    const l1 = lam / 4 - dx, l2 = 3 * lam / 4 - dx;
    return { lam, dx, l1, l2, r1: d.resp(l1), r2: d.resp(l2), rm: d.resp(lam / 2 - dx), loc: d.resp(l1) > d.resp(l1 - 0.5) && d.resp(l1) > d.resp(l1 + 0.5) };
  });
  check('共鳴実験 512 Hz → λ = 66.41 cm, Δx = 0.90 cm', near(r.lam, 34000 / 512, 1e-9) && near(r.dx, 0.9, 1e-9), `${r.lam} ${r.dx}`);
  check('共鳴実験 l = λ/4 − Δx, 3λ/4 − Δx で応答最大（=1）', near(r.r1, 1, 1e-9) && near(r.r2, 1, 1e-9) && r.loc, `l1=${r.l1.toFixed(2)} l2=${r.l2.toFixed(2)}`);
  check('共鳴実験 l = λ/2 − Δx では応答が小さい', r.rm < 0.1, r.rm);
  // 取っ手をマウスでドラッグ
  const cbox = await page.locator('.view.show canvas').first().boundingBox();
  const gp = await page.evaluate(() => __oto_debug.tube.gripPx());
  const lA = await page.evaluate(() => __oto_debug.tube.getL());
  const rc0 = await page.evaluate(() => __oto_debug.tube.recCount());
  const targetY = await page.evaluate(() => __oto_debug.tube.pxOfL(40));
  await page.mouse.move(cbox.x + gp.X, cbox.y + gp.Y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(cbox.x + gp.X, cbox.y + gp.Y + (targetY - gp.Y) * i / 15);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const lB = await page.evaluate(() => __oto_debug.tube.getL());
  const rc1 = await page.evaluate(() => __oto_debug.tube.recCount());
  check('共鳴実験 水面の取っ手をマウスでドラッグ → l が変わる', near(lB, 40, 1.5) && lA < 10, `${lA} → ${lB}`);
  check('共鳴実験 通った範囲がグラフに記録される', rc1 > rc0 + 500, `${rc0} → ${rc1}`);
  const roTxt = await page.evaluate(() => document.querySelector('.view.show .controls .readout').textContent);
  check('共鳴実験 l の読み出し', roTxt.includes(lB.toFixed(2)), roTxt);
  const paused = await page.evaluate(() => document.querySelector('.view.show .status').hidden);
  check('共鳴実験 取っ手のドラッグでは停止しない', paused, String(paused));
  // 印をつける（l1, l2 の位置）
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL(d.lam() / 4 - d.dX()); });
  await page.locator('.view.show button', { hasText: 'この位置に印をつける' }).click();
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL(3 * d.lam() / 4 - d.dX()); });
  await page.locator('.view.show button', { hasText: 'この位置に印をつける' }).click();
  await page.waitForTimeout(200);
  const mk = await page.evaluate(() => __oto_debug.tube.marks());
  ft = await page.evaluate(() => document.querySelector('.view.show .controls .formula').textContent);
  check('共鳴実験 印が2つ・差 = λ/2 を読み出す', mk.length === 2 && ft.includes('l₂ − l₁ = ' + (mk[1] - mk[0]).toFixed(2) + ' cm'), ft);
  await page.locator('.view.show button', { hasText: '水面をゆっくり下げる' }).click();
  await page.waitForTimeout(1200);
  const au = await page.evaluate(() => ({ a: __oto_debug.tube.auto(), l: __oto_debug.tube.getL() }));
  check('共鳴実験 自動で水面が下がる', au.a && au.l > mk[1] + 2, JSON.stringify(au));
  await page.locator('.view.show button', { hasText: '止める' }).first().click();
  await page.evaluate(() => { const d = __oto_debug.tube; d.setL(1); d.setL(95); d.setL(60); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'resonance-tube-marked.png') });
  // 音
  await page.locator('.view.show label', { hasText: '音を鳴らす' }).click();
  await page.waitForTimeout(200);
  check('共鳴実験 音トグル ON', await page.evaluate(() => __oto_debug.tube.sound.voice.on));
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('.view.show button.stopSnd').click();
  check('共鳴実験 停止ボタンで止まる', await page.evaluate(() => !__oto_debug.tube.sound.voice.on));
  // 振動数を変えるとグラフ・印が消える
  await page.evaluate(() => __oto_debug.tube.setF(256));
  check('共鳴実験 振動数を変えると印が消える', (await page.evaluate(() => __oto_debug.tube.marks().length)) === 0);
  // 時間バー
  await page.evaluate(() => { [...document.querySelectorAll('.view.show .timebar button')].find(b => b.textContent.includes('停止')).click(); });
  const tv = await page.evaluate(() => document.querySelector('.view.show .tval').textContent);
  check('時間表示は周期単位（スローモーション）', tv.includes('周期'), tv);

  check('操作後もエラーなし', errors.length === 0, errors.join(' | '));
  await browser.close();
  server.close();
  const failed = results.filter(x => !x.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
