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
import { config } from '../config'
import { findFiles, getTypeDoc } from '../utils/utils'
import { type ChatMLRecord } from './parseTestData'

export const parseTsCode = async (): Promise<ChatMLRecord[]> => {
  const project = new Project({
    // Load the repo's tsconfig if available, otherwise scan files manually
    skipAddingFilesFromTsConfig: true,
  })
  const repoPath = path.resolve(config.repoPath)
  const sourceFilePaths = findFiles(
    repoPath,
    (fileName) =>
      /\.(ts|tsx)$/.test(fileName) && !/\.(test|spec)\.ts$/.test(fileName)
  )

  for (const sourceFilePath of sourceFilePaths) {
    project.addSourceFileAtPath(sourceFilePath)
  }

  /** Dataset generated from TS symbols including functions, classes, types, arrow functions, etc */
  const symbolDataset: ChatMLRecord[] = []

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

      symbolDataset.push(
        createSftExample(relativePath, imports, name, jsDocs, code)
      )
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

        symbolDataset.push(
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

  return symbolDataset
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

await parseTsCode()
