# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

HF-GDrive-AI is a Hugging Face model testing lab: a full-stack web app for running inference against HF models (streaming chat completions with fallback to raw generation) and optionally syncing uploaded files with Google Drive.

## Commands

All commands run from the repo root unless noted.

```bash
# Development
npm run dev              # Express backend (port 5000, with Vite HMR)
npm run dev:client       # Vite dev server only (port 5000)

# Type checking (no separate lint tool)
npm run check            # tsc — the only linting/type check available

# Build (client via Vite → dist/public, server via esbuild → dist/index.cjs)
npm run build

# Production
npm run start            # node dist/index.cjs

# Database
npm run db:push          # Push Drizzle schema to PostgreSQL
```

There are no test commands configured.

## Architecture

### Single-server design

The Express server (`server/`) serves the React SPA, provides backend API routes, and handles file uploads and Google Drive sync.

### Frontend state and data flow

- **Zustand** (`client/src/lib/store.ts`) holds all persistent client state: `apiKey`, `activeModelId`, `generationParams` (temperature, top_p, max_tokens), and `history`. All state is persisted to `localStorage` via the Zustand persist middleware — no backend involvement.
- **HF inference** (`client/src/lib/hf.ts`) calls the HF API directly from the browser:
  1. Primary: OpenAI-compatible chat completions at `https://api-inference.huggingface.co/models/{modelId}/v1/chat/completions`
  2. Fallback: raw generation endpoint if the chat API fails
  - Both paths stream via SSE (`ReadableStream`). The `onChunk` callback surfaces tokens incrementally.
- **React Query** is configured but inference calls are not React Query queries — they're imperative calls triggered by form submit.

### Backend

`server/routes.ts` mounts the file routes (`server/files/routes.ts`) under `/api` and serves uploaded files as static assets from `/uploads`. `server/storage.ts` defines an `IStorage` interface (user CRUD) with a `MemStorage` in-memory implementation. The Drizzle + PostgreSQL schema in `shared/schema.ts` is defined and ready but the backend doesn't yet use it — `DATABASE_URL` must be set for `db:push` to work.

**File & Drive module** (`server/files/`):
- `routes.ts` — Express `Router` handling `GET /api/files`, `POST /api/upload`, `GET /api/drive/files`, `POST /api/drive/download/:fileId`, `DELETE /api/files/:filename`
- `drive.ts` — Google Drive OAuth2 client; reads `credentials.json` and `token.json` from the project root; Drive features are silently disabled when `credentials.json` is absent
- Uploaded files land in `uploads/` at the project root and are served at `/uploads/<filename>`

### Path aliases

`tsconfig.json` defines:
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

Use these aliases in all client-side imports.

### UI components

shadcn/ui components live in `client/src/components/ui/`. Add new shadcn components with `npx shadcn@latest add <component>` — they are generated there. Page-level and feature components go directly in `client/src/components/` or `client/src/pages/`.

## Key Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `DATABASE_URL` | `drizzle.config.ts`, `db:push` | PostgreSQL connection string |
| `NODE_ENV` | `server/index.ts` | `development` enables Vite HMR middleware |
| `PORT` | `server/index.ts` | Defaults to 5000 |

The HF API key is stored client-side in `localStorage` (set via the Settings dialog, never sent to the backend).

Google Drive integration requires `credentials.json` and (after first auth) `token.json` at the project root. If `credentials.json` is absent, Drive features are silently disabled.
