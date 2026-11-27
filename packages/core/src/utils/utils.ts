import * as path from 'path'
import type { JSDocableNode } from 'ts-morph'
import { config } from '../config'

/**
 * Get the TypeDoc for a symbol
 */
export const getTypeDoc = (node: JSDocableNode) => {
  return node
    .getJsDocs()
    .map((doc) => doc.getText())
    .join('\n')
}

/** Dataset types */
export const datasetTypes = ['git-commits', 'testcase', 'variable', 'total']

/** Dataset type names Type */
export type DatasetType = (typeof datasetTypes)[number]

/**
 * Get the path to the dataset output file for a given dataset type.
 */
export const getDatasetPath = (
  datasetType: DatasetType,
  inspectable = false
) => {
  return path.resolve(
    import.meta.dirname,
    `${config.outputFolder}/${datasetType}_${inspectable ? 'inspectable_' : ''}output.jsonl`
  )
}
