import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './apps/worker/wrangler.local-test.jsonc' } })],
  test: { include: ['tests/integration/**/*.test.ts'] },
});
