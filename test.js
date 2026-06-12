// おとラボ 自動検証（フェイクマイク付きChromium）
// 実行: node test.js
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8123;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  // 静的サーバー（index.htmlのみ）
  const html = fs.readFileSync(path.join(__dirname, 'index.html'));
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }).listen(PORT);

  fs.mkdirSync(path.join(__dirname, 'test-results'), { recursive: true });
  const shot = (page, name) => page.screenshot({ path: path.join(__dirname, 'test-results', name) });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.grantPermissions(['microphone'], { origin: `http://127.0.0.1:${PORT}` });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // 1. 初期表示
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(800);
  check('初期表示でJSエラーなし', errors.length === 0, errors.join(' | '));
  check('タブ3つ表示', await page.locator('.tabs button').count() === 3);
  await shot(page, '01-scope-initial.png');

  // 2. 音源タブ: A再生 → B再生 → うなり表示
  await page.click('#tabTone');
  await page.click('#playA');
  await page.waitForTimeout(400);
  check('音源A再生でボタンが停止表示', (await page.textContent('#playA')).includes('停止'));
  await page.click('#playB');
  await page.waitForTimeout(400);
  const beat = await page.textContent('#beatText');
  check('うなり表示 4Hz', beat.includes('4') && beat.includes('Hz'), beat);
  await shot(page, '02-tone-beat.png');

  // 3. 全停止
  await page.click('#stopAll');
  await page.waitForTimeout(300);
  check('全停止でAが再生表示に戻る', (await page.textContent('#playA')).includes('再生'));
  check('全停止でBが再生表示に戻る', (await page.textContent('#playB')).includes('再生'));

  // 4. 両方モード: マイク開始（フェイクデバイス）
  await page.click('#tabBoth');
  await page.click('#b_micBtn');
  await page.waitForTimeout(2000);
  const micBtnText = await page.textContent('#b_micBtn');
  check('マイク開始成功（ボタン表示変化）', micBtnText.includes('動作中'), micBtnText);
  const hz = await page.textContent('#b_hzText');
  check('周波数表示が描画されている', /Hz/.test(hz), hz);
  await shot(page, '03-both-mic.png');

  // 5. FFT表示
  await page.check('#b_fftChk');
  await page.waitForTimeout(600);
  check('FFT表示ON後もエラーなし', errors.length === 0, errors.join(' | '));
  await shot(page, '04-fft.png');

  // 6. 凍結トグル
  await page.click('#b_scopeCanvas');
  await page.waitForTimeout(300);
  const status = await page.textContent('#b_statusText');
  check('タップで凍結表示', status.includes('停止中'), status);
  await page.click('#b_scopeCanvas');
  await page.waitForTimeout(300);
  const statusHidden = await page.getAttribute('#b_statusText', 'hidden');
  check('再タップで凍結解除', statusHidden !== null || (await page.textContent('#b_statusText')) === '');

  // 7. ズームボタン
  const scaleBefore = await page.textContent('#b_scaleText');
  await page.click('#b_timePlus');
  await page.waitForTimeout(300);
  const scaleAfter = await page.textContent('#b_scaleText');
  check('時間＋でms/div変化', scaleBefore !== scaleAfter, `${scaleBefore} -> ${scaleAfter}`);

  // 8. オシレーター周波数のステッパー
  await page.click('#b_upA');
  const fA = await page.inputValue('#b_freqA');
  check('▲ステッパーで441', fA === '441', fA);

  // 9. 最終エラー確認
  check('全操作後もJSエラーなし', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(2); });
