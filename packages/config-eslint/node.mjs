import globals from 'globals';

export default [
  {
    files: [
      '**/*.config.mjs',
      '**/*.config.ts',
      'apps/*/server.mjs',
      'apps/*/scripts/**/*.{js,mjs,ts}',
      'apps/api/**/*.{js,mjs,ts}',
      'packages/**/*.{js,mjs,ts}',
      'scripts/**/*.{js,mjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
];
