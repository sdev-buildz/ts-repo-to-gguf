import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

type PreparedFolder = {
  path: string
  cleanup?: () => Promise<void>
}

/**
 * Uses Python's standard library to extract a ZIP archive after verifying that
 * every member remains inside the extraction directory.
 */
async function extractZip(
  archivePath: string,
  destination: string
): Promise<void> {
  const script = [
    'import pathlib, sys, zipfile',
    'destination = pathlib.Path(sys.argv[2]).resolve()',
    'with zipfile.ZipFile(sys.argv[1]) as archive:',
    '    for member in archive.infolist():',
    '        target = (destination / member.filename).resolve()',
    '        if target != destination and destination not in target.parents:',
    '            raise ValueError(f"Archive member escapes extraction directory: {member.filename}")',
    '    archive.extractall(destination)',
  ].join('\n')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.env.PYTHON ?? 'python',
      ['-c', script, archivePath, destination],
      { stdio: 'inherit', windowsHide: true }
    )

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(
            `Failed to extract ${archivePath} (exit code ${code ?? 'unknown'})`
          )
        )
      }
    })
  })
}

async function findAdapterFolder(
  folderPath: string
): Promise<string | undefined> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  const names = new Set(entries.map((entry) => entry.name))

  if (
    names.has('adapter_config.json') &&
    names.has('adapter_model.safetensors')
  ) {
    return folderPath
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nestedFolder = await findAdapterFolder(
        path.join(folderPath, entry.name)
      )
      if (nestedFolder) return nestedFolder
    }
  }
}

/**
 * Returns an adapter directory as-is or extracts a ZIP archive to a temporary
 * directory. Call `cleanup` on the result when conversion has finished.
 */
export async function uncompressLoraFolder(
  folderPath: string
): Promise<PreparedFolder> {
  let sourcePath = folderPath
  let sourceStat: Awaited<ReturnType<typeof fs.stat>> | undefined

  try {
    sourceStat = await fs.stat(sourcePath)
  } catch (error) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    )) {
      throw error
    }

    sourcePath = `${folderPath}.zip`
    try {
      sourceStat = await fs.stat(sourcePath)
    } catch (archiveError) {
      if (!(
        archiveError instanceof Error &&
        'code' in archiveError &&
        archiveError.code === 'ENOENT'
      )) {
        throw archiveError
      }
      throw new Error(
        `Could not find the LoRA adapter folder or ZIP archive at ${folderPath}`
      )
    }
  }

  if (sourceStat.isDirectory()) return { path: sourcePath }
  if (
    !sourceStat.isFile() ||
    path.extname(sourcePath).toLowerCase() !== '.zip'
  ) {
    throw new Error(
      `Expected a LoRA adapter folder or ZIP archive at ${sourcePath}`
    )
  }

  const tempFolder = await fs.mkdtemp(
    path.join(os.tmpdir(), 'lora-safe-tensors-')
  )

  try {
    await extractZip(sourcePath, tempFolder)
    const adapterFolder = await findAdapterFolder(tempFolder)
    if (!adapterFolder) {
      throw new Error(
        `ZIP archive does not contain adapter_config.json and adapter_model.safetensors: ${sourcePath}`
      )
    }

    return {
      path: adapterFolder,
      cleanup: () => fs.rm(tempFolder, { recursive: true, force: true }),
    }
  } catch (error) {
    await fs.rm(tempFolder, { recursive: true, force: true })
    throw error
  }
}
