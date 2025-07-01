import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs}'],
        },
      ],
    },
    overrides: [
      {
        files: ['*.spec.ts', '*.test.ts'],
        rules: {
          '@nx/enforce-module-boundaries': 'off',
        },
      },
    ],
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
