import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(SCRIPT_DIR, process.env.RUN_LABEL ?? 'pass-07-ollama-safety');
const EXPECTED_MODEL = 'opencode-go/deepseek-v4-flash-vision-exp';

function processSnapshot() {
  const script = [
    "$jarvis = @(Get-CimInstance Win32_Process | Where-Object Name -eq 'jarvis.exe' | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath)",
    "$ollama = @(Get-CimInstance Win32_Process | Where-Object Name -eq 'ollama.exe' | Select-Object Name,ProcessId,ParentProcessId,ExecutablePath,CommandLine)",
    '$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess,State)',
    '[pscustomobject]@{ CapturedAt = (Get-Date -Format o); Jarvis = $jarvis; Ollama = $ollama; Listeners11434 = $listeners } | ConvertTo-Json -Depth 6 -Compress',
  ].join('; ');
  return JSON.parse(
    execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
    }).trim(),
  );
}

function assertSafe(snapshot, label) {
  if (snapshot.Ollama.length > 0 || snapshot.Listeners11434.length > 0) {
    throw new Error(`${label}: Ollama process or listener 11434 is present.`);
  }
}

await mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const context = browser.contexts()[0];
const page = context.pages().find((candidate) => candidate.url().startsWith('http://localhost:5173'));
if (!page) throw new Error('Official native VibeSpace WebView was not found.');
const cdp = await context.newCDPSession(page);

try {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), EXPECTED_MODEL, {
    timeout: 60_000,
  });
  const before = processSnapshot();
  assertSafe(before, 'before disabled bootstrap proof');

  const disableFlag = await page.evaluate(async () => {
    const module = await import('/src/lib/ai/ollamaBootstrap.ts');
    return module.isOllamaBootstrapDisabled();
  });
  if (!disableFlag) throw new Error('Vite fail-closed Ollama bootstrap flag is not active.');

  const directResult = await page.evaluate(async () => {
    const module = await import('/src/lib/ai/ollamaBootstrap.ts');
    return module.bootstrapOllamaConnection({ force: true });
  });
  if (directResult.status?.phase !== 'disabled') {
    throw new Error(`Ollama bootstrap did not fail closed: ${JSON.stringify(directResult)}`);
  }
  assertSafe(processSnapshot(), 'after direct disabled bootstrap proof');

  const ambient = page.getByRole('dialog', { name: /Ambient mode\. Press any key to wake\./u });
  if (await ambient.isVisible()) {
    await page.keyboard.press('Escape');
    await ambient.waitFor({ state: 'hidden', timeout: 15_000 });
  }
  const chooseModel = page.getByRole('button', {
    name: /Choose model|deepseek-v4-flash-vision-exp/iu,
  });
  await chooseModel.waitFor({ state: 'visible', timeout: 30_000 });
  await chooseModel.evaluate((element) => element.click());
  const modelList = page.getByRole('listbox');
  await modelList.waitFor({ state: 'visible', timeout: 30_000 });
  const modelPickerText = await modelList.innerText();
  const pickerResult = await page.evaluate(async () => {
    const module = await import('/src/lib/ai/ollamaBootstrap.ts');
    return module.bootstrapOllamaConnection({ force: true });
  });
  if (pickerResult.status?.phase !== 'disabled') {
    throw new Error(`Model-picker bootstrap did not fail closed: ${JSON.stringify(pickerResult)}`);
  }
  const after = processSnapshot();
  assertSafe(after, 'after model picker');

  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const screenshotPath = resolve(OUTPUT_DIR, 'model-picker-ollama-disabled.png');
  await writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));
  const metadata = await sharp(screenshotPath).metadata();
  await page.keyboard.press('Escape');

  const evidence = {
    schemaVersion: 1,
    head: execFileSync('git', ['-C', resolve(SCRIPT_DIR, '../../..'), 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    exactModel: EXPECTED_MODEL,
    rootCause: {
      trigger: 'Opening Chat ModelPicker runs bootstrapOllamaConnection({ force: true }).',
      rendererPath: [
        'app/src/features/chat/Composer.tsx ModelPicker open effect',
        'app/src/lib/ai/ollamaBootstrap.ts bootstrapOllamaConnection/runBootstrap',
        'app/src/lib/ai/providers/ollama.ts ensureOllamaReadySilent',
      ],
      nativePath: [
        'app/src-tauri/src/local_ai.rs ensure_ollama_ready_internal',
        'app/src-tauri/src/local_ai.rs start_ollama_serve_silent',
      ],
      observedBeforeContainment: {
        jarvisPid: 8480,
        ollamaTreePids: [20904, 19848],
        commandLine: '"ollama" serve',
        listener: { address: '127.0.0.1', port: 11434, ownerPid: 20904 },
        retryAfterOwnedChildTermination: {
          ownerPid: 19848,
          parentPid: 8480,
          parentAlreadyExited: true,
          explanation:
            'The in-flight native ensure path waits, clears a stopped child, then starts one final serve attempt. The app must be stopped or allowed to exit before terminating the retry child.',
        },
      },
    },
    prevention: {
      configuration: 'VITE_DISABLE_OLLAMA_BOOTSTRAP=true',
      productFilesEdited: false,
      isOllamaBootstrapDisabled: disableFlag,
      directBootstrapResult: directResult,
      pickerBootstrapResult: pickerResult,
    },
    modelPicker: {
      textLength: modelPickerText.length,
      exactModelIndex: modelPickerText.indexOf('deepseek-v4-flash-vision-exp'),
      opencodeIndex: modelPickerText.toLowerCase().indexOf('opencode'),
      exactModelPresent: modelPickerText.includes('deepseek-v4-flash-vision-exp'),
      text: modelPickerText,
    },
    before,
    after,
    providerRequestSent: false,
    modelSelectionChanged: false,
    credentialsEntered: false,
    screenshot: {
      name: 'model-picker-ollama-disabled.png',
      width: metadata.width,
      height: metadata.height,
    },
  };
  await writeFile(
    resolve(OUTPUT_DIR, 'ollama-process-port-before-after.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify({ safe: true, jarvisPid: after.Jarvis[0]?.ProcessId, phase: pickerResult.status.phase }));
} finally {
  await page.keyboard.press('Escape').catch(() => undefined);
  await browser.close().catch(() => undefined);
}
