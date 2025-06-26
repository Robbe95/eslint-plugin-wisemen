import eslintVueConfig from '@wisemen/eslint-config-vue'

export default [
  {
    ignores: [
      '**/rules/src/configs/**/*',
      '**/rules/src/util/**/*',
      '**/rules/tools/**/*',

      '**/rules/src/index.ts',
      '**/utils/src/**/*',
      '**/utils/tests/**/*',

    ],
  },

  ...(await eslintVueConfig),
  {
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  },
]
