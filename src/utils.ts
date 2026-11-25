import type { JSDocableNode } from 'ts-morph'

/**
 * Get the TypeDoc for a symbol
 */
export const getTypeDoc = (node: JSDocableNode) => {
  return node
    .getJsDocs()
    .map((doc) => doc.getText())
    .join('\n')
}
