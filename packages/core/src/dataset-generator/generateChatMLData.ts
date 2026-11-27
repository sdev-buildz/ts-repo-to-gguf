import * as fs from 'fs'
import * as path from 'path'
import { config } from '../config'
import { datasetTypes, getDatasetPath } from '../utils/utils'
import { parseGitCommits } from './parseGitCommits'
import { parseTestData } from './parseTestData'
import { parseTsCode } from './parseTsCode'

export const generateChatMLDataset = async () => {
  const repoPath = path.resolve(config.repoPath)

  for (const outputPath of datasetTypes.map((name) => getDatasetPath(name))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    if (!fs.existsSync(outputPath)) {
      fs.writeFileSync(outputPath, '', 'utf-8')
    }
  }

  const symbolDataset = await parseTsCode()
  const testcaseDataset = parseTestData(repoPath)
  const gitCommitDataset = await parseGitCommits()

  const totalDataset = [
    ...symbolDataset,
    ...testcaseDataset,
    ...gitCommitDataset,
  ]

  console.log(
    `Generated ${symbolDataset.length} training examples in ${getDatasetPath('variable')}`
  )
  console.log(
    `Generated ${testcaseDataset.length} training examples in ${getDatasetPath('testcase')}`
  )
  console.log(
    `Generated ${gitCommitDataset.length} training examples in ${getDatasetPath('git-commits')}`
  )
  console.log(
    `Generated ${totalDataset.length} training examples in ${getDatasetPath('total')}`
  )

  return {
    symbolDataset,
    testcaseDataset,
    gitCommitDataset,
    totalDataset,
  }
}
