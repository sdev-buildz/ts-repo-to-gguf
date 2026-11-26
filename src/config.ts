import * as path from 'path'
export const config = {
  /** Absolute path to the repo on which the model is to be fine-tuned */
  repoPath: path.resolve(
    process.cwd(),
    process.env.REPO_PATH ?? '../example-repo'
  ),

  /** The folder to contain all the generated outputs */
  outputFolder: '../generated',

  /** Path to the llama.cpp repository or installation directory */
  llamaCppPath: path.resolve(
    process.cwd(),
    process.env.LLAMA_CPP_PATH ?? 'generated/llama-cpp'
  ),

  /** Folder containing the PEFT LoRA adapter config and safetensors weights */
  loraSafeTensorsPath: path.resolve(
    process.cwd(),
    process.env.LORA_SAFE_TENSORS_PATH ?? 'generated/lora-safe-tensors'
  ),

  /** Folder in which the converted GGUF adapter is written */
  loraGgufPath: path.resolve(
    process.cwd(),
    process.env.LORA_GGUF_PATH ?? 'generated/lora-gguf'
  ),
}
