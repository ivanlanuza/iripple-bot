## Local Runtime

This app now runs local LLM inference through `llama.cpp` directly. Ollama is no longer used.

Install the native dependencies first:

```bash
brew install ffmpeg whisper-cpp llama.cpp
```

`llama.cpp` must provide `llama-server` on your `PATH`. If it does not, set `LLAMA_CPP_BIN` in `.env.local`.

## Model Config

Copy [.env.example](/Users/ivanlanuza/Dropbox/Ivan/Coding/NextJS/iripple-bot/.env.example) to `.env.local` and set the GGUF paths you want to use.

Model selection is alias-based:

- `IRIPPLE_CHAT_MODEL=llama3.2:3b`
- `IRIPPLE_CHAT_MODEL=gemma3:1b`
- `IRIPPLE_CHAT_MODEL=mistral`
- `IRIPPLE_CHAT_MODEL=qwen2.5`

Each alias resolves through an env var named `IRIPPLE_MODEL_<NORMALIZED_ALIAS>_PATH`. For example:

- `llama3.2:3b` becomes `IRIPPLE_MODEL_LLAMA3_2_3B_PATH`
- `gemma3:1b` becomes `IRIPPLE_MODEL_GEMMA3_1B_PATH`
- `qwen2.5` becomes `IRIPPLE_MODEL_QWEN2_5_PATH`

Use a dedicated embedding model such as `nomic-embed-text` and point it at a GGUF file with `IRIPPLE_MODEL_NOMIC_EMBED_TEXT_PATH`.

When you change the embedding model or its GGUF path, rebuild `data/embeddings.json` from the hidden admin panel before asking RAG questions again.

## Whisper Setup

The app also needs a local Whisper ggml model. By default it looks for:

- `~/.ggml-tiny.en.bin`
- `~/.ggml-base.en.bin`

If your model lives elsewhere, point the app at it explicitly:

```bash
export WHISPER_MODEL_PATH=/full/path/to/ggml-model.bin
```

If either binary lives outside your shell `PATH`, point the app at it explicitly:

```bash
export FFMPEG_BIN=/full/path/to/ffmpeg
export WHISPER_BIN=/full/path/to/whisper-cli
```

## Running

Then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The app starts dedicated `llama-server` processes for chat and embeddings on demand, using the model aliases and runtime settings from `.env.local`.
