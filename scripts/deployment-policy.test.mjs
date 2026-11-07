import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { deploymentSettings } from './deployment-policy.mjs';

const sha = 'b'.repeat(40);
const valid = {
  BUILD_SHA: sha,
  PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID: 'pandemic-preview-example',
  APP_ORIGINS: 'https://pandemicgame-preview.example.workers.dev',
  FIREBASE_PROJECT_ID: 'pandemic-preview-example',
  VITE_FIREBASE_PROJECT_ID: 'pandemic-preview-example',
  VITE_FIREBASE_AUTH_DOMAIN: 'pandemic-preview-example.firebaseapp.com',
  VITE_FIREBASE_APP_ID: '1:1234:web:abcdef0123456789',
  VITE_FIREBASE_API_KEY: 'AIza' + 'a'.repeat(35),
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'test-token-for-policy-only',
};

test('dry runs use different fixtures and discard credentials', () => {
  const preview = deploymentSettings('validate', 'preview', { CLOUDFLARE_API_TOKEN: 'ignored' }, sha);
  const production = deploymentSettings('validate', 'production', {}, sha);
  assert.notEqual(preview.project, production.project);
  assert.notEqual(preview.origin, production.origin);
  assert.deepEqual(preview.cloudflare, {});
  assert.throws(() => deploymentSettings('validate', 'preview', { APP_ORIGINS: valid.APP_ORIGINS }, sha), /FIREBASE_PROJECT_ID/);
});

test('deployment requires matching checkout and Firebase settings', () => {
  assert.equal(deploymentSettings('deploy', 'preview', valid, sha).origin, valid.APP_ORIGINS);
  assert.throws(() => deploymentSettings('deploy', 'preview', valid, 'a'.repeat(40)), /checked-out commit/);
  assert.throws(() => deploymentSettings('deploy', 'preview',
    { ...valid, VITE_FIREBASE_PROJECT_ID: 'different-project' }, sha), /must match/);
  assert.throws(() => deploymentSettings('deploy', 'preview', { ...valid, CLOUDFLARE_API_TOKEN: '' }, sha), /API_TOKEN/);
});

test('production requires a matching SHA and an exact environment hostname', () => {
  const project = 'pandemic-production-example';
  const settings = { ...valid, APP_ORIGINS: 'https://pandemicgame-production.example.workers.dev',
    FIREBASE_PROJECT_ID: project, VITE_FIREBASE_PROJECT_ID: project, VITE_FIREBASE_AUTH_DOMAIN: project + '.firebaseapp.com',
    PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID: project };

  assert.throws(() => deploymentSettings('deploy', 'production', settings, sha), /CONFIRM_SHA/);
  const confirmed = { ...settings, PANDEMIC_PRODUCTION_CONFIRM_SHA: sha };
  assert.equal(deploymentSettings('deploy', 'production', confirmed, sha).origin, settings.APP_ORIGINS);
  for (const origin of [valid.APP_ORIGINS, settings.APP_ORIGINS + '/', settings.APP_ORIGINS + '.example.net',
    'https://pandemicgame-productionXexampleXworkersXdev']) {
    assert.throws(() => deploymentSettings('deploy', 'production', { ...confirmed, APP_ORIGINS: origin }, sha), /APP_ORIGINS/);
  }
  assert.throws(() => deploymentSettings('publish', 'production', confirmed, sha), /explicit/);
});

test('live targets use their registered Firebase projects and reject a shared project', () => {
  assert.throws(() => deploymentSettings('deploy', 'preview', {
    ...valid, PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID: valid.FIREBASE_PROJECT_ID,
  }, sha), /distinct Firebase project/);
  assert.throws(() => deploymentSettings('deploy', 'preview', {
    ...valid, PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID: 'different-preview-project',
  }, sha), /distinct Firebase project/);
});

test('the credential-bearing job rechecks the triggering actor on failed-job reruns', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-cloudflare.yml', import.meta.url), 'utf8');
  const job = workflow.split('  deploy:')[1]?.split('    environment:')[0] ?? '';
  assert.match(job, /if:.*github\.actor_id.*github\.triggering_actor.*inputs\.release_sha/s);
});
