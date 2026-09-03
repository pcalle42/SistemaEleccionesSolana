import globals from 'globals';

export default [
  {
    files: ['apps/admin-web/**/*.{js,jsx,ts,tsx}', 'apps/voter-web/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
];
