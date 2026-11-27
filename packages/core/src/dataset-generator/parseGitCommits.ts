import { simpleGit } from 'simple-git'
import { config } from '../config'
import type { ChatMLRecord } from './parseTestData'

/** Maximum number of changed lines allowed in a commit diff. */
const maxChangedLines = 100

/** Number of unchanged lines shown around each changed hunk. */
const diffContextLines = 5

/**
 * Counts added and removed lines inside Git diff hunks.
 *
 * @param diff - Unified Git diff output.
 * @returns The number of changed lines, excluding context and headers.
 */
const countChangedLines = (diff: string): number => {
  let inHunk = false
  let changedLines = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --')) {
      inHunk = false
    } else if (line.startsWith('@@')) {
      inHunk = true
    } else if (inHunk && (line.startsWith('+') || line.startsWith('-'))) {
      changedLines += 1
    }
  }

  return changedLines
}

/**
 * Parses Git commits into a ChatML training dataset.
 *
 * Commits with more than 100 changed lines are omitted. Included diffs have
 * three lines of surrounding context.
 *
 * @returns ChatML records for eligible commits.
 */
export async function parseGitCommits(): Promise<ChatMLRecord[]> {
  const git = simpleGit(config.repoPath)
  const { all: commits } = await git.log()
  const records: ChatMLRecord[] = []

  for (const commit of commits) {
    const message = [commit.message, commit.body.trim()]
      .filter(Boolean)
      .join('\n\n')
    if (!message) continue

    const changes = (
      await git.show([
        commit.hash,
        '--format=',
        '--no-ext-diff',
        '--no-color',
        `--unified=${diffContextLines}`,
      ])
    ).trim()
    if (!changes || countChangedLines(changes) > maxChangedLines) continue

    records.push({
      messages: [
        {
          role: 'system',
          content:
            "You are an expert TypeScript developer trained on this specific repository. Implement the requested change using the repository's conventions.",
        },
        {
          role: 'user',
          content: `Implement the following change:\n\n${message}`,
        },
        {
          role: 'assistant',
          content: changes,
        },
      ],
    })
  }

  return records
}
