import * as fs from 'fs'
import { getDatasetPath, type DatasetType } from '../utils/utils'
import { generateChatMLDataset } from './generateChatMLData'
import { type ChatMLRecord } from './parseTestData'

async function createAndEmit() {
  const datasets = await generateChatMLDataset()

  emitOutput(datasets.symbolDataset, 'variable')
  emitOutput(datasets.testcaseDataset, 'testcase')
  emitOutput(datasets.gitCommitDataset, 'git-commits')
  emitOutput(datasets.totalDataset, 'total')
}

const emitOutput = (dataset: ChatMLRecord[], datasetType: DatasetType) => {
  const jsonlContent = dataset.map((item) => JSON.stringify(item)).join('\n')

  fs.writeFileSync(getDatasetPath(datasetType), jsonlContent, 'utf-8')
  fs.writeFileSync(
    getDatasetPath(datasetType, true),
    JSON.stringify(dataset),
    'utf-8'
  )
}

await createAndEmit()
