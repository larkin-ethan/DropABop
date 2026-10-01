// ESLint flat config for the whole monorepo.
// Uses typescript-eslint's type-aware rules: they catch real bugs such as un-awaited promises,
// which in a Lambda can mean a database write silently never happens.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/.aws-sam/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          // Root-level config files aren't part of any workspace tsconfig.
          allowDefaultProject: ['*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Logging goes through the structured logger (P5.1) so redaction always applies.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Plain JavaScript (config files, hook scripts) isn't in any tsconfig, so skip type-aware rules there.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
