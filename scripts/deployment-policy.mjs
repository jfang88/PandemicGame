const webKeys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
const publicKeys = ['APP_ORIGINS', 'FIREBASE_PROJECT_ID', ...webKeys];
const shaPattern = /^[a-f0-9]{40}$/;
const projectPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

function check(value, pattern, name) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('Invalid deployment setting: ' + name);
  return value;
}

export function deploymentSettings(mode, target, env, checkoutSha) {
  if (!['validate', 'deploy'].includes(mode) || !['preview', 'production'].includes(target)) {
    throw new Error('Select validate or deploy and an explicit preview or production environment.');
  }
  const live = mode === 'deploy';
  const fixtureProject = 'pandemic-check-' + target;
  const fixture = !live && publicKeys.every(key => !env[key]);
  const source = fixture ? {
    APP_ORIGINS: `https://pandemicgame-${target}.deployment-check.workers.dev`,
    FIREBASE_PROJECT_ID: fixtureProject,
    VITE_FIREBASE_PROJECT_ID: fixtureProject,
    VITE_FIREBASE_AUTH_DOMAIN: fixtureProject + '.firebaseapp.com',
    VITE_FIREBASE_API_KEY: 'AIza' + 'a'.repeat(35),
    VITE_FIREBASE_APP_ID: '1:123456789012:web:abcdef0123456789',
  } : env;
  const buildSha = check(live ? env.BUILD_SHA : env.BUILD_SHA || checkoutSha, shaPattern, 'BUILD_SHA');
  if (buildSha !== checkoutSha) throw new Error('BUILD_SHA must match the checked-out commit.');
  if (live && target === 'production' && env.PANDEMIC_PRODUCTION_CONFIRM_SHA !== buildSha) {
    throw new Error('Production requires a matching PANDEMIC_PRODUCTION_CONFIRM_SHA.');
  }
  const project = check(source.FIREBASE_PROJECT_ID, projectPattern, 'FIREBASE_PROJECT_ID');
  if (source.VITE_FIREBASE_PROJECT_ID !== project) throw new Error('The browser and Worker Firebase project IDs must match.');
  if (live) {
    const preview = check(env.PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID, projectPattern, 'PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID');
    const production = target === 'production' || env.PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID
      ? check(env.PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID, projectPattern, 'PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID')
      : undefined;
    if (preview === production || project !== (target === 'preview' ? preview : production)) {
      throw new Error('Use the registered, distinct Firebase project for the selected environment.');
    }
  }
  if (source.VITE_FIREBASE_AUTH_DOMAIN !== project + '.firebaseapp.com') {
    throw new Error('Use the Firebase project Web app default auth domain.');
  }
  check(source.VITE_FIREBASE_API_KEY, /^AIza[A-Za-z0-9_-]{35}$/, 'VITE_FIREBASE_API_KEY');
  check(source.VITE_FIREBASE_APP_ID, /^1:[0-9]{1,20}:web:[a-f0-9]{8,64}$/i, 'VITE_FIREBASE_APP_ID');
  const originPattern = new RegExp('^https://pandemicgame-' + target + '\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.workers\\.dev$');
  const origin = check(source.APP_ORIGINS, originPattern, 'APP_ORIGINS');
  const cloudflare = live ? {
    CLOUDFLARE_ACCOUNT_ID: check(env.CLOUDFLARE_ACCOUNT_ID, /^[a-f0-9]{32}$/i, 'CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: check(env.CLOUDFLARE_API_TOKEN, /^[A-Za-z0-9_-]{20,512}$/, 'CLOUDFLARE_API_TOKEN'),
  } : {};
  return { origin, project, buildSha, cloudflare, web: Object.fromEntries(webKeys.map(key => [key, source[key]])) };
}
