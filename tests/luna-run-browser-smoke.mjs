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
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({status:200,contentType:'font/woff2',body:''}));

  await page.goto('http://127.0.0.1:' + port + '/?game=luna_run', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#gameScreen')?.classList.contains('active'), null, { timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.LunaRun3D && window.LunaRun3D.isReady(), null, { timeout: 15000 });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const renderer=window.LunaRun3D;
    const original=renderer.render.bind(renderer);
    renderer.render=(state)=>{
      window.__lastLunaRunState={
        lane:state.lane,targetLane:state.targetLane,jump:state.jump,slide:state.slide,mode:state.mode,
        stage:state.stage,speed:state.speed,obstacles:state.obstacles.length,pickups:state.pickups.length
      };
      return original(state);
    };
  });

  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('.luna-run-3d-canvas');
    const gl = window.__lunaGL;
    const controls=document.querySelector('#runnerControls');
    return {
      ready: window.LunaRun3D?.isReady(),
      failed: window.LunaRun3D?.hasFailed(),
      canvasFound: !!canvas,
      canvasDisplay: canvas && getComputedStyle(canvas).display,
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      drawCalls: window.__lunaDrawCalls,
      glError: gl ? gl.getError() : -1,
      viewport: gl ? Array.from(gl.getParameter(gl.VIEWPORT)) : null,
      overlayZ: getComputedStyle(document.querySelector('#gameOverlay')).zIndex,
      rendererZ: canvas ? getComputedStyle(canvas).zIndex : null,
      controlDeckHiddenByDesign: controls && getComputedStyle(controls).display === 'none',
      runnerState: window.__lastLunaRunState
    };
  });

  assert.equal(renderer.ready, true, 'WebGL renderer did not initialize: ' + JSON.stringify(renderer));
  assert.equal(renderer.failed, false, 'WebGL renderer reported a permanent failure');
  assert.equal(renderer.canvasFound, true, 'Separate WebGL canvas is missing');
  assert.equal(renderer.canvasDisplay, 'block', 'WebGL canvas is not visible in runner');
  assert.ok(renderer.canvasWidth > 0 && renderer.canvasHeight > 0, 'WebGL canvas has zero dimensions');
  assert.ok(renderer.drawCalls > 20, 'Too few WebGL draw calls (' + renderer.drawCalls + ')');
  assert.equal(renderer.glError, 0, 'WebGL error code ' + renderer.glError);
  assert.ok(Number(renderer.overlayZ) > Number(renderer.rendererZ), 'Start/pause overlay is not above the WebGL canvas');
  assert.equal(renderer.controlDeckHiddenByDesign, true, 'Swipe-first runner layout unexpectedly shows the old button deck');
  record('WebGL renderer initialization and fullscreen layout', JSON.stringify(renderer));

  const gameCanvas = page.locator('#gameCanvas');
  const bounds = await gameCanvas.boundingBox();
  assert.ok(bounds && bounds.width > 200 && bounds.height > 300, 'Runner playfield is too small');
  const swipe = async (dx,dy) => {
    const x=bounds.x+bounds.width*.5,y=bounds.y+bounds.height*.62;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x+dx,y+dy,{steps:6});
    await page.mouse.up();
  };

  await swipe(-90,0);
  await page.waitForFunction(() => window.__lastLunaRunState?.targetLane === 0, null, {timeout:3000});
  record('Swipe left changes to left lane');
  await swipe(90,0);
  await page.waitForFunction(() => window.__lastLunaRunState?.targetLane === 1, null, {timeout:3000});
  record('Swipe right changes to center lane');

  await swipe(0,-100);
  await page.waitForFunction(() => window.__lastLunaRunState?.jump > 1, null, {timeout:3000});
  record('Swipe up triggers jump');
  await page.waitForFunction(() => window.__lastLunaRunState?.jump <= 0, null, {timeout:3000});
  await swipe(0,100);
  await page.waitForFunction(() => window.__lastLunaRunState?.slide > 0, null, {timeout:3000});
  record('Swipe down triggers slide');

  const tapAtCanvasCenter = async () => {
    const box=await gameCanvas.boundingBox();
    await page.mouse.click(box.x+box.width*.5,box.y+box.height*.72);
  };
  await tapAtCanvasCenter();
  await page.waitForFunction(() => window.__lastLunaRunState?.mode === 'paused', null, {timeout:3000});
  record('Tap pauses the run');
  await tapAtCanvasCenter();
  await page.waitForFunction(() => window.__lastLunaRunState?.mode === 'run', null, {timeout:3000});
  record('Tap resumes the run');

  await page.waitForTimeout(700);
  const finalState = await page.evaluate(() => ({
    ready: window.LunaRun3D?.isReady(),
    drawCalls: window.__lunaDrawCalls,
    glError: window.__lunaGL ? window.__lunaGL.getError() : -1,
    state: window.__lastLunaRunState,
    overlayVisible: !document.querySelector('#gameOverlay').classList.contains('hidden')
  }));
  assert.equal(finalState.ready, true, 'WebGL renderer stopped being ready during gameplay');
  assert.equal(finalState.glError, 0, 'WebGL runtime error code ' + finalState.glError);
  assert.ok(finalState.drawCalls > renderer.drawCalls, 'WebGL render loop stopped drawing');
  assert.equal(finalState.overlayVisible, false, 'Unexpected game-start overlay obscures active play');
  record('Live gameplay render loop', JSON.stringify(finalState));
  await page.screenshot({ path: 'luna-run-browser-smoke.png', fullPage: false });
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
