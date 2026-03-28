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
import { Nuclyr } from '@nuclyr/sdk';

const nuclyr = new Nuclyr({
  apiUrl: 'https://app.nuclyr.cloud',
  apiKey: process.env.NUCLYR_API_KEY!,
});

// Upload — Nuclyr picks the cheapest compliant bucket automatically
const meta = await nuclyr.storage.upload('my-bucket', 'uploads/photo.jpg', fileBuffer);
console.log(`Stored on ${meta.provider} in ${meta.region}`);

// Invoke a function across clouds
const job = await nuclyr.compute.run('resize-image', payload);
console.log(`Ran on ${job.provider} in ${job.durationMs}ms`);

// Publish a message
const msg = await nuclyr.queue.publish('orders', Buffer.from(JSON.stringify(order)));
console.log(`Queued on ${msg.provider} — id ${msg.messageId}`);
```

## Features

- **Automatic routing** — cheapest or lowest-latency provider, per operation
- **INR billing** — all costs in ₹, GST invoices, UPI/Razorpay
- **DPDP compliance** — data residency enforcement, audit logs
- **Type-safe** — full TypeScript types, zero `any`
- **Dual transport** — REST (`/api/*`) today; gRPC-Web (ConnectRPC) in Phase 2

## Services

| Service | Methods |
|---------|---------|
| `nuclyr.storage` | `upload` `download` `delete` `list` `metadata` `presign` |
| `nuclyr.compute` | `run` `getStatus` `cancel` `listJobs` `getLogs` |
| `nuclyr.queue`   | `publish` `subscribe` `ack` |

## Storage

```typescript
// Upload
const meta = await nuclyr.storage.upload('bucket', 'key', content, {
  contentType: 'image/png',
  strategy: 'cost',          // 'cost' | 'latency' | 'compliance'
  dataResidency: 'india',
  tags: { env: 'prod' },
});

// Download
const { data, meta } = await nuclyr.storage.download('bucket', 'key');

// Presigned URL (direct browser upload)
const url = await nuclyr.storage.presign('bucket', 'key', 'put', 3600);

// List with pagination
const { objects, nextPageToken } = await nuclyr.storage.list('bucket', { prefix: 'uploads/' });

// Delete
await nuclyr.storage.delete('bucket', 'key');

// Metadata only
const meta = await nuclyr.storage.metadata('bucket', 'key');
```

## Compute

```typescript
// Run a function (sync — waits for result)
const job = await nuclyr.compute.run('my-fn', payload, {
  strategy: 'latency',
  memoryMb: 512,
  timeoutSeconds: 30,
  env: { STAGE: 'prod' },
});

// Poll status of an async job
const status = await nuclyr.compute.getStatus(jobId);

// Stream logs
const logs = await nuclyr.compute.getLogs(jobId, { tailLines: 50 });

// List recent jobs
const { jobs } = await nuclyr.compute.listJobs({ functionName: 'my-fn', stateFilter: 'completed' });

// Cancel a running job
await nuclyr.compute.cancel(jobId);
```

## Queue

```typescript
// Publish
const result = await nuclyr.queue.publish('orders', Buffer.from(JSON.stringify(order)), {
  attributes: { type: 'new-order' },
  strategy: 'cost',
});

// Subscribe (async iterator — requires gRPC-Web; falls back to long-poll over REST)
for await (const msg of nuclyr.queue.subscribe('orders', 'orders-sub')) {
  await processOrder(msg.payload);
  await nuclyr.queue.ack(msg.messageId, 'orders-sub');
}

// Ack individually
await nuclyr.queue.ack(messageId, subscriptionName);
```

## Configuration

```typescript
const nuclyr = new Nuclyr({
  apiUrl: 'https://app.nuclyr.cloud',  // required
  apiKey: process.env.NUCLYR_API_KEY!, // required
  defaultStrategy: 'cost',             // optional — applied to all ops unless overridden
});
```

## Publish (maintainers)

```bash
# Set your npm token (from .env or npm dashboard → Access Tokens)
export NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxx

# From sdk/ts/
pnpm version patch   # or minor / major
pnpm publish         # runs build + typecheck automatically via prepublishOnly
```

The package is scoped to the `@nuclyr` npm organisation. Token must have
**Read and Write** access to the `nuclyr` org.

## Links

- [Dashboard](https://app.nuclyr.cloud) — manage accounts, API keys, billing
- [Docs](https://docs.nuclyr.cloud) — full API reference
- [Status](https://status.nuclyr.cloud) — uptime

## License

MIT © [Nuclyr](https://nuclyr.cloud)
