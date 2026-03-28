<p align="center">
  <img src="https://nuclyr.cloud/logo.svg" alt="nuclyr" height="40" />
</p>
<p align="center">
  <strong>@nuclyr/sdk</strong> — TypeScript SDK for the Nuclyr multi-cloud platform
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@nuclyr/sdk"><img src="https://img.shields.io/npm/v/@nuclyr/sdk?color=00FFB2&labelColor=06080D&label=npm" alt="npm" /></a>
  <a href="https://github.com/nuclyr/sdk-ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-00FFB2?labelColor=06080D" alt="MIT" /></a>
  <a href="https://docs.nuclyr.cloud">docs</a>
</p>

---

Route storage, compute, and queue workloads across AWS, GCP, and Azure — the SDK handles provider selection, INR billing, and DPDP compliance automatically.

## Install

```bash
npm install @nuclyr/sdk
# or
pnpm add @nuclyr/sdk
```

## Quick start

```typescript
import { NuclyrClient } from '@nuclyr/sdk';

const client = new NuclyrClient({ apiKey: process.env.NUCLYR_API_KEY });

// Upload a file — Nuclyr picks the cheapest compliant bucket automatically
const result = await client.storage.putObject({
  bucket: 'my-bucket',
  key: 'uploads/photo.jpg',
  body: fileBuffer,
});

console.log(`Stored on ${result.provider} — saved ₹${result.savedInr} vs baseline`);
```

## Features

- **Automatic routing** — cheapest or lowest-latency provider, per operation
- **INR billing** — all costs in ₹, GST invoices, UPI/Razorpay
- **DPDP compliance** — data residency enforcement, audit logs
- **Type-safe** — generated from Protobuf contracts, full TypeScript types
- **gRPC transport** — built on `@connectrpc/connect` for browser + Node

## Services

| Service | Methods |
|---------|---------|
| `client.storage` | `putObject`, `getObject`, `deleteObject`, `listObjects` |
| `client.compute` | `invokeFunction` |
| `client.queue` | `sendMessage`, `receiveMessages`, `deleteMessage` |

## Links

- [Dashboard](https://app.nuclyr.cloud) — manage accounts, API keys, billing
- [Docs](https://docs.nuclyr.cloud) — full API reference
- [Status](https://status.nuclyr.cloud) — uptime

## License

MIT © [Nuclyr](https://nuclyr.cloud)
