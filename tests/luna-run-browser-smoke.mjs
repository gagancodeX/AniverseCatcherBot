import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port = 4173;
const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', 'gamezone'], { stdio: 'ignore' });
let browser;
const errors = [];
const checks = [];
const record = (name, detail = '') => {
  checks.push({ name, detail });
  console.log('[PASS]', name, detail);
};

try {
  let serverReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/');
      if (response.ok) { serverReady = true; break; }
    } catch {}
    await delay(250);
  }
  assert.ok(serverReady, 'Local GameZone HTTP server did not start');

  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader'
    ]
  });

  const page = await browser.newPage({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  page.on('pageerror', error => errors.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push('console: ' + message.text());
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (!/fonts\.googleapis|fonts\.gstatic|telegram\.org/.test(url)) {
      errors.push('request failed: ' + url + ' (' + (request.failure()?.errorText || 'unknown') + ')');
    }
  });

  await page.addInitScript(() => {
    window.__lunaDrawCalls = 0;
    window.__lunaGL = null;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      const context = originalGetContext.call(this, type, ...args);
      if ((type === 'webgl' || type === 'experimental-webgl') && context) {
        window.__lunaGL = context;
        if (!context.__lunaCounted) {
          context.__lunaCounted = true;
          const drawArrays = context.drawArrays.bind(context);
          context.drawArrays = (...drawArgs) => {
            window.__lunaDrawCalls++;
            return drawArrays(...drawArgs);
          };
        }
      }
      return context;
    };
  });

  await page.route('https://telegram.org/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: "window.Telegram = { WebApp: { initData: '', expand(){}, requestFullscreen(){}, exitFullscreen(){}, HapticFeedback:{impactOccurred(){}}, BackButton:{show(){},hide(){},onClick(){}} }};"
  }));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());

  await page.goto('http://127.0.0.1:' + port + '/?game=luna_run', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#gameScreen')?.classList.contains('active'), null, { timeout: 10000 });
  await page.waitForFunction(() => window.LunaRun3D && window.LunaRun3D.isReady(), null, { timeout: 15000 });
  await page.waitForTimeout(1500);

  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('.luna-run-3d-canvas');
    const gl = window.__lunaGL;
    return {
      ready: window.LunaRun3D?.isReady(),
      failed: window.LunaRun3D?.hasFailed(),
      canvasFound: !!canvas,
      canvasDisplay: canvas && getComputedStyle(canvas).display,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      gameCanvasWidth: document.querySelector('#gameCanvas')?.width || 0,
      drawCalls: window.__lunaDrawCalls,
      glError: gl ? gl.getError() : -1,
      viewport: gl ? Array.from(gl.getParameter(gl.VIEWPORT)) : null,
      overlayZ: getComputedStyle(document.querySelector('#gameOverlay')).zIndex,
      rendererZ: canvas ? getComputedStyle(canvas).zIndex : null
    };
  });

  assert.equal(renderer.ready, true, 'WebGL renderer did not initialize: ' + JSON.stringify(renderer));
  assert.equal(renderer.failed, false, 'WebGL renderer reported a permanent failure');
  assert.equal(renderer.canvasFound, true, 'Separate WebGL canvas is missing');
  assert.equal(renderer.canvasDisplay, 'block', 'WebGL canvas is not visible in runner');
  assert.ok(renderer.canvasWidth > 0 && renderer.canvasHeight > 0, 'WebGL canvas has zero dimensions');
  assert.ok(renderer.drawCalls > 80, 'Too few WebGL draw calls (' + renderer.drawCalls + ')');
  assert.equal(renderer.glError, 0, 'WebGL error code ' + renderer.glError);
  assert.ok(Number(renderer.overlayZ) > Number(renderer.rendererZ), 'Start/pause overlay is not above the WebGL canvas');
  record('WebGL renderer initialization', JSON.stringify(renderer));

  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.locator('#runnerPauseBtn').click();
  await page.waitForFunction(() => document.querySelector('#runnerPauseBtn')?.textContent.includes('RESUME'));
  record('Pause control');
  await page.locator('#runnerPauseBtn').click();
  await page.waitForFunction(() => document.querySelector('#runnerPauseBtn')?.textContent.includes('PAUSE'));
  record('Resume control');

  for (const selector of ['#runnerHeroBtn', '#runnerLeft', '#runnerRight', '#runnerJump', '#runnerRoll', '#runnerSoundBtn']) {
    const element = page.locator(selector);
    assert.ok(await element.isVisible(), selector + ' is not visible');
    await element.click({ force: true });
  }
  record('Hero, lane, jump, slide and sound controls are clickable');

  await page.waitForTimeout(2500);
  const finalState = await page.evaluate(() => ({
    ready: window.LunaRun3D?.isReady(),
    drawCalls: window.__lunaDrawCalls,
    glError: window.__lunaGL ? window.__lunaGL.getError() : -1,
    canvasDisplay: getComputedStyle(document.querySelector('.luna-run-3d-canvas')).display,
    overlayVisible: !document.querySelector('#gameOverlay').classList.contains('hidden')
  }));
  assert.equal(finalState.ready, true, 'WebGL renderer stopped being ready during gameplay');
  assert.equal(finalState.glError, 0, 'WebGL runtime error code ' + finalState.glError);
  assert.ok(finalState.drawCalls > renderer.drawCalls, 'WebGL render loop stopped drawing');
  assert.equal(finalState.overlayVisible, false, 'Unexpected game-start overlay obscures active play');
  record('Live gameplay render loop', JSON.stringify(finalState));

  await page.screenshot({ path: 'luna-run-browser-smoke.png', fullPage: true });
  await page.locator('#backButton').click();
  await page.waitForFunction(() => !document.querySelector('#gameScreen')?.classList.contains('active'));
  record('Return to GameZone menu');

  assert.deepEqual(errors, [], 'Browser reported errors:\n' + errors.join('\n'));
  console.log('All ' + checks.length + ' Luna Run browser checks passed.');
} catch (error) {
  console.error('LUNA RUN BROWSER TEST FAILED');
  console.error(error?.stack || error);
  if (browser) {
    try {
      const pages = browser.contexts().flatMap(context => context.pages());
      if (pages[0]) await pages[0].screenshot({ path: 'luna-run-browser-smoke-failed.png', fullPage: true });
    } catch {}
  }
  console.error('Captured browser errors:', JSON.stringify(errors));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
