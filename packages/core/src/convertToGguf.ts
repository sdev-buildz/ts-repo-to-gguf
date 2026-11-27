import { spawn } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { config } from './config'
import { uncompressLoraFolder } from './utils/uncompressLoraFolder'

/** Official llama.cpp repository used when no local checkout is available. */
const llamaCppRepository = 'https://github.com/ggml-org/llama.cpp.git'

/**
 * Runs a child process and rejects if it cannot start or exits unsuccessfully.
 *
 * @param command - Executable to start.
 * @param args - Arguments passed to the executable.
 * @throws If the process fails to start or exits with a non-zero status.
 */
async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
      }
    })
  })
}

/**
 * Checks whether a filesystem error indicates a missing path.
 *
 * @param error - Error thrown by a filesystem operation.
 * @returns Whether the error represents an absent path.
 */
function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * Finds the LoRA converter, cloning llama.cpp into the configured empty path if needed.
 *
 * @returns The path to `convert_lora_to_gguf.py`.
 * @throws If cloning fails or the configured directory is not a llama.cpp checkout.
 */
async function ensureLlamaCpp(): Promise<string> {
  let contents: string[] = []
  try {
    contents = await fs.readdir(config.llamaCppPath)
  } catch (error) {
    if (!isMissingPath(error)) throw error
  }

  if (contents.length === 0) {
    await fs.mkdir(path.dirname(config.llamaCppPath), { recursive: true })
    await run('git', [
      'clone',
      '--depth',
      '1',
      llamaCppRepository,
      config.llamaCppPath,
    ])
  }

  for (const candidate of [
    path.join(config.llamaCppPath, 'convert_lora_to_gguf.py'),
    path.join(config.llamaCppPath, 'scripts', 'convert_lora_to_gguf.py'),
  ]) {
    try {
      await fs.access(candidate)
      return candidate
    } catch (error) {
      if (!isMissingPath(error)) throw error
    }
  }

  throw new Error(
    `Could not find convert_lora_to_gguf.py in ${config.llamaCppPath}. Set LLAMA_CPP_PATH to a llama.cpp checkout, or use an empty/nonexistent directory to clone it automatically.`
  )
}

/**
 * Verifies that a path contains a non-empty regular file.
 *
 * @param filePath - File to validate.
 * @throws If the path is missing, is not a file, or is empty.
 */
async function requireFile(filePath: string): Promise<void> {
  const file = await fs.stat(filePath)
  if (!file.isFile() || file.size === 0) {
    throw new Error(`Expected a non-empty file at ${filePath}`)
  }
}

/**
 * Checks whether a value is a non-null, non-array object.
 *
 * @param value - Value to check.
 * @returns Whether the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Writes a local base config for llama.cpp, excluding bitsandbytes metadata
 * that describes the training-time weight quantization, not the LoRA adapter.
 *
 * @param baseModelId - Hugging Face model ID or local model path.
 * @returns Path to the temporary directory containing the base config.
 * @throws If the base config cannot be loaded or written.
 */
async function prepareBaseConfig(baseModelId: string): Promise<string> {
  const configFolder = await fs.mkdtemp(
    path.join(os.tmpdir(), 'llama-base-config-')
  )
  const script = [
    'import json, pathlib, sys',
    'from transformers import AutoConfig',
    'hparams = AutoConfig.from_pretrained(sys.argv[1]).to_dict()',
    'quantization_config = hparams.get("quantization_config")',
    'if isinstance(quantization_config, dict) and quantization_config.get("quant_method") == "bitsandbytes":',
    '    hparams.pop("quantization_config")',
    'with open(pathlib.Path(sys.argv[2]) / "config.json", "w", encoding="utf-8") as config_file:',
    '    json.dump(hparams, config_file)',
  ].join('\n')

  try {
    await run(process.env.PYTHON ?? 'python', [
      '-c',
      script,
      baseModelId,
      configFolder,
    ])
    return configFolder
  } catch (error) {
    await fs.rm(configFolder, { recursive: true, force: true })
    throw error
  }
}

/**
 * Converts the configured PEFT LoRA safetensors adapter to a GGUF adapter.
 *
 * @throws If adapter files, llama.cpp, Python, or the converter are unavailable.
 */
async function convertAdapter(): Promise<void> {
  const adapterFolder = await uncompressLoraFolder(config.loraSafeTensorsPath)
  try {
    const adapterConfig = path.join(adapterFolder.path, 'adapter_config.json')
    const adapterWeights = path.join(
      adapterFolder.path,
      'adapter_model.safetensors'
    )
    await requireFile(adapterConfig)
    await requireFile(adapterWeights)

    const adapterSettings: unknown = JSON.parse(
      await fs.readFile(adapterConfig, 'utf8')
    )
    if (!isRecord(adapterSettings)) {
      throw new Error(`Invalid LoRA adapter config at ${adapterConfig}`)
    }
    const baseModelId = adapterSettings.base_model_name_or_path
    if (typeof baseModelId !== 'string' || baseModelId.length === 0) {
      throw new Error(
        `LoRA adapter config at ${adapterConfig} must specify base_model_name_or_path`
      )
    }

    const converter = await ensureLlamaCpp()
    await fs.mkdir(config.loraGgufPath, { recursive: true })

    const outputPath = path.join(config.loraGgufPath, 'adapter.gguf')
    const baseConfigFolder = await prepareBaseConfig(baseModelId)
    try {
      await run(process.env.PYTHON ?? 'python', [
        converter,
        '--base',
        baseConfigFolder,
        '--outfile',
        outputPath,
        '--outtype',
        'f16',
        adapterFolder.path,
      ])
      console.log(`Converted LoRA adapter to ${outputPath}`)
    } finally {
      await fs.rm(baseConfigFolder, { recursive: true, force: true })
    }
  } finally {
    await adapterFolder.cleanup?.()
  }
}

await convertAdapter()
