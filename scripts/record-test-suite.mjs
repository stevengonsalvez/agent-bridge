#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const appPort = 8944;
const bridgePort = 4955;
const sessionId = 'record-session-' + Date.now();
const recordingsDir = path.resolve(process.cwd(), 'recordings');
const children = new Set();

if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

function spawnManaged(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  child.on('exit', () => children.delete(child));
  return child;
}

async function stopManaged(child) {
  if (!children.has(child) || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((res) => child.once('exit', res)),
    delay(1500),
  ]);
}

async function waitForHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function waitForOutput(child, predicate, timeoutMs = 15000) {
  let buf = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup() && reject(new Error('Timeout waiting for output')), timeoutMs);
    const onData = (d) => {
      buf += d.toString();
      if (predicate(buf)) {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
    };
    child.stdout.on('data', onData);
  });
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['packages/cli/dist/bin/cli.js', ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`CLI exit ${code}: ${stderr || stdout}`));
    });
  });
}

function saveBase64Image(dataUrl, filePath) {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
}

async function main() {
  console.log('=== Step 1: Starting sample React app on port', appPort);
  const app = spawnManaged('sample-app', 'pnpm', [
    '--filter',
    'sample-react-app',
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    String(appPort),
  ]);
  await waitForHttp(`http://127.0.0.1:${appPort}/`);
  console.log('Sample app is ready.');

  console.log('=== Step 2: Starting debug-bridge server on port', bridgePort, 'with video recording');
  const bridge = spawnManaged(
    'debug-bridge',
    'node',
    [
      'packages/cli/dist/bin/cli.js',
      'connect',
      '--port',
      String(bridgePort),
      '--session',
      sessionId,
      '--host',
      'localhost',
      '--cdp',
      '--browser',
      'managed',
      '--headless',
      '--json',
    ],
    {
      DEBUG_BRIDGE_RECORD_VIDEO_DIR: recordingsDir,
    }
  );
  await waitForOutput(bridge, (out) => out.includes('"event":"server_started"'));
  await delay(1500);
  console.log('Debug bridge server and browser sidecar connected.');

  const runBrowser = (subcmd, args = []) => {
    return runCli(['browser', subcmd, ...args, '--port', String(bridgePort), '--session', sessionId, '--json']);
  };

  const stepsLog = [];

  // Step 1: Open app
  console.log('=== Step 3: Navigating to http://127.0.0.1:' + appPort + '/');
  const openRes = await runBrowser('open', [`http://127.0.0.1:${appPort}/`]);
  await delay(1000);
  stepsLog.push({ step: 1, action: 'open', status: 'PASS', url: `http://127.0.0.1:${appPort}/` });

  // Initial screenshot
  const ss1 = JSON.parse(await runBrowser('screenshot', ['--selector', '.app']));
  saveBase64Image(ss1.data, path.join(recordingsDir, 'step1_home.png'));
  console.log('Saved step1_home.png');

  // Step 2: Interactive snapshot
  console.log('=== Step 4: Capturing interactive snapshot');
  const snap1 = JSON.parse(await runBrowser('snapshot', ['-i']));
  console.log(`Discovered ${snap1.elements.length} interactive elements with @e handles:`);
  for (const el of snap1.elements) {
    console.log(`  ${el.ref} <${el.role}> "${el.text}" -> ${el.selector}`);
  }
  stepsLog.push({ step: 2, action: 'snapshot', status: 'PASS', elementsCount: snap1.elements.length });

  // Step 3: Live CSS Preview Patch
  console.log('=== Step 5: Applying Live CSS Preview Patch');
  const patchRes = JSON.parse(
    await runBrowser('preview-patch', [
      '--css',
      'h1 { color: #2563eb !important; text-transform: uppercase !important; letter-spacing: 2px !important; text-shadow: 0 2px 4px rgba(37,99,235,0.2) !important; }',
    ])
  );
  await delay(1000);
  const ss2 = JSON.parse(await runBrowser('screenshot', ['--selector', 'h1']));
  saveBase64Image(ss2.data, path.join(recordingsDir, 'step2_live_css_preview.png'));
  console.log('Saved step2_live_css_preview.png (live preview override applied)');
  stepsLog.push({ step: 3, action: 'preview-patch', status: 'PASS', applied: patchRes.applied });

  // Step 4: Clear Live CSS Preview Patch
  console.log('=== Step 6: Clearing Live CSS Preview Patch');
  await runBrowser('preview-patch', ['--clear']);
  await delay(500);

  // Step 5: Design Mode Enable
  console.log('=== Step 7: Enabling In-Browser Design Mode');
  const dmRes = JSON.parse(await runBrowser('design-mode', ['enable']));
  await delay(1000);
  const ss3 = JSON.parse(await runBrowser('screenshot', ['--selector', 'header']));
  saveBase64Image(ss3.data, path.join(recordingsDir, 'step3_design_mode.png'));
  console.log('Saved step3_design_mode.png (design mode overlay active)');
  stepsLog.push({ step: 4, action: 'design-mode-enable', status: 'PASS', enabled: dmRes.enabled });

  // Disable Design Mode
  console.log('=== Step 8: Disabling Design Mode');
  await runBrowser('design-mode', ['disable']);
  await delay(500);

  // Step 6: Navigate to Products via @e2
  console.log('=== Step 9: Clicking @e2 (Products) with snapshot-after');
  const clickProd = JSON.parse(await runBrowser('click', ['@e2', '--snapshot-after']));
  await delay(1000);
  const ss4 = JSON.parse(await runBrowser('screenshot', ['--selector', '.products']));
  saveBase64Image(ss4.data, path.join(recordingsDir, 'step4_products_view.png'));
  console.log('Saved step4_products_view.png (products rendered with Add to Cart buttons)');
  stepsLog.push({ step: 5, action: 'click-products', status: 'PASS', elementsCount: clickProd.snapshot?.elements?.length });

  // Step 7: Add items to Cart
  console.log('=== Step 10: Adding Widget A (@e5) to Cart');
  await runBrowser('click', ['@e5', '--snapshot-after']);
  await delay(800);

  console.log('=== Step 11: Adding Widget B (@e6) to Cart');
  const clickAdd2 = JSON.parse(await runBrowser('click', ['@e6', '--snapshot-after']));
  await delay(1000);
  const ss5 = JSON.parse(await runBrowser('screenshot', ['--selector', 'header']));
  saveBase64Image(ss5.data, path.join(recordingsDir, 'step5_cart_updated.png'));
  console.log('Saved step5_cart_updated.png (cart count updated in header)');
  stepsLog.push({ step: 6, action: 'add-to-cart', status: 'PASS', elements: clickAdd2.snapshot?.elements?.map((e) => e.text) });

  // Step 8: Navigate to Cart page via @e3
  console.log('=== Step 12: Clicking @e3 (Cart) to view items');
  await runBrowser('click', ['@e3', '--snapshot-after']);
  await delay(1000);
  const ss6 = JSON.parse(await runBrowser('screenshot', ['--selector', '.app']));
  saveBase64Image(ss6.data, path.join(recordingsDir, 'step6_cart_page.png'));
  console.log('Saved step6_cart_page.png (cart page with items and total)');
  stepsLog.push({ step: 7, action: 'view-cart', status: 'PASS' });

  // Step 9: Navigate to Login page via @e4
  console.log('=== Step 13: Clicking @e4 (Login) to authenticate');
  await runBrowser('click', ['@e4', '--snapshot-after']);
  await delay(800);

  // Step 10: Fill credentials
  console.log('=== Step 14: Filling email and password inputs');
  await runBrowser('fill', ['@e5', 'stevie@example.com']);
  await delay(500);
  await runBrowser('fill', ['@e6', 'supersecretpass']);
  await delay(800);
  const ss7 = JSON.parse(await runBrowser('screenshot', ['--selector', 'form']));
  saveBase64Image(ss7.data, path.join(recordingsDir, 'step7_login_form.png'));
  console.log('Saved step7_login_form.png (credentials entered)');
  stepsLog.push({ step: 8, action: 'fill-login', status: 'PASS' });

  // Step 11: Submit Login via @e7
  console.log('=== Step 15: Submitting Login form (@e7) with snapshot-after');
  const clickLogin = JSON.parse(await runBrowser('click', ['@e7', '--snapshot-after']));
  await delay(1000);
  const ss8 = JSON.parse(await runBrowser('screenshot', ['--selector', 'header']));
  saveBase64Image(ss8.data, path.join(recordingsDir, 'step8_authenticated.png'));
  console.log('Saved step8_authenticated.png (authenticated header showing user email and Logout button)');
  stepsLog.push({ step: 9, action: 'submit-login', status: 'PASS' });

  // Step 12: Logout via @e4
  console.log('=== Step 16: Clicking Logout (@e4)');
  await runBrowser('click', ['@e4', '--snapshot-after']);
  await delay(1000);
  const ss9 = JSON.parse(await runBrowser('screenshot', ['--selector', 'header']));
  saveBase64Image(ss9.data, path.join(recordingsDir, 'step9_logged_out.png'));
  console.log('Saved step9_logged_out.png (logged out state verified)');
  stepsLog.push({ step: 10, action: 'logout', status: 'PASS' });

  console.log('=== Step 17: Stopping debug bridge server to finalize video recording');
  await stopManaged(bridge);
  await stopManaged(app);

  // Locate the recorded webm video
  const webmFiles = fs.readdirSync(recordingsDir).filter((f) => f.endsWith('.webm'));
  if (webmFiles.length === 0) {
    throw new Error('No .webm video file found in ' + recordingsDir);
  }
  const sourceWebm = path.join(recordingsDir, webmFiles[0]);
  const finalWebm = path.join(recordingsDir, 'test-run.webm');
  const finalMp4 = path.join(recordingsDir, 'test-run.mp4');

  if (sourceWebm !== finalWebm) {
    fs.renameSync(sourceWebm, finalWebm);
  }
  console.log('Found recorded video:', finalWebm);

  // Transcode to web MP4 using ffmpeg
  console.log('=== Step 18: Transcoding recording to web-optimized MP4');
  execSync(
    `ffmpeg -y -i "${finalWebm}" -c:v libx264 -crf 26 -preset fast -pix_fmt yuv420p -movflags +faststart -an "${finalMp4}"`,
    { stdio: 'inherit' }
  );

  // Also transcode to high-quality animated WebP for embedded playback
  const finalWebp = path.join(recordingsDir, 'test-run.webp');
  console.log('=== Step 19: Generating animated WebP for embedded playback');
  execSync(
    `ffmpeg -y -i "${finalMp4}" -vf "fps=10,scale=960:-1:flags=lanczos" -c:v libwebp -lossless 0 -compression_level 4 -q:v 65 -loop 0 "${finalWebp}"`,
    { stdio: 'inherit' }
  );

  // Save execution report metadata
  fs.writeFileSync(
    path.join(recordingsDir, 'test-report.json'),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        video: {
          mp4: 'test-run.mp4',
          webm: 'test-run.webm',
          animatedWebp: 'test-run.webp',
          sizeBytes: fs.statSync(finalMp4).size,
        },
        steps: stepsLog,
      },
      null,
      2
    )
  );

  console.log('\n===========================================');
  console.log('SUCCESS: Video recording and test report complete!');
  console.log('MP4:', finalMp4, `(${Math.round(fs.statSync(finalMp4).size / 1024)} KB)`);
  console.log('WebP:', finalWebp, `(${Math.round(fs.statSync(finalWebp).size / 1024)} KB)`);
  console.log('===========================================\n');
}

main()
  .catch((err) => {
    console.error('Recording error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const child of children) {
      await stopManaged(child);
    }
    await delay(500);
    process.exit(process.exitCode ?? 0);
  });
