# Na7 Chat (Local-AI)

Na7 Chat is a local-first AI chat app that runs models directly in your browser.
No server-side inference, no API keys, and no chat data sent to a backend.

## Why This Project Exists

- Privacy first: your prompts and responses stay on your device.
- Works offline: install as a PWA, cache a model, and keep chatting without internet.
- Fast setup: open, choose model, load, and start chatting.

## Features

- In-browser inference using WebGPU and WASM backends
- Streaming token output with live tokens/sec
- Offline queue for prompts when disconnected
- IndexedDB chat history with local search
- PWA install support and service worker caching
- Export/import offline bundle (conversations + queue + pinned models)
- Per-conversation draft autosave in localStorage

## Tech Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- @mlc-ai/web-llm (WebGPU path)
- @huggingface/transformers (WASM/CPU path)
- Web Worker for off-main-thread inference
- IndexedDB + Cache API + localStorage

## How It Works

1. UI sends commands to a dedicated Web Worker.
2. Worker loads either:
	 - WebLLM adapter (WebGPU) for accelerated inference, or
	 - Transformers.js adapter (WASM/CPU) for broader device compatibility.
3. During generation, tokens stream back from worker to UI in real time.
4. Conversations are persisted to IndexedDB.
5. PWA service worker caches app assets and model files for offline usage.
6. If offline or model is not ready, prompts can be queued and replayed later.

## Model Bank (Current)

- Qwen 2.5 - 0.5B (balanced)
- SmolLM2 - 360M (ultra-light)
- Llama 3.2 - 1B (general-purpose)
- Qwen 2.5 - 1.5B (strong multilingual general chat)
- Qwen 2.5 Coder - 1.5ILB (coding-focused)
- DeepSeek R1 Distill Qwen - 1.5B (reasoning-focused)
- TinyLlama - 1.1B (ultra-light fast fallback)

## Quick Start

### Requirements

- Node.js 18+
- Modern browser (Chrome/Edge recommended for WebGPU)

### Install

```bash
npm install
```

### Run Dev Server

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm run preview
```

## Offline Workflow

1. Open model bank and load/download a model once.
2. Install app from browser prompt (PWA).
3. Go offline and continue using cached model + saved chats.
4. Queue prompts while offline and replay when back online.

## Project Structure

```text
src/
	components/      UI (chat window, input, model selector, status)
	hooks/           useEngine (worker bridge), useChat (message state)
	lib/             adapters, model registry, offline storage
	workers/         inference worker (model loading + token streaming)
```

## Privacy Notes

- Inference runs in-browser.
- Conversations are stored locally (IndexedDB/localStorage).
- No remote API key required.
- Model files are downloaded from public model/CDN sources and cached locally.

## Known Limitations

- First model load can take time depending on connection and device.
- WebGPU support varies by browser/device.
- Very large models are not included in this project by default.

## Roadmap

- More curated sub-3B models
- Better model controls (temperature/top-p/max tokens)
- Conversation export formats (Markdown/PDF)
- Improved error boundaries and recovery flows

## Repository

- GitHub: https://github.com/SamirXR/Local-AI

If this project helps you, star the repo and share feedback/issues.