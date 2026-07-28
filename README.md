# Notetaker — Private Notes on Midnight

A privacy-preserving on-chain note-taking DApp built on the Midnight blockchain. Note titles are recorded on-chain while note bodies remain completely private, never leaving your device.

---

## Contract Address

**This section is mandatory — replace the placeholder after deploying.**

| Network | Contract Address |
|---------|-----------------|
| Preprod | `<YOUR_DEPLOYED_CONTRACT_ADDRESS>` |

After deployment, also update the following files:
- `notetaker-ui/src/main.tsx` — uncomment and fill `CONTRACT_ADDRESS`
- Any environment file referencing `<YOUR_DEPLOYED_CONTRACT_ADDRESS>`

---

## Features

- **Write a note** — record a note title on-chain. Only the title is public; the body stays off-chain.
- **Update a note** — change the on-chain title (only the owner can do this, proven via ZK proof).
- **Delete a note** — remove the note from the chain (owner-only, ZK-proven).
- **Privacy by default** — the note body is never submitted to the chain; only the title is disclosed.
- **Ownership proofs** — ownership is verified using a persistent hash of the user's secret key and a sequence nonce.
- **Wallet integration** — connects to the Midnight Lace wallet browser extension.
- **Multi-slot UI** — deploy and manage multiple note slots simultaneously.
- **CLI interface** — full command-line tool for standalone and remote network usage.

---

## What This Project Does

Notetaker lets you create timestamped, owner-controlled note slots on the Midnight blockchain. Each slot stores only a public title and a hashed ownership key — the actual note content remains private on the user's device.

When you write a note, a zero-knowledge proof shows that you know a secret key that hashes to the stored owner key, without ever revealing the key itself. Only the person who originally wrote the note (or proved ownership) can update or delete it.

---

## Privacy Model

| Data | Visibility | Where stored |
|------|-----------|--------------|
| Note title | **Public** — visible to everyone | On-chain ledger |
| Note sequence counter | **Public** — visible to everyone | On-chain ledger |
| Owner public key hash | **Public** — visible to everyone | On-chain ledger |
| Note body / content | **Private** — never leaves your device | Off-chain only |
| User secret key | **Private** — never leaves your device | Private state provider |

**What users prove without revealing:**
- They know the secret key that hashes (via `noteKey`) to the stored `owner` field — without revealing the secret key.
- The note body they are referencing is their own — the body is a local witness, never submitted to the chain.

---

## Tech Stack

- **Midnight** — privacy-preserving blockchain
- **Compact** — Midnight's ZK smart contract language
- **TypeScript** — throughout (contracts, API, CLI, UI)
- **React 19 + MUI** — frontend
- **RxJS** — reactive state management
- **Vite** — frontend build tool
- **Pino** — structured logging
- **Midnight Lace Wallet** — browser wallet extension
- **Node.js 24** — runtime

---

## Folder Structure

```
demo/
├── contract/                   # Compact smart contract + compiled output
│   └── src/
│       ├── notetaker.compact   # The Compact contract (write/update/delete note)
│       ├── witnesses.ts        # Private state + witness definitions
│       ├── index.ts            # CompiledContract export
│       └── managed/notetaker/  # Compiler output (keys, zkir, contract JS)
├── api/                        # Shared TypeScript API layer
│   └── src/
│       ├── index.ts            # NotetakerAPI class (deploy/join/writeNote/updateNote/deleteNote)
│       ├── common-types.ts     # Shared types and interfaces
│       └── utils/index.ts      # Utility functions (randomBytes)
├── notetaker-cli/              # CLI tool for local/testnet interaction
│   └── src/
│       ├── index.ts            # Interactive CLI menu
│       ├── config.ts           # Environment configurations
│       ├── midnight-wallet-provider.ts
│       ├── wallet-utils.ts
│       ├── generate-dust.ts
│       ├── logger-utils.ts
│       └── launcher/
│           ├── standalone.ts   # Local dev node launcher
│           ├── preview.ts      # Preview testnet launcher
│           └── preprod.ts      # Preprod testnet launcher
├── notetaker-ui/               # React frontend DApp
│   └── src/
│       ├── App.tsx             # Root component
│       ├── main.tsx            # Entry point + providers
│       ├── components/
│       │   ├── Note.tsx        # Main note card component
│       │   ├── TextPromptDialog.tsx
│       │   └── Layout/         # Header + MainLayout
│       ├── contexts/
│       │   ├── BrowserDeployedNoteManager.ts
│       │   └── DeployedNoteContext.tsx
│       ├── hooks/
│       │   └── useDeployedNoteContext.ts
│       └── config/theme.ts
├── package.json                # Workspace root
└── README.md                   # This file
```

---

## Prerequisites

- **Node.js v24+** — check with `node --version`
- **Docker** — for running the proof server locally
- **Compact compiler** — `npm install -g @midnight-ntwrk/compact-compiler`
- **Midnight Lace Wallet** browser extension (for the UI)
- **Preprod NIGHT tokens** — from the Midnight faucet

---

## Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd demo

# 2. Install all workspace dependencies
npm install
```

---

## Build

```bash
# Build API layer
cd api && npm install && npm run build && cd ..

# Build CLI
cd notetaker-cli && npm install && npm run build && cd ..

# Build UI (targets preprod by default)
cd notetaker-ui && npm install && npm run build && cd ..
```

Or build everything from root:
```bash
npm install
cd api && npm run build && cd ..
cd notetaker-cli && npm run build && cd ..
cd notetaker-ui && npm run build && cd ..
```

---

## Compile

Compile the Compact contract (required before building the TypeScript layers):

```bash
cd contract
npm install
npm run compact
```

This runs:
```bash
compact compile src/notetaker.compact ./src/managed/notetaker
```

Then build the contract TypeScript layer:
```bash
npm run build
```

---

## Run Proof Server

The proof server is required for generating ZK proofs locally:

```bash
docker pull midnightnetwork/proof-server
docker run -p 6300:6300 midnightnetwork/proof-server
```

---

## Manual Deployment

Deployment is intentionally skipped in this repo — you must deploy the contract manually.

**Steps:**

1. Ensure your proof server is running.
2. Ensure you have NIGHT tokens on preprod (use the faucet).
3. Run the deployment command:

```bash
NODE_OPTIONS="--max-old-space-size=12288" npm run deploy -- --network preprod
```

Or use the CLI directly:

```bash
cd notetaker-cli
npm run preprod-remote
```

When prompted, choose option `1` (Deploy a new notetaker contract) and note the contract address printed in the logs.

---

## After Deployment

Once you have deployed the contract and have the address, the only remaining manual steps are:

1. Deploy the Compact contract (see above).
2. Copy the deployed contract address.
3. Replace every occurrence of:

```
<YOUR_DEPLOYED_CONTRACT_ADDRESS>
```

in the following files:
- `README.md` — the Contract Address table
- `notetaker-ui/src/main.tsx` — uncomment and fill `CONTRACT_ADDRESS`

No additional coding is required.

---

## Environment Variables

| Variable | File | Description |
|----------|------|-------------|
| `VITE_NETWORK_ID` | `notetaker-ui/.env.preprod` | Network ID (`preprod` or `preview`) |
| `VITE_LOGGING_LEVEL` | `notetaker-ui/.env.preprod` | Log level (`trace`, `info`, `error`) |
| `CONTRACT_ADDRESS` | `notetaker-ui/src/main.tsx` | Deployed contract address (fill after deploy) |

---

## Screenshots

_Add screenshots here after deployment._

| Screen | Screenshot |
|--------|-----------|
| Home / Empty slot | `<!-- add screenshot -->` |
| Note written | `<!-- add screenshot -->` |
| Update title | `<!-- add screenshot -->` |
| Delete confirmation | `<!-- add screenshot -->` |

---

## Initial Idea

_Describe your original project idea here._

---

## Troubleshooting

**`Could not find Midnight Lace wallet. Extension installed?`**
→ Install the Midnight Lace wallet browser extension and ensure it is enabled for the current network.

**`Application is not authorized`**
→ Open the Midnight Lace wallet and approve the connection request for this DApp.

**Proof generation is slow**
→ This is expected. ZK proof generation can take 30–90 seconds depending on hardware. Ensure Docker is running and the proof server is accessible on port 6300.

**`compact` command not found**
→ Run `npm install -g @midnight-ntwrk/compact-compiler` then verify with `compact --version`.

**Build fails with `managed/notetaker` not found**
→ Compile the contract first: `cd contract && npm run compact`

**Out of memory during build**
→ Use `NODE_OPTIONS="--max-old-space-size=12288"` prefix before the build command.

**No NIGHT balance in wallet**
→ Visit the Midnight preprod faucet: https://midnight-tmnight-preprod.nethermind.dev/
