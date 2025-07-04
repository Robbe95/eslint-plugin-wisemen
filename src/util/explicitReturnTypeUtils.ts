import type {
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils'
import {
  AST_NODE_TYPES,
  ASTUtils,
  ESLintUtils,
} from '@typescript-eslint/utils'

import {
  isConstructor,
  isSetter,
  isTypeAssertion,
} from './astUtils'
import { getFunctionHeadLoc } from './getFunctionHeadLoc'

export type FunctionExpression =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
export type FunctionNode = FunctionExpression | TSESTree.FunctionDeclaration

export interface FunctionInfo<T extends FunctionNode> {
  node: T
  returns: TSESTree.ReturnStatement[]
}

/**
 * Checks if a node is a variable declarator with a type annotation.
 * ```
 * const x: Foo = ...
 * ```
 */
function isVariableDeclaratorWithTypeAnnotation(
  node: TSESTree.Node,
): node is TSESTree.VariableDeclarator {
  return (
    node.type === AST_NODE_TYPES.VariableDeclarator && Boolean(node.id.typeAnnotation)
  )
}

/**
 * Checks if a node is a class property with a type annotation.
 * ```
 * public x: Foo = ...
 * ```
 */
function isPropertyDefinitionWithTypeAnnotation(
  node: TSESTree.Node,
): node is TSESTree.PropertyDefinition {
  return (
    node.type === AST_NODE_TYPES.PropertyDefinition && Boolean(node.typeAnnotation)
  )
}

/**
 * Checks if a node belongs to:
 * ```
 * foo(() => 1)
 * ```
 */
function isFunctionArgument(
  parent: TSESTree.Node,
  callee?: FunctionExpression,
): parent is TSESTree.CallExpression {
  return (
    parent.type === AST_NODE_TYPES.CallExpression
    // make sure this isn't an IIFE
    && parent.callee !== callee
  )
}

/**
 * Checks if a node is type-constrained in JSX
 * ```
 * <Foo x={() => {}} />
 * <Bar>{() => {}}</Bar>
 * <Baz {...props} />
 * ```
 */
function isTypedJSX(
  node: TSESTree.Node,
): node is TSESTree.JSXExpressionContainer | TSESTree.JSXSpreadAttribute {
  return (
    node.type === AST_NODE_TYPES.JSXExpressionContainer
    || node.type === AST_NODE_TYPES.JSXSpreadAttribute
  )
}

function isTypedParent(
  parent: TSESTree.Node,
  callee?: FunctionExpression,
): boolean {
  return (
    isTypeAssertion(parent)
    || isVariableDeclaratorWithTypeAnnotation(parent)
    || isDefaultFunctionParameterWithTypeAnnotation(parent)
    || isPropertyDefinitionWithTypeAnnotation(parent)
    || isFunctionArgument(parent, callee)
    || isTypedJSX(parent)
  )
}

function isDefaultFunctionParameterWithTypeAnnotation(
  node: TSESTree.Node,
): boolean {
  return (
    node.type === AST_NODE_TYPES.AssignmentPattern
    && node.left.typeAnnotation != null
  )
}

/**
 * Checks if a node belongs to:
 * ```
 * new Foo(() => {})
 *         ^^^^^^^^
 * ```
 */
function isConstructorArgument(
  node: TSESTree.Node,
): node is TSESTree.NewExpression {
  return node.type === AST_NODE_TYPES.NewExpression
}

/**
 * Checks if a node is a property or a nested property of a typed object:
 * ```
 * const x: Foo = { prop: () => {} }
 * const x = { prop: () => {} } as Foo
 * const x = <Foo>{ prop: () => {} }
 * const x: Foo = { bar: { prop: () => {} } }
 * ```
 */
function isPropertyOfObjectWithType(
  property: TSESTree.Node | undefined,
): boolean {
  if (!property || property.type !== AST_NODE_TYPES.Property) {
    return false
  }
  const objectExpr = property.parent

  if (objectExpr.type !== AST_NODE_TYPES.ObjectExpression) {
    return false
  }

  const parent = objectExpr.parent

  return isTypedParent(parent) || isPropertyOfObjectWithType(parent)
}

/**
 * Checks if a function belongs to:
 * ```
 * () => () => ...
 * () => function () { ... }
 * () => { return () => ... }
 * () => { return function () { ... } }
 * function fn() { return () => ... }
 * function fn() { return function() { ... } }
 * ```
 */
export function doesImmediatelyReturnFunctionExpression({
  node, returns,
}: FunctionInfo<FunctionNode>): boolean {
  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
    && ASTUtils.isFunction(node.body)
  ) {
    return true
  }

  if (returns.length === 0) {
    return false
  }

  return returns.every(
    (node) => node.argument && ASTUtils.isFunction(node.argument),
  )
}

/**
 * Checks if a function belongs to:
 * ```
 * ({ action: 'xxx' } as const)
 * ```
 */
function isConstAssertion(node: TSESTree.Node): boolean {
  if (isTypeAssertion(node)) {
    const {
      typeAnnotation,
    } = node

    if (typeAnnotation.type === AST_NODE_TYPES.TSTypeReference) {
      const {
        typeName,
      } = typeAnnotation

      if (
        typeName.type === AST_NODE_TYPES.Identifier
        && typeName.name === 'const'
      ) {
        return true
      }
    }
  }

  return false
}

interface Options {
  allowDirectConstAssertionInArrowFunctions?: boolean
  allowExpressions?: boolean
  allowHigherOrderFunctions?: boolean
  allowTypedFunctionExpressions?: boolean
}

/**
 * True when the provided function expression is typed.
 */
export function isTypedFunctionExpression(
  node: FunctionExpression,
  options: Options,
): boolean {
  const parent = ESLintUtils.nullThrows(
    node.parent,
    ESLintUtils.NullThrowsReasons.MissingParent,
  )

  if (!options.allowTypedFunctionExpressions) {
    return false
  }

  return (
    isTypedParent(parent, node)
    || isPropertyOfObjectWithType(parent)
    || isConstructorArgument(parent)
  )
}

/**
 * Check whether the function expression return type is either typed or valid
 * with the provided options.
 */
export function isValidFunctionExpressionReturnType(
  node: FunctionExpression,
  options: Options,
): boolean {
  if (isTypedFunctionExpression(node, options)) {
    return true
  }

  const parent = ESLintUtils.nullThrows(
    node.parent,
    ESLintUtils.NullThrowsReasons.MissingParent,
  )

  if (
    options.allowExpressions
    && parent.type !== AST_NODE_TYPES.VariableDeclarator
    && parent.type !== AST_NODE_TYPES.MethodDefinition
    && parent.type !== AST_NODE_TYPES.ExportDefaultDeclaration
    && parent.type !== AST_NODE_TYPES.PropertyDefinition
  ) {
    return true
  }

  // https://github.com/typescript-eslint/typescript-eslint/issues/653
  if (
    !options.allowDirectConstAssertionInArrowFunctions
    || node.type !== AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return false
  }

  let body = node.body

  while (body.type === AST_NODE_TYPES.TSSatisfiesExpression) {
    body = body.expression
  }

  return isConstAssertion(body)
}

/**
 * Check that the function expression or declaration is valid.
 */
function isValidFunctionReturnType(
  {
    node, returns,
  }: FunctionInfo<FunctionNode>,
  options: Options,
): boolean {
  if (
    options.allowHigherOrderFunctions
    && doesImmediatelyReturnFunctionExpression({
      node,
      returns,
    })
  ) {
    return true
  }

  return (
    node.returnType != null
    || isConstructor(node.parent)
    || isSetter(node.parent)
  )
}

/**
 * Checks if a function declaration/expression has a return type.
 */
export function checkFunctionReturnType(
  {
    node, returns,
  }: FunctionInfo<FunctionNode>,
  options: Options,
  sourceCode: TSESLint.SourceCode,
  report: (loc: TSESTree.SourceLocation) => void,
): void {
  if (isValidFunctionReturnType({
    node,
    returns,
  }, options)) {
    return
  }

  report(getFunctionHeadLoc(node, sourceCode))
}

/**
 * Checks if a function declaration/expression has a return type.
 */
export function checkFunctionExpressionReturnType(
  info: FunctionInfo<FunctionExpression>,
  options: Options,
  sourceCode: TSESLint.SourceCode,
  report: (loc: TSESTree.SourceLocation) => void,
): void {
  if (isValidFunctionExpressionReturnType(info.node, options)) {
    return
  }

  checkFunctionReturnType(info, options, sourceCode, report)
}

/**
 * Check whether any ancestor of the provided function has a valid return type.
 */
export function ancestorHasReturnType(node: FunctionNode): boolean {
  let ancestor: TSESTree.Node | undefined = node.parent

  if (ancestor.type === AST_NODE_TYPES.Property) {
    ancestor = ancestor.value
  }

  // if the ancestor is not a return, then this function was not returned at all, so we can exit early
  const isReturnStatement = ancestor.type === AST_NODE_TYPES.ReturnStatement
  const isBodylessArrow
    = ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression
      && ancestor.body.type !== AST_NODE_TYPES.BlockStatement

  if (!isReturnStatement && !isBodylessArrow) {
    return false
  }

  while (ancestor) {
    switch (ancestor.type) {
      case AST_NODE_TYPES.ArrowFunctionExpression:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.FunctionDeclaration:
        if (ancestor.returnType) {
          return true
        }
        break

      // const x: Foo = () => {};
      // Assume that a typed variable types the function expression
      case AST_NODE_TYPES.VariableDeclarator:
        return Boolean(ancestor.id.typeAnnotation)

      case AST_NODE_TYPES.PropertyDefinition:
        return Boolean(ancestor.typeAnnotation)
      case AST_NODE_TYPES.ExpressionStatement:
        return false
    }

    ancestor = ancestor.parent
  }

  return false
}
