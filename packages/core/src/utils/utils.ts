import * as fs from 'fs'
import * as path from 'path'
import type { JSDocableNode } from 'ts-morph'
import { config } from '../config'

export const findFiles = (
  repoPath: string,
  matchesFileName: (fileName: string) => boolean
): string[] => {
  const files: string[] = []
  const directories = [repoPath]

  while (directories.length > 0) {
    const directory = directories.pop()!
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) directories.push(entryPath)
      } else if (entry.isFile() && matchesFileName(entry.name)) {
        files.push(entryPath)
      }
    }
  }

  return files.sort()
}

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

/**
 * Directories to exclude when searching for test files or source files.
 * These directories are typically generated or external dependencies that should not be included in the dataset generation process.
 */
export const excludedDirectories = new Set([
  'node_modules',
  'generated',
  'dist',
  'dist-tsc',
])
