import type {
  TSESLint,
  TSESTree,
} from '@typescript-eslint/utils'
import {
  AST_NODE_TYPES,
  ASTUtils,
  ESLintUtils,
} from '@typescript-eslint/utils'

interface WrappingFixerParams {
  /**
   * Descendant of `node` we want to preserve.
   * Use this to replace some code with another.
   * By default it's the node we are modifying (so nothing is removed).
   * You can pass multiple nodes as an array.
   */
  innerNode?: TSESTree.Node | TSESTree.Node[]
  /** The node we want to modify. */
  node: TSESTree.Node
  /** Source code. */
  sourceCode: Readonly<TSESLint.SourceCode>
  /**
   * The function which gets the code of the `innerNode` and returns some code around it.
   * Receives multiple arguments if there are multiple innerNodes.
   * E.g. ``code => `${code} != null` ``
   */
  wrap?: (...code: string[]) => string
}

/**
 * Wraps node with some code. Adds parentheses as necessary.
 * @returns Fixer which adds the specified code and parens if necessary.
 */
export function getWrappingFixer(
  params: WrappingFixerParams,
): (fixer: TSESLint.RuleFixer) => TSESLint.RuleFix {
  const {
    node,
    innerNode = node,
    sourceCode,
    wrap,
  } = params
  const innerNodes = Array.isArray(innerNode)
    ? innerNode
    : [
        innerNode,
      ]

  return (fixer): TSESLint.RuleFix => {
    const innerCodes = innerNodes.map((innerNode) => {
      let code = sourceCode.getText(innerNode)

      /**
       * Wrap our node in parens to prevent the following cases:
       * - It has a weaker precedence than the code we are wrapping it in
       * - It's gotten mistaken as block statement instead of object expression
       */
      if (
        !isStrongPrecedenceNode(innerNode)
        || isObjectExpressionInOneLineReturn(node, innerNode)
      ) {
        code = `(${code})`
      }

      return code
    })

    if (!wrap) {
      return fixer.replaceText(node, innerCodes.join(''))
    }

    // do the wrapping
    let code = wrap(...innerCodes)

    // check the outer expression's precedence
    if (
      isWeakPrecedenceParent(node)
      // we wrapped the node in some expression which very likely has a different precedence than original wrapped node
      // let's wrap the whole expression in parens just in case
      && !ASTUtils.isParenthesized(node, sourceCode)
    ) {
      code = `(${code})`
    }

    // check if we need to insert semicolon
    if (/^[`([]/.test(code) && isMissingSemicolonBefore(node, sourceCode)) {
      code = `;${code}`
    }

    return fixer.replaceText(node, code)
  }
}
/**
 * If the node to be moved and the destination node require parentheses, include parentheses in the node to be moved.
 * @param sourceCode Source code of current file
 * @param nodeToMove Nodes that need to be moved
 * @param destinationNode Final destination node with nodeToMove
 * @returns If parentheses are required, code for the nodeToMove node is returned with parentheses at both ends of the code.
 */
export function getMovedNodeCode(params: {
  destinationNode: TSESTree.Node
  nodeToMove: TSESTree.Node
  sourceCode: Readonly<TSESLint.SourceCode>
}): string {
  const {
    destinationNode,
    nodeToMove: existingNode,
    sourceCode,
  } = params
  const code = sourceCode.getText(existingNode)

  if (isStrongPrecedenceNode(existingNode)) {
    // Moved node never needs parens
    return code
  }

  if (!isWeakPrecedenceParent(destinationNode)) {
    // Destination would never needs parens, regardless what node moves there
    return code
  }

  // Parens may be necessary
  return `(${code})`
}

/**
 * Check if a node will always have the same precedence if its parent changes.
 */
export function isStrongPrecedenceNode(innerNode: TSESTree.Node): boolean {
  return (
    innerNode.type === AST_NODE_TYPES.Literal
    || innerNode.type === AST_NODE_TYPES.Identifier
    || innerNode.type === AST_NODE_TYPES.TSTypeReference
    || innerNode.type === AST_NODE_TYPES.TSTypeOperator
    || innerNode.type === AST_NODE_TYPES.ArrayExpression
    || innerNode.type === AST_NODE_TYPES.ObjectExpression
    || innerNode.type === AST_NODE_TYPES.MemberExpression
    || innerNode.type === AST_NODE_TYPES.CallExpression
    || innerNode.type === AST_NODE_TYPES.NewExpression
    || innerNode.type === AST_NODE_TYPES.TaggedTemplateExpression
    || innerNode.type === AST_NODE_TYPES.TSInstantiationExpression
  )
}

/**
 * Check if a node's parent could have different precedence if the node changes.
 */
function isWeakPrecedenceParent(node: TSESTree.Node): boolean {
  const parent = node.parent

  if (!parent) {
    return false
  }

  if (
    parent.type === AST_NODE_TYPES.UpdateExpression
    || parent.type === AST_NODE_TYPES.UnaryExpression
    || parent.type === AST_NODE_TYPES.BinaryExpression
    || parent.type === AST_NODE_TYPES.LogicalExpression
    || parent.type === AST_NODE_TYPES.ConditionalExpression
    || parent.type === AST_NODE_TYPES.AwaitExpression
  ) {
    return true
  }

  if (
    parent.type === AST_NODE_TYPES.MemberExpression
    && parent.object === node
  ) {
    return true
  }

  if (
    (parent.type === AST_NODE_TYPES.CallExpression
      || parent.type === AST_NODE_TYPES.NewExpression)
    && parent.callee === node
  ) {
    return true
  }

  if (
    parent.type === AST_NODE_TYPES.TaggedTemplateExpression
    && parent.tag === node
  ) {
    return true
  }

  return false
}

/**
 * Returns true if a node is at the beginning of expression statement and the statement above doesn't end with semicolon.
 * Doesn't check if the node begins with `(`, `[` or `` ` ``.
 */
function isMissingSemicolonBefore(
  node: TSESTree.Node,
  sourceCode: TSESLint.SourceCode,
): boolean {
  for (;;) {
    // https://github.com/typescript-eslint/typescript-eslint/issues/6225
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parent = node.parent!

    if (parent.type === AST_NODE_TYPES.ExpressionStatement) {
      const block = parent.parent

      if (
        block.type === AST_NODE_TYPES.Program
        || block.type === AST_NODE_TYPES.BlockStatement
      ) {
        // parent is an expression statement in a block
        const statementIndex = block.body.indexOf(parent)
        const previousStatement = block.body[statementIndex - 1]

        if (
          statementIndex > 0
          && ESLintUtils.nullThrows(
            sourceCode.getLastToken(previousStatement),
            'Mismatched semicolon and block',
          ).value !== ';'
        ) {
          return true
        }
      }
    }

    if (!isLeftHandSide(node)) {
      return false
    }

    node = parent
  }
}

/**
 * Checks if a node is LHS of an operator.
 */
function isLeftHandSide(node: TSESTree.Node): boolean {
  // https://github.com/typescript-eslint/typescript-eslint/issues/6225
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const parent = node.parent!

  // a++
  if (parent.type === AST_NODE_TYPES.UpdateExpression) {
    return true
  }

  // a + b
  if (
    (parent.type === AST_NODE_TYPES.BinaryExpression
      || parent.type === AST_NODE_TYPES.LogicalExpression
      || parent.type === AST_NODE_TYPES.AssignmentExpression)
    && node === parent.left
  ) {
    return true
  }

  // a ? b : c
  if (
    parent.type === AST_NODE_TYPES.ConditionalExpression
    && node === parent.test
  ) {
    return true
  }

  // a(b)
  if (parent.type === AST_NODE_TYPES.CallExpression && node === parent.callee) {
    return true
  }

  // a`b`
  if (
    parent.type === AST_NODE_TYPES.TaggedTemplateExpression
    && node === parent.tag
  ) {
    return true
  }

  return false
}

/**
 * Checks if a node's parent is arrow function expression and a inner node is object expression
 */
function isObjectExpressionInOneLineReturn(
  node: TSESTree.Node,
  innerNode: TSESTree.Node,
): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.ArrowFunctionExpression
    && node.parent.body === node
    && innerNode.type === AST_NODE_TYPES.ObjectExpression
  )
}
