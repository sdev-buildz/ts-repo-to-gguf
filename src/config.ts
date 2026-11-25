import * as path from 'path'
export const config = {
  /** Absolute path to the repo on which the model is to be fine-tuned */
  repoPath: path.resolve(
    import.meta.dirname,
    process.env.REPO_PATH ?? '../example-repo'
  ),
  /** The folder to contain all the generated outputs */
  outputFolder: '../generated',
  /** Absolute path to the variable dataset */
  varDataset: path.resolve(
    import.meta.dirname,
    '../generated/variable_output.jsonl'
  ),
  /** Absolute path to the inspectable variable dataset */
  inspectableVar: path.resolve(
    import.meta.dirname,
    '../generated/inspectable_variable.json'
  ),
  /** Absolute path to the variable dataset */
  testcaseDataset: path.resolve(
    import.meta.dirname,
    '../generated/testcase_output.jsonl'
  ),
  /** Absolute path to the inspectable variable dataset */
  inspectableTestcase: path.resolve(
    import.meta.dirname,
    '../generated/inspectable_testcase.json'
  ),
}
