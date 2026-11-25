import * as fs from 'fs'
import * as path from 'path'
import {
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type EnumDeclaration,
  type FunctionDeclaration,
  type InterfaceDeclaration,
  type TypeAliasDeclaration,
} from 'ts-morph'
import { getTypeDoc } from '../src/utils'
import { config } from './config'

type ChatMLRecord = {
  messages: {
    role: 'system' | 'user' | 'assistant'
    content: string
  }[]
}

function generateChatMLDataset() {
  const project = new Project({
    // Load the repo's tsconfig if available, otherwise scan files manually
    skipAddingFilesFromTsConfig: true,
  })
  const repoPath = path.resolve(config.repoPath)
  const excludedDirectories = new Set([
    'node_modules',
    'generated',
    'dist',
    'dist-tsc',
  ])
  const directories = [repoPath]
  let sourceFilePaths: string[] = []

  while (directories.length > 0) {
    const directory = directories.pop()!
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) directories.push(entryPath)
      } else if (
        entry.isFile() &&
        /\.(ts|tsx)$/.test(entry.name) &&
        !/\.(test|spec)\.ts$/.test(entry.name)
      ) {
        sourceFilePaths.push(entryPath)
      }
    }
  }

  sourceFilePaths.sort()

  for (const sourceFilePath of sourceFilePaths) {
    project.addSourceFileAtPath(sourceFilePath)
  }

  const dataset: ChatMLRecord[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const relativePath = path.relative(repoPath, sourceFile.getFilePath())
    // Grab file imports to preserve type/dependency context
    const imports = sourceFile
      .getImportDeclarations()
      .map((imp) => imp.getText())
      .join('\n')

    /** Handle classes and traditional functions */
    const handleNamedDeclaration = (
      node:
        | FunctionDeclaration
        | ClassDeclaration
        | InterfaceDeclaration
        | TypeAliasDeclaration
        | EnumDeclaration
    ) => {
      const name = node.getName()
      if (!name) return // Skip anonymous declarations

      const jsDocs = getTypeDoc(node)
      const code = node.getText()

      dataset.push(createSftExample(relativePath, imports, name, jsDocs, code))
    }

    // 1. Extract Functions
    for (const func of sourceFile.getFunctions()) {
      handleNamedDeclaration(func)
    }

    // 2. Extract Classes
    for (const cls of sourceFile.getClasses()) {
      handleNamedDeclaration(cls)
    }

    // 3. Extract Interfaces
    for (const interfaceDeclaration of sourceFile.getInterfaces()) {
      handleNamedDeclaration(interfaceDeclaration)
    }

    // 4. Extract Type Aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      handleNamedDeclaration(typeAlias)
    }

    // 5. Extract Enums
    for (const enumDeclaration of sourceFile.getEnums()) {
      handleNamedDeclaration(enumDeclaration)
    }

    // 6. Extract Arrow Functions assigned to variables
    for (const variableStatement of sourceFile.getVariableStatements()) {
      const jsDocs = getTypeDoc(variableStatement)

      for (const declaration of variableStatement.getDeclarations()) {
        const initializer = declaration.getInitializer()
        if (!initializer?.isKind(SyntaxKind.ArrowFunction)) continue

        const code = variableStatement.getText()

        dataset.push(
          createSftExample(
            relativePath,
            imports,
            declaration.getName(),
            jsDocs,
            code
          )
        )
      }
    }
  }

  // Write as JSONL
  const jsonlContent = dataset.map((item) => JSON.stringify(item)).join('\n')

  for (const outputPath of [config.varDataset, config.inspectableVar]) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    if (!fs.existsSync(outputPath)) {
      fs.writeFileSync(outputPath, '', 'utf-8')
    }
  }

  fs.writeFileSync(config.varDataset, jsonlContent, 'utf-8')
  fs.writeFileSync(config.inspectableVar, JSON.stringify(dataset), 'utf-8')
  console.log(
    `Generated ${dataset.length} training examples in ${config.varDataset}`
  )
}

function createSftExample(
  filePath: string,
  imports: string,
  symbolName: string,
  docs: string,
  code: string
): ChatMLRecord {
  const description = docs
    ? `Documentation:\n${docs}`
    : `Implement \`${symbolName}\` following the repository's architecture and TypeScript conventions.`

  return {
    messages: [
      {
        role: 'system',
        content:
          "You are an expert TypeScript developer trained on this specific repository. Write clean, strictly-typed code matching the project's patterns.",
      },
      {
        role: 'user',
        content: `File: \`${filePath}\`\n\nAvailable Imports:\n\`\`\`typescript\n${imports}\n\`\`\`\n\nTask: Write the implementation for \`${symbolName}\`.\n${description}`,
      },
      {
        role: 'assistant',
        content: `\`\`\`typescript\n${code}\n\`\`\``,
      },
    ],
  }
}

generateChatMLDataset()
