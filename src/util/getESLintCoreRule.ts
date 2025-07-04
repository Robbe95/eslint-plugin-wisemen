import { ESLintUtils } from '@typescript-eslint/utils'
import { builtinRules } from 'eslint/use-at-your-own-risk'

interface RuleMap {
  /* eslint-disable @typescript-eslint/consistent-type-imports -- more concise to use inline imports */
  'arrow-parens': typeof import('eslint/lib/rules/arrow-parens')
  'consistent-return': typeof import('eslint/lib/rules/consistent-return')
  'dot-notation': typeof import('eslint/lib/rules/dot-notation')
  'init-declarations': typeof import('eslint/lib/rules/init-declarations')
  'max-params': typeof import('eslint/lib/rules/max-params')
  'no-dupe-args': typeof import('eslint/lib/rules/no-dupe-args')
  'no-dupe-class-members': typeof import('eslint/lib/rules/no-dupe-class-members')
  'no-empty-function': typeof import('eslint/lib/rules/no-empty-function')
  'no-implicit-globals': typeof import('eslint/lib/rules/no-implicit-globals')
  'no-invalid-this': typeof import('eslint/lib/rules/no-invalid-this')
  'no-loop-func': typeof import('eslint/lib/rules/no-loop-func')
  'no-loss-of-precision': typeof import('eslint/lib/rules/no-loss-of-precision')
  'no-magic-numbers': typeof import('eslint/lib/rules/no-magic-numbers')
  'no-restricted-globals': typeof import('eslint/lib/rules/no-restricted-globals')
  'no-restricted-imports': typeof import('eslint/lib/rules/no-restricted-imports')
  'no-undef': typeof import('eslint/lib/rules/no-undef')
  'no-unused-expressions': typeof import('eslint/lib/rules/no-unused-expressions')
  'no-useless-constructor': typeof import('eslint/lib/rules/no-useless-constructor')
  'prefer-const': typeof import('eslint/lib/rules/prefer-const')
  'prefer-destructuring': typeof import('eslint/lib/rules/prefer-destructuring')
  'strict': typeof import('eslint/lib/rules/strict')
  /* eslint-enable @typescript-eslint/consistent-type-imports */
}

type RuleId = keyof RuleMap

export function getESLintCoreRule<R extends RuleId>(ruleId: R): RuleMap[R] {
  return ESLintUtils.nullThrows(
    builtinRules.get(ruleId),
    `ESLint's core rule '${ruleId}' not found.`,
  )
}

export function maybeGetESLintCoreRule<R extends RuleId>(
  ruleId: R,
): RuleMap[R] | null {
  try {
    return getESLintCoreRule<R>(ruleId)
  }
  catch {
    return null
  }
}
