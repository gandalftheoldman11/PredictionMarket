# Backend and sensitive material excluded

The archive deliberately omits:

- `app/api/**`, `app/docs/**`, and `app/openapi.json/**` route handlers.
- Server-side exchange queries, order processing, admin authorization, resolution, settlement, custody, and wallet persistence.
- Database schema/baselines and local data.
- `engine/**`, `contracts/**`, server entry points, proxy code, Docker/Compose, Render/deployment configuration, and operational scripts.
- Backend, integration, deployment, and contract tests.
- `.git`, `.next`, `node_modules`, test results, local-chain state, logs, and temporary artifacts.
- Every environment file, including `.env`, `.env.local`, and `.env.e2e.local`.
- Package manifests from the full application because they mix frontend and backend dependencies/scripts.

The selected files under `lib/client/` and `lib/chain/` are browser-side interaction/signing support required to understand the UI contracts. They contain public ABI/typed-data definitions and no embedded credentials or private-key values.

The archive is not a production deployment bundle and should not be used as one.

