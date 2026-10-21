// おとラボ combine.html（2つの正弦波の合成）自動検証
// 実行: node test-combine.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8161;
const ROOT = path.resolve(__dirname, '..');   // D:/claude_projects
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const f = path.join(ROOT, u.replace(/^\//, ''));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  }).listen(PORT);

  const OUT = path.join(__dirname, 'test-results');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${PORT}/oto-lab/combine.html`;

  async function open(mode, w, h, hash = '#combine') {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(`${base}?mode=${mode}${hash}`);
    await page.waitForTimeout(800);
    return { ctx, page, errors };
  }
  const noHScroll = page => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));

  // ---------- 1. 全モード×サイズ×横軸 ----------
  for (const mode of ['dark', 'proj']) {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      const { ctx, page, errors } = await open(mode, w, h);
      for (const axis of ['x', 't']) {
        await page.evaluate(a => window.__oto_debug.setAxis(a), axis);
        await page.evaluate(() => window.__oto_debug.preset('beat'));
        await page.waitForTimeout(500);
        const o = await noHScroll(page);
        check(`${mode} ${w}x${h} 横軸${axis} 横スクロールなし`, o.sw <= o.iw && o.bw <= o.iw, JSON.stringify(o));
        await page.screenshot({ path: path.join(OUT, `combine-${mode}-${w}-${axis}.png`), fullPage: true });
      }
      check(`${mode} ${w}x${h} console error・pageerror 0`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  // ---------- 2. 操作（1280 手元・x 軸） ----------
  {
    const { ctx, page, errors } = await open('dark', 1280, 800);
    const dbg = fn => page.evaluate(fn);
    check('タブ1つ（combine）', (await page.locator('nav.tabs button').count()) === 1);
    check('canvas 2枚（上段・下段）', (await page.locator('.view.show canvas').count()) === 2);
    // 停止
    await page.evaluate(() => document.querySelector('.view.show .timebar button').click());
    await page.waitForTimeout(200);
    const boxU = await page.locator('.view.show canvas').nth(0).boundingBox();
    const boxL = await page.locator('.view.show canvas').nth(1).boundingBox();
    // 共有する横軸（px が両段で同じ）
    const sh = await dbg(() => { const d = window.__oto_debug; return [d.cvU.px(2), d.cvL.px(2), d.cvU.px(7), d.cvL.px(7)]; });
    check('上下段で横軸の目盛り位置が同じ', Math.abs(sh[0] - sh[1]) < 0.5 && Math.abs(sh[2] - sh[3]) < 0.5, JSON.stringify(sh));

    // 数値: 読み出しが式どおり
    const num = await dbg(() => {
      const d = window.__oto_debug, S = d.St, t = d.curT(), x = S.xg;
      const e1 = S.A[0] * Math.sin(2 * Math.PI * (x - S.sx[0] - S.v * t) / S.lam[0]);
      const e2 = S.A[1] * Math.sin(2 * Math.PI * (x - S.sx[1] - S.v * t) / S.lam[1]);
      return { e1, e2, y1: d.yi(0, x), y2: d.yi(1, x), ro: document.querySelector('.view.show .readout').textContent };
    });
    const f2 = v => (Math.abs(v) < 5e-10 ? 0 : v).toFixed(2).replace('-', '−');
    check('y₁・y₂ が式どおり', Math.abs(num.e1 - num.y1) < 1e-12 && Math.abs(num.e2 - num.y2) < 1e-12, `${num.y1} ${num.y2}`);
    check('読み出し y = y₁ + y₂ が一致', num.ro.includes('y₁ = ' + f2(num.e1)) && num.ro.includes('= ' + f2(num.e1 + num.e2) + ' m'), num.ro);

    // 縦線ドラッグ（上段）
    const xg0 = await dbg(() => window.__oto_debug.St.xg);
    const lx = await dbg(() => window.__oto_debug.cvU.px(window.__oto_debug.St.xg));
    const ro0 = await page.locator('.view.show .readout').first().textContent();
    await page.mouse.move(boxU.x + lx, boxU.y + boxU.height * 0.8);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(boxU.x + lx + k * 15, boxU.y + boxU.height * 0.8);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const xg1 = await dbg(() => window.__oto_debug.St.xg);
    const ro1 = await page.locator('.view.show .readout').first().textContent();
    check('上段の縦線ドラッグで着目点が右へ動く', xg1 > xg0 + 0.5, `${xg0.toFixed(2)} → ${xg1.toFixed(2)}`);
    check('縦線ドラッグで読み出しが変わる', ro0 !== ro1, `${ro0} → ${ro1}`);
    const st1 = await page.evaluate(() => document.querySelector('.view.show .status').textContent);
    check('ドラッグ後にクリック誤爆なし（停止のまま）', st1.includes('停止中'), st1);
    // 下段からも縦線ドラッグ
    const lx2 = await dbg(() => window.__oto_debug.cvL.px(window.__oto_debug.St.xg));
    await page.mouse.move(boxL.x + lx2, boxL.y + boxL.height * 0.3);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(boxL.x + lx2 - k * 20, boxL.y + boxL.height * 0.3);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const xg2 = await dbg(() => window.__oto_debug.St.xg);
    check('下段の縦線ドラッグで着目点が左へ動く', xg2 < xg1 - 0.5, `${xg1.toFixed(2)} → ${xg2.toFixed(2)}`);

    // 曲線ドラッグ（y₂ をつかむ）: y₁ と y₂ が離れていて縦線・取っ手から遠い点を探す
    const pick = await dbg(() => {
      const d = window.__oto_debug, cv = d.cvU, xg = d.St.xg;
      const pk = [d.peak(0), d.peak(1)];
      for (let x = 0.3; x < d.W() - 0.3; x += 0.05) {
        if (Math.abs(x - xg) < 1) continue;
        if (pk.some(p => Math.abs(cv.px(p.x) - cv.px(x)) < 40)) continue;
        const Y1 = cv.py(d.yi(0, x)), Y2 = cv.py(d.yi(1, x));
        if (Math.abs(Y1 - Y2) > 40) return { X: cv.px(x), Y: Y2, s2: d.St.sx[1], s1: d.St.sx[0] };
      }
      return null;
    });
    check('曲線ドラッグ用の点が見つかる', !!pick);
    if (pick) {
      await page.mouse.move(boxU.x + pick.X, boxU.y + pick.Y);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) await page.mouse.move(boxU.x + pick.X + k * 8, boxU.y + pick.Y);
      await page.waitForTimeout(100);
      await page.screenshot({ path: path.join(OUT, 'combine-drag-curve.png') });
      await page.mouse.up();
      await page.waitForTimeout(150);
      const s = await dbg(() => [window.__oto_debug.St.sx[0], window.__oto_debug.St.sx[1]]);
      const dxW = await dbg(() => 64 / window.__oto_debug.cvU.sx);
      check('y₂ の曲線ドラッグで y₂ だけ右へずれる', Math.abs(s[1] - pick.s2 - dxW) < 0.05 && s[0] === pick.s1, `Δx₂ ${pick.s2.toFixed(2)} → ${s[1].toFixed(3)}（期待 +${dxW.toFixed(3)}）, Δx₁=${s[0]}`);
    }

    // 山の取っ手（y₁）: 上へ動かすと振幅が増える
    const pk = await dbg(() => { const d = window.__oto_debug; const q = d.peak(0); return { X: d.cvU.px(q.x), Y: d.cvU.py(q.y), A: d.St.A[0], sy: d.cvU.sy }; });
    await page.mouse.move(boxU.x + pk.X, boxU.y + pk.Y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(boxU.x + pk.X, boxU.y + pk.Y - k * 5);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const A1 = await dbg(() => window.__oto_debug.St.A[0]);
    const sl = await page.evaluate(() => document.querySelectorAll('.view.show .controls input[type=range]')[0].value);
    check('山の取っ手を上へ → A₁ が増える', A1 > pk.A + 0.1, `${pk.A} → ${A1}（期待 ≈ ${(pk.A + 30 / pk.sy).toFixed(2)}）`);
    check('A₁ スライダーも追随', Math.abs(parseFloat(sl) - A1) < 1e-9, sl);
    // 取っ手を左右 → ずれ
    const pk2 = await dbg(() => { const d = window.__oto_debug; const q = d.peak(0); return { X: d.cvU.px(q.x), Y: d.cvU.py(q.y), ux: q.x, s1: d.St.sx[0] }; });
    await page.mouse.move(boxU.x + pk2.X, boxU.y + pk2.Y);
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(boxU.x + pk2.X + k * 6, boxU.y + pk2.Y);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const s1b = await dbg(() => window.__oto_debug.St.sx[0]);
    check('山の取っ手を右へ → y₁ がずれる', s1b > pk2.s1 + 0.1, `${pk2.s1.toFixed(2)} → ${s1b.toFixed(2)}`);
    check('操作でプリセット表示は「自由」', (await page.evaluate(() => document.querySelectorAll('.view.show .controls select')[1].value)) === 'free');

    // クリック（ドラッグなし）で再開
    await page.mouse.click(boxL.x + 10 + (await dbg(() => window.__oto_debug.cvL.pad.l)), boxL.y + 20);
    await page.waitForTimeout(250);
    const st2 = await page.evaluate(() => document.querySelector('.view.show .status').hidden);
    check('クリック（ドラッグなし）で再開', st2 === true);
    // x 軸で▶: 波が進む（同じ v）＝ 合成波の形も平行移動
    const tr = await dbg(() => new Promise(r => { const d = window.__oto_debug; const t0 = d.curT(), y0 = d.ysum(3); setTimeout(() => { const t1 = d.curT(); const dx = d.St.v * (t1 - t0); r({ t0, t1, ok: Math.abs(d.ysum(3 + dx) - y0) < 1e-9 }); }, 400); }));
    check('x 軸で再生 → 合成波の形がそのまま v で右へ進む', tr.t1 > tr.t0 && tr.ok, JSON.stringify(tr));

    // プリセットの数値
    const pre = await dbg(() => {
      const d = window.__oto_debug, out = {};
      const scan = () => { let m = 0; for (let x = 0; x <= d.W(); x += 0.005) m = Math.max(m, Math.abs(d.ysum(x))); return m; };
      d.preset('same'); out.same = scan(); out.A = d.St.A[0];
      d.preset('opp'); out.opp = scan();
      d.preset('double'); out.dbl = [d.St.lam[0], d.St.lam[1]];
      d.setAxis('t'); d.preset('beat');
      out.beatF = [d.St.f[0], d.St.f[1]];
      // 包絡線の 0（=合成振幅 0）の間隔 1/|f1-f2|
      d.St.st = [0, 0];
      const y = t => d.St.A[0] * Math.sin(2 * Math.PI * d.St.f[0] * t) + d.St.A[1] * Math.sin(2 * Math.PI * d.St.f[1] * t);
      out.beatY = Math.abs(y(2.5)); // 1/(2|Δf|)=2.5 s で 2 波は逆位相 → 0
      out.envTxt = '';
      return out;
    });
    check('山と山 → 合成の最大変位 = 2A', Math.abs(pre.same - 2 * pre.A) < 1e-3, `${pre.same.toFixed(4)} / 2A=${2 * pre.A}`);
    check('山と谷 → 合成波はほぼ 0', pre.opp < 1e-9, pre.opp.toExponential(2));
    check('2倍 → λ₂ = λ₁/2', pre.dbl[1] * 2 === pre.dbl[0], JSON.stringify(pre.dbl));
    check('うなり（t）→ t = 1/(2|f₁−f₂|) で合成 0', pre.beatY < 1e-9, `f=${pre.beatF} y(2.5)=${pre.beatY.toExponential(2)}`);
    await page.evaluate(() => document.querySelector('.view.show .detailBtn').click());
    await page.evaluate(() => window.__oto_debug.toggleEnv(true));
    await page.evaluate(() => window.__oto_debug.toggleGhost(true));
    await page.waitForTimeout(300);
    const envTxt = await page.evaluate(() => document.querySelector('.view.show .controls.detail').textContent);
    check('詳しく: 包絡線 0 の間隔 = 1/|f₁−f₂| = 5.00 s', envTxt.includes('5.00 s'), envTxt.slice(0, 120));
    // t 軸で再生 → 縦線が右へ進み、右端で左へ戻る
    const run = await dbg(() => new Promise(r => { const d = window.__oto_debug; const c0 = d.cursor(); setTimeout(() => r({ c0, c1: d.cursor() }), 500); }));
    check('t 軸で再生 → 縦線が右へ進む', run.c1 > run.c0, JSON.stringify(run));
    await page.evaluate(() => window.__oto_debug.sim.setT(9.95));
    await page.waitForTimeout(400);
    const wrap = await dbg(() => window.__oto_debug.cursor());
    check('t 軸 → 右端で左端へ戻る', wrap < 1, wrap.toFixed(3));
    await page.evaluate(() => document.querySelector('.view.show .timebar button').click()); // 停止
    await page.evaluate(() => window.__oto_debug.sim.setT(4.3));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'combine-dark-1280-t-env.png'), fullPage: true });
    // t 軸で縦線ドラッグ → 時刻が動く
    const lt = await dbg(() => window.__oto_debug.cvU.px(window.__oto_debug.cursor()));
    await page.mouse.move(boxU.x + lt, boxU.y + 30);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(boxU.x + lt - k * 15, boxU.y + 30);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const ct = await dbg(() => window.__oto_debug.cursor());
    check('t 軸で縦線ドラッグ → 縦線の時刻が戻る', ct < 4.3 - 0.5, ct.toFixed(2));
    check('操作全体で console error 0', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // ---------- 3. 投影モードの操作後スクショ ----------
  {
    const { ctx, page, errors } = await open('proj', 1280, 800);
    await page.evaluate(() => { const d = window.__oto_debug; d.preset('double'); d.toggleGhost(true); document.querySelector('.view.show .timebar button').click(); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'combine-proj-1280-double.png'), fullPage: true });
    check('投影 2倍プリセットで error 0', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
