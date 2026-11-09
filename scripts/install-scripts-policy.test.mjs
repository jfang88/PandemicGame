import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingInstallScripts } from './install-scripts-policy.mjs';

test('a fully reviewed install has no pending scripts', () => {
  assert.deepEqual(pendingInstallScripts({ allowScripts: [] }), []);
});

test('an unreviewed install script is reported with its version', () => {
  assert.deepEqual(pendingInstallScripts({ allowScripts: [
    { name: 'esbuild', changes: [{ key: 'esbuild@0.28.2', change: 'pending' }] },
    { name: 'left-pad', changes: [{ key: 'left-pad@1.0.0', change: 'stale' }] },
  ] }), ['esbuild@0.28.2']);
});

test('an unexpected report fails closed', () => {
  for (const report of [null, {}, { allowScripts: {} }]) assert.throws(() => pendingInstallScripts(report));
});
