<div align="center">

<br/>

# آمـن — AAMEEN Frontend

**Privacy-first encrypted cloud storage — built for the Arab world**

React 19 · TypeScript · Vite · Tailwind CSS

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-rolldown-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](#license)

</div>

---

## Overview

This is the web frontend for **AAMEEN** — a zero-knowledge encrypted cloud storage platform serving Arab and MENA-region users. The client handles all encryption and decryption locally in the browser using a master-key model. Files are encrypted before they leave your device and are only decrypted when you view them — the server never touches your keys or your plaintext.

Key principles of this frontend:

- **Encrypt first, upload second** — no plaintext bytes ever leave the browser
- **Arabic-first interface** — full RTL support with `react-i18next`
- **MENA-native** — local payment options, regional UX considerations
- **Offline-capable previews** — IndexedDB caching via Dexie for smooth repeat access

---

## Tech Stack

| Category | Library |
|---|---|
| Framework | React 19 |
| Language | TypeScript 5.9 |
| Build tool | Vite (rolldown-vite) |
| Styling | Tailwind CSS 4 |
| Routing | React Router v7 |
| HTTP client | Axios |
| i18n | i18next + react-i18next |
| Local DB | Dexie (IndexedDB) |
| File previews | pdfjs-dist, @react-pdf-viewer, mammoth, mp4box |
| Auth | @react-oauth/google |
| CAPTCHA | Cloudflare Turnstile (@marsidev/react-turnstile) |
| Password strength | zxcvbn |
| Fingerprinting | FingerprintJS |
| Icons | Lucide React, FontAwesome |

---

## Prerequisites

- Node.js 18+
- The [AAMEEN Backend](https://github.com/aamenn-org/aamenn-backend) running locally or a deployed instance

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/aamenn-org/aamenn-frontend.git
cd aamenn-frontend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_TURNSTILE_SITE_KEY=0x...
```

### 3. Start the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the AAMEEN backend API |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |

---

## Available Scripts

```bash
# Start dev server with HMR
npm run dev

# Type-check and build for production
npm run build

# Preview the production build locally
npm run preview

# Lint the codebase
npm run lint
```

---

## Project Structure

```
src/
├── assets/          # Static images, icons, fonts
├── components/      # Reusable UI components
│   ├── ui/          # Base design system (buttons, modals, inputs)
│   ├── files/       # File cards, grid, upload progress
│   ├── albums/      # Album views and management
│   └── layout/      # Sidebar, topbar, shell
├── pages/           # Route-level page components
├── hooks/           # Custom React hooks
├── services/        # API calls (Axios instances + typed functions)
├── crypto/          # Client-side encryption logic (AES-GCM, key derivation)
├── store/           # App state (React context / Zustand)
├── i18n/            # Translation files (Arabic, English)
│   ├── ar/
│   └── en/
├── lib/             # Utility functions, IndexedDB (Dexie) setup
└── types/           # Shared TypeScript interfaces and types
```

---

## Encryption Model

All cryptographic operations happen **in the browser** — the server is never involved in key management.

```
User password
     │
     ▼
 PBKDF2 / Argon2
     │
     ▼
  Master Key  ──▶  Encrypt per-file DEK  ──▶  Store encrypted DEK on server
                          │
                          ▼
                    AES-256-GCM
                          │
                          ▼
                  Encrypt file bytes  ──▶  Upload ciphertext to B2
```

When downloading, the process is reversed entirely on the client. The backend only ever stores encrypted DEKs and ciphertext — it cannot access your files.

---

## Internationalization

The app ships with full Arabic and English support. Language can be switched at runtime. Arabic uses RTL layout automatically.

Translation files live in `src/i18n/ar/` and `src/i18n/en/`. To add a new translation key, add it to both locale files.

---

## Docker

```bash
# Build and run via Docker Compose
docker compose up --build
```

The production image is built with Vite and served via nginx. See [`Dockerfile`](Dockerfile) and [`nginx.conf`](nginx.conf) for configuration.

---

## File Preview Support

AAMEEN decrypts files in-browser and renders them without writing to disk:

| Format | Library |
|---|---|
| PDF | pdfjs-dist + @react-pdf-viewer |
| Images | Native browser + react-zoom-pan-pinch |
| Video | mp4box + native `<video>` |
| Word (.docx) | mammoth |
| Others | Download prompt |

Blur hashes (`blurhash`) are used as low-res placeholders while full previews load.

---

## Security Notes

- Vault keys are derived from the user's password and never sent to the server
- File DEKs are encrypted with the master key and stored server-side as ciphertext
- `zxcvbn` enforces strong password requirements at registration
- `DOMPurify` sanitizes any rendered HTML content
- `FingerprintJS` is used for suspicious session detection, not tracking
- Cloudflare Turnstile protects auth endpoints from bots

---

## Contributing

1. Fork the repo and create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `npm run lint` passes
4. Open a pull request with a description of what changed and why

---

## Related Repositories

- **[aamenn-backend](https://github.com/aamenn-org/aamenn-backend)** — NestJS API, database, B2 orchestration

---

## License

Proprietary — All rights reserved. © AAMEEN.
