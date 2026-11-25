import * as fs from 'fs'
import * as path from 'path'
import {
  Project,
  SyntaxKind,
  type CallExpression,
  Node,
  type SourceFile,
} from 'ts-morph'

export type ChatMLRecord = {
  messages: {
    role: 'system' | 'user' | 'assistant'
    content: string
  }[]
}

const excludedDirectories = new Set([
  'node_modules',
  'generated',
  'dist',
  'dist-tsc',
])

const findTestFiles = (repoPath: string): string[] => {
  const files: string[] = []
  const directories = [repoPath]

  while (directories.length > 0) {
    const directory = directories.pop()
    if (!directory) continue

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) directories.push(entryPath)
      } else if (
        entry.isFile() &&
        /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)
      ) {
        files.push(entryPath)
      }
    }
  }

  return files.sort()
}

const getStaticName = (call: CallExpression): string | undefined => {
  const nameArgument = call.getArguments()[0]
  if (!nameArgument) return undefined

  if (
    nameArgument.isKind(SyntaxKind.StringLiteral) ||
    nameArgument.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  ) {
    return nameArgument.getLiteralText()
  }

  return undefined
}

const getDescribeContext = (call: CallExpression): string[] => {
  const contexts: string[] = []
  let node: Node | undefined = call.getParent()

  while (node) {
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression().getText()
      if (/^(?:test|describe)\.?(?:describe)?\s*$/.test(callee)) {
        const name = getStaticName(node)
        if (name) contexts.unshift(name)
      } else if (callee === 'describe' || callee.endsWith('.describe')) {
        const name = getStaticName(node)
        if (name) contexts.unshift(name)
      }
    }
    node = node.getParent()
  }

  return contexts
}

const isTestCall = (call: CallExpression): boolean => {
  const callee = call.getExpression().getText()
  if (/^(test|it)\./.test(callee)) {
    const modifier = callee.slice(callee.indexOf('.') + 1)
    return (
      modifier === 'only' ||
      modifier === 'skip' ||
      modifier === 'todo' ||
      modifier === 'failing' ||
      modifier === 'skipIf' ||
      modifier === 'runIf'
    )
  }
  return callee === 'test' || callee === 'it'
}

const createTestRecord = (
  repoPath: string,
  sourceFile: SourceFile,
  call: CallExpression
): ChatMLRecord | undefined => {
  const testName = getStaticName(call)
  if (!testName) return undefined

  const relativePath = path
    .relative(repoPath, sourceFile.getFilePath())
    .replaceAll('\\', '/')
  const imports = sourceFile
    .getImportDeclarations()
    .map((declaration) => declaration.getText())
    .join('\n')
  const context = getDescribeContext(call)
  const fullName = [...context, testName].join(' > ')

  return {
    messages: [
      {
        role: 'system',
        content:
          "You are an expert TypeScript developer trained on this specific repository. Write clean, focused tests matching the project's Vitest or Playwright conventions.",
      },
      {
        role: 'user',
        content: `File: \`${relativePath}\`\n\nAvailable Imports:\n\`\`\`typescript\n${imports}\n\`\`\`\n\nTask: Write the test \`${fullName}\` with appropriate setup, assertions, and async behavior.`,
      },
      {
        role: 'assistant',
        content: `\`\`\`typescript\n${call.getText()}\n\`\`\``,
      },
    ],
  }
}

/**
 * Parses Vitest and Playwright test cases and creates ChatML records.
 *
 * Accepts either a repository path or an existing ts-morph Project. When a
 * Project is supplied, test files are added to it before parsing.
 */
export function parseTestData(
  repoPathOrProject: string | Project,
  projectOrRepoPath?: Project | string
): ChatMLRecord[] {
  let repoPath: string
  let project: Project

  if (typeof repoPathOrProject === 'string') {
    repoPath = path.resolve(repoPathOrProject)
    project =
      projectOrRepoPath instanceof Project
        ? projectOrRepoPath
        : new Project({ skipAddingFilesFromTsConfig: true })
  } else {
    project = repoPathOrProject
    repoPath =
      typeof projectOrRepoPath === 'string'
        ? path.resolve(projectOrRepoPath)
        : process.cwd()
  }

  for (const testFilePath of findTestFiles(repoPath)) {
    if (!project.getSourceFile(testFilePath)) {
      project.addSourceFileAtPath(testFilePath)
    }
  }

  const records: ChatMLRecord[] = []

  for (const sourceFile of project.getSourceFiles()) {
    if (!/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(sourceFile.getBaseName())) {
      continue
    }

    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression
    )) {
      if (isTestCall(call)) {
        const record = createTestRecord(repoPath, sourceFile, call)
        if (record) records.push(record)
      }
    }
  }

  return records
}
