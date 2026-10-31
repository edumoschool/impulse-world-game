# Local Development

## Ports

Host ports avoid common defaults, so this stack can run beside other local services.

| Service    | Port               |
| ---------- | ------------------ |
| PostgreSQL | 5544               |
| Redis      | 6380               |
| MinIO      | 9100, console 9101 |
| Mailpit    | SMTP 1026, UI 8026 |
| API        | 4000               |
| Web        | 3000               |

## With Docker

```bash
pnpm infra:up
```

## Without Docker

`pnpm infra:native` runs real PostgreSQL 18 (from `embedded-postgres`) and Valkey 9 compiled to WebAssembly (from `valkey-wasm`), with data in `.local/`. It keeps running in its terminal.

It does not provide object storage or mail. Password reset and invitation emails will fail to send, and the failure is logged. Use Docker to exercise those.

Docker Desktop needs hardware virtualization. If `wsl --status` reports that virtualization is not enabled, turn it on in the machine's firmware settings, or use the native stack.

Valkey here is a development stand-in. It runs in one thread inside Node, so it says nothing about production performance. Compose and CI use real Redis.

## Database roles

`infrastructure/compose/postgres/01-roles-and-databases.sql` creates the three roles and both databases. The passwords in that file are for local use only.
