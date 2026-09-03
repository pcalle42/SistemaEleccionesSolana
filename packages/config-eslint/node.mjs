import globals from 'globals';

export default [
  {
    files: [
      '**/*.config.mjs',
      '**/*.config.ts',
      'apps/api/**/*.{js,mjs,ts}',
      'packages/**/*.{js,mjs,ts}',
      'scripts/**/*.{js,mjs,ts}',
      'zk/**/*.{js,mjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
];
