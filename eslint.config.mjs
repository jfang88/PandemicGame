import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', 'coverage/**'] },
  js.configs.recommended,
  { files: ['scripts/*.mjs'], languageOptions: { globals: globals.node } },
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.worker } } },
);
