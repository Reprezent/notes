const { defineConfig } = require('eslint/config');
const { fixupConfigRules } = require('@eslint/compat');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...fixupConfigRules(expoConfig),
  {
    ignores: ['dist/*', 'modules/expo-local-vectorizer/artifacts/**'],
  },
  {
    rules: {
      'react/display-name': 'off',
    },
  },
]);
