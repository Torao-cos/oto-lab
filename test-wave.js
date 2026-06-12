// 波形切替バグの診断テスト: OscillatorNodeを計測フックで監視
const PW = 'C:/Users/Yasuhiro/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core';
const { chromium } = require(PW);
const http = require('http'); const fs = require('fs');

const html = fs.readFileSync('index.html');
const server = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(html); }).listen(8125);

(async () => {
  const b = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  // AudioContextに計測フック: 生成された全オシレーターと停止履歴を記録
  await p.addInitScript(() => {
    window.__oscs = [];
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const o = orig.call(this);
      const rec = { node: o, stopped: false };
      const origStop = o.stop.bind(o);
      o.stop = (...a) => { rec.stopped = true; return origStop(...a); };
      window.__oscs.push(rec);
      return o;
    };
  });
  await p.goto('http://127.0.0.1:8125/');

  const state = () => p.evaluate(() => window.__oscs.map(r => ({ type: r.node.type, freq: r.node.frequency.value, stopped: r.stopped })));

  // 音源タブでA再生
  await p.click('#tabTone');
  await p.click('#playA');
  await p.waitForTimeout(300);
  console.log('1. A再生直後:', JSON.stringify(await state()));

  // 再生中に波形をsquareへ（toneビューのselect）
  await p.selectOption('#waveA', 'square');
  await p.waitForTimeout(300);
  console.log('2. select(square)後:', JSON.stringify(await state()));

  // 両方ビューに切替えてb_waveAをtriangleへ
  await p.click('#tabBoth');
  await p.selectOption('#b_waveA', 'triangle');
  await p.waitForTimeout(300);
  console.log('3. 両方ビューでselect(triangle)後:', JSON.stringify(await state()));
  console.log('   このときwaveA(非prefix)の値:', await p.inputValue('#waveA'));

  // 全停止で本当に止まるか
  await p.click('#b_stopAll');
  await p.waitForTimeout(300);
  console.log('4. 全停止後:', JSON.stringify(await state()));

  // 再度再生→新oscの波形は？（UIはtriangleのはず）
  await p.click('#b_playA');
  await p.waitForTimeout(300);
  console.log('5. 再再生後:', JSON.stringify(await state()));

  await b.close(); server.close();
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
