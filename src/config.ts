import * as path from 'path'
export const config = {
  /** Absolute path to the repo on which the model is to be fine-tuned */
  repoPath: path.resolve(
    import.meta.dirname,
    process.env.REPO_PATH ?? '../example-repo'
  ),
  /** The folder to contain all the generated outputs */
  outputFolder: '../generated',
}
