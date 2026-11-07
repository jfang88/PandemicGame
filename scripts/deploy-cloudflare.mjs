import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { deploymentSettings } from './deployment-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'apps/web');
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const passThrough = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'CI', 'TERM']);
const tools = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => passThrough.has(key.toUpperCase()))),
  WRANGLER_SEND_METRICS: 'false' };

function run(args, env = tools, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('A build or Wrangler step failed.');
}

function git(args) {
  return execFileSync('git', args, { cwd: root, env: tools, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

async function auditWeb(values) {
  const assets = join(web, 'dist/assets');
  const files = (await readdir(assets)).filter(name => name.endsWith('.js'));
  const code = (await Promise.all(files.map(name => readFile(join(assets, name), 'utf8')))).join('\n');
  if (Object.values(values).some(value => !code.includes(value))) throw new Error('The web build is missing Firebase configuration.');
  if (/firebase-local-popup-fixture|mock-refreshed-token|x-pandemic-test-uid|FIREBASE_AUTH_EMULATOR_HOST|local-fixture|BEGIN PRIVATE KEY|\/auth\/callback\b/.test(code)) {
    throw new Error('The web build contains a forbidden deployment marker.');
  }
}

async function smoke(origin, buildSha) {
  const request = (path, options = {}) => fetch(origin + path,
    { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
  let healthy = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await request('/api/health');
      const health = await response.json();
      if (response.ok && health.ok === true && health.buildSha === buildSha && health.protocolVersion === 1) {
        healthy = true;
        break;
      }
    } catch { /* The reviewed version can take a short time to propagate. */ }
    await delay(1500);
  }
  if (!healthy) throw new Error('The expected deployment did not become healthy.');
  const missing = await request('/api/deployment-smoke-missing');
  if (missing.status !== 404 || (await missing.json()).error?.code !== 'ROOM_NOT_FOUND') {
    throw new Error('The API fallback did not return the expected JSON 404.');
  }
  const room = '/rooms/12a45678-1234-4321-8123-123456789abc';
  const deepLink = await request(room);
  if (!deepLink.ok || !deepLink.headers.get('content-type')?.includes('text/html')
    || !(await deepLink.text()).includes('id="root"')) throw new Error('The SPA deep link did not serve the application.');
  const denied = await request('/api' + room, { headers: { 'x-pandemic-test-uid': 'deployment-smoke-denied' } });
  if (denied.status !== 401 || (await denied.json()).error?.code !== 'UNAUTHENTICATED') {
    throw new Error('The normal Worker did not reject the local test identity.');
  }
  console.log('Public routing, build identity and authentication smoke passed for ' + origin);
}

try {
  const [mode, target, extra] = process.argv.slice(2);
  if (extra !== undefined) throw new Error('Unexpected deployment arguments.');
  const settings = deploymentSettings(mode, target, process.env, git(['rev-parse', 'HEAD']));
  if (mode === 'deploy' && git(['status', '--porcelain', '--untracked-files=normal'])) {
    throw new Error('Live deployment requires a clean reviewed checkout.');
  }
  // This subprocess receives only the four reviewed public web variables and standard process settings.
  run(['--input-type=module', '-e', 'import { build } from "vite"; await build({ envDir: false })'],
    { ...tools, ...settings.web }, web);
  await auditWeb(settings.web);

  const args = [wrangler, 'deploy', '--config', 'wrangler.jsonc', '--env', target, '--var',
    'APP_ORIGINS:' + settings.origin, 'FIREBASE_PROJECT_ID:' + settings.project, 'BUILD_SHA:' + settings.buildSha];
  const output = join('.wrangler', 'deployment-check', target);
  run([...args, '--dry-run', '--outdir', output]);
  run([join(root, 'scripts/check-worker-test-isolation.mjs'), join(root, output, 'index.js')]);
  if (mode === 'deploy') {
    run(args, { ...tools, ...settings.cloudflare });
    await smoke(settings.origin, settings.buildSha);
  } else console.log('Credential-free deployment validation passed for ' + target);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Deployment verification failed.');
  process.exitCode = 1;
}
