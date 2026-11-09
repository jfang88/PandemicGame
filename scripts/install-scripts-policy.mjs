import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Install scripts that package.json allowScripts neither approves nor denies, from `npm install-scripts ls --json`. */
export function pendingInstallScripts(report) {
  if (!report || !Array.isArray(report.allowScripts)) throw new Error('Unexpected npm install-scripts report.');
  return report.allowScripts.flatMap(({ name, changes }) => (Array.isArray(changes) ? changes : [])
    .filter(({ change }) => change === 'pending').map(({ key }) => key ?? name));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const npm = process.env.npm_execpath;
  let report;
  try {
    if (!npm) throw new Error('Run this check through npm.');
    report = JSON.parse(execFileSync(process.execPath, [npm, 'install-scripts', 'ls', '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
  } catch {
    console.error('npm install-scripts is unavailable. Use the npm release named in packageManager.');
    process.exit(1);
  }
  const pending = pendingInstallScripts(report);
  if (pending.length > 0) {
    console.error('Review these install scripts, then record a decision with `npm install-scripts approve` or `deny`: '
      + pending.join(', '));
    process.exitCode = 1;
  } else console.log('PASS: every dependency install script is explicitly approved or denied');
}
