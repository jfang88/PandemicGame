import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const output = await readFile(new URL('../apps/worker/dist/index.js', import.meta.url), 'utf8');
assert.ok(output.includes('FIREBASE_PROJECT_ID'), 'Scan the normal Firebase-authenticated Worker artifact');
assert.ok(!/x-pandemic-test-uid|installBrowserFixture|Local fixture request failed|FIREBASE_AUTH_EMULATOR_HOST/.test(output),
  'Normal Worker must exclude local identities, fixture endpoints and emulator settings');
console.log('PASS: normal Worker artifact excludes the local browser harness');
