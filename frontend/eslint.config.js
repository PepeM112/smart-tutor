import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettierConfig from 'eslint-config-prettier';
import checkFile from 'eslint-plugin-check-file';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'src/client/**',
      'app/(app)/components-ideas/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
      prettier: prettierPlugin,
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./tsconfig.eslint.json'],
        },
        node: true,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'prettier/prettier': 'off',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // TS — type-aware checks
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error', // catches forgotten await on async calls
      '@typescript-eslint/no-misused-promises': [
        'warn',
        {
          // catches async fn where sync expected (e.g. onClick)
          checksVoidReturn: {
            attributes: false, // ← this disables it for JSX props like onSubmit, onClick, etc.
          },
        },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }], // enforces `import type { X }`
      'no-unused-vars': 'off', // Turned off because @typescript-eslint/no-unused-vars is used
      'no-undef': 'off', // TS already handles this

      // React
      'react/self-closing-comp': 'warn',
      'react/jsx-boolean-value': ['warn', 'never'], // disabled instead of disabled={true}
      'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }], // no unnecessary braces

      // Import
      'import/no-unresolved': 'error',
      'import/named': 'error',
      'import/default': 'error',
      'import/namespace': 'error',
      'import/no-cycle': 'off',
      'import/no-self-import': 'error',
      'import/no-duplicates': 'warn', // merges duplicate imports from same module
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'jsx-a11y/anchor-is-valid': 'warn',
    },
  },
  {
    files: ['**/layout.tsx', '**/page.tsx', '**/loading.tsx', '**/error.tsx', '**/not-found.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Disable type-checked rules for JS config files (no tsconfig coverage)
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettierConfig,

  // ST-55: enforce PascalCase (components) / camelCase (logic) file naming
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: [
      'src/client/**',
      'src/components/ui/**',
      'app/(app)/components-ideas/**',
      'app/**/{page,layout,loading,error,not-found,template,default,global-error,forbidden,unauthorized,route}.{ts,tsx}',
      'src/features/assist/hooks/useAssist.test.tsx',
    ],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.tsx': 'PASCAL_CASE', '**/*.ts': 'CAMEL_CASE' },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
]);
