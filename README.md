# 🤖 Fine-tuner

Fine-tuner builds a repository-specific ChatML dataset and converts a PEFT/LoRA adapter into GGUF format for use with llama.cpp.

It is designed for TypeScript repositories and combines three sources of training data:

- **TypeScript symbols** - functions, classes, interfaces, type aliases, enums, and arrow-function assignments.
- **Test cases** - Vitest and Playwright `test`/`it` calls.
- **Git commits** - small, eligible commit diffs paired with their commit messages.

The repository includes a Colab notebook for supervised fine-tuning a Qwen 2.5 1.5B Instruct model with Unsloth.

## 🔄 Pipeline

1. Scan a target repository for `.ts` and `.tsx` source and test files.
2. Generate ChatML JSONL records from symbols, tests, and Git history.
3. Upload the dataset to Google Colab and fine-tune Qwen 2.5 1.5B with LoRA.
4. Download the PEFT adapter, save it under `generated/qwen_1.5b_lora`, and convert it to GGUF.
5. Load the generated adapter in llama.cpp.

## 🗺️ Roadmap

- Automate the end-to-end pipeline: create the dataset, run fine-tuning in Google Colab, and convert the resulting adapter to GGUF.
- Optionally run or test the converted model.

## 📋 Prerequisites

- Windows or another environment supported by Node.js and pnpm
- Node.js
- pnpm
- Git
- Python
- A local llama.cpp checkout, or Git access to clone one automatically
- Python packages required by the llama.cpp converter, including `transformers`
- A Hugging Face access token for the llama.cpp GGUF conversion script
- A GPU runtime for training in [src/fine-tuner.ipynb](src/fine-tuner.ipynb)

## 📦 Installation

```powershell
pnpm install
Copy-Item .env.example .env
```

Edit `.env` and set the paths for your local environment:

```dotenv
REPO_PATH=../target-repo
LLAMA_CPP_PATH=../llama-cpp
LORA_SAFE_TENSORS_PATH=generated/qwen_1.5b_lora
LORA_GGUF_PATH=generated/lora-gguf
HF_TOKEN=your-hugging-face-read-token
```

Paths are resolved from the fine-tuner project directory. `HF_TOKEN` is passed to the Hugging Face-backed Python environment used while preparing the base model configuration. Set it for all base models, not only gated or private models: llama.cpp's `convert_lora_to_gguf.py` workflow requires the Hugging Face token.

## 🗂️ Generate the training dataset

Set `REPO_PATH` in `.env`, then run:

```powershell
pnpm run generateDataset
```

The generator creates JSONL and inspectable JSON files in `generated/`:

| File                                 | Contents                                          |
| ------------------------------------ | ------------------------------------------------- |
| `generated/variable_output.jsonl`    | Named TypeScript symbol implementations           |
| `generated/testcase_output.jsonl`    | Vitest and Playwright test implementations        |
| `generated/git-commits_output.jsonl` | Eligible commit diffs paired with commit messages |
| `generated/total_output.jsonl`       | Combined training dataset                         |
| `*_inspectable_output.jsonl`         | Pretty JSON representation of the same datasets   |

For Colab training, upload `generated/total_output.jsonl`.

The source scanner:

- Includes `.ts` and `.tsx` files.
- Excludes test/spec files from symbol extraction.
- Excludes `node_modules`, `generated`, `dist`, and `dist-tsc`.
- Extracts test bodies separately from `.test`/`.spec` files.
- Omits Git commit diffs containing more than 28 changed lines.

Each record uses the ChatML messages format:

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

## 🚀 Fine-tune in Colab

Open [src/fine-tuner.ipynb](src/fine-tuner.ipynb) in Google Colab and use a T4 or other CUDA GPU runtime.

The notebook:

- Loads `unsloth/Qwen2.5-1.5B-Instruct` in 4-bit mode.
- Applies LoRA to attention and MLP projection modules.
- Loads and formats the uploaded ChatML JSONL dataset.
- Trains for three epochs using the settings in the notebook.
- Downloads `qwen_1.5b_lora.zip`.

Upload `generated/total_output.jsonl` when prompted, or replace the notebook's upload cell with a dataset already stored in Colab.

## 🔄 Convert the LoRA adapter to GGUF

Place the downloaded adapter either as a folder or as a ZIP archive:

```text
generated/qwen_1.5b_lora/
  adapter_config.json
  adapter_model.safetensors
```

Or:

```text
generated/qwen_1.5b_lora.zip
```

The ZIP may contain the adapter at any nesting level.

Set `LORA_SAFE_TENSORS_PATH` and `LORA_GGUF_PATH` in `.env`, then run:

```powershell
pnpm run convert-to-gguf
```

The converter validates the adapter files, reads the `base_model_name_or_path` from `adapter_config.json`, prepares the base model configuration, and writes:

```text
generated/lora-gguf/adapter.gguf
```

If `LLAMA_CPP_PATH` is empty or does not exist, the script clones llama.cpp there automatically. Otherwise, it expects to find `convert_lora_to_gguf.py` at the configured root or in its `scripts/` directory.

Set `PYTHON` if your Python executable is not available as `python`:

```powershell
$env:PYTHON="python3"
pnpm run convert-to-gguf
```

## ✅ Development checks

Run the project lint and type-check target:

```powershell
pnpm run check:lite
```

Format source files when needed:

```powershell
pnpm run prettier:write
```

## 🗃️ Project layout

```text
src/
  generateChatMLData.ts  # Dataset orchestration
  parseTestData.ts       # Vitest and Playwright test extraction
  parseGitCommits.ts     # Commit-diff extraction
  convertToGguf.ts       # LoRA-to-GGUF conversion
  config.ts              # Environment-derived paths
  utils/                 # Adapter extraction and JSDoc helpers
  fine-tuner.ipynb       # Google Colab training notebook
generated/               # Generated datasets, adapters, and llama.cpp checkout
```
