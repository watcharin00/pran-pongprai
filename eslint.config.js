import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'reference'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // core/ must stay engine-free so it can run on a server and in unit tests.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['phaser', 'phaser/*'], message: 'core/ must not depend on Phaser.' }] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
);
