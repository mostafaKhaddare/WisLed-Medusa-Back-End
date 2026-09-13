# AGENTS.md

## Project overview
- This repository is a Medusa v2 commerce backend built in TypeScript for Node.js 20.
- The project uses pnpm as the package manager and follows Medusa module/workflow conventions rather than a plain Express app.
- The main runtime configuration lives in `medusa-config.ts`; the app entry points are defined in `package.json`.
- Preserve Medusa architecture and module patterns unless a change is explicitly required for deployment safety.

## Core commands
- Install dependencies: `pnpm install`
- Run in development: `pnpm run dev`
- Production build: `pnpm run build`
- Start server: `pnpm run start`
- Database migration: `pnpm run db:migrate`
- Sync links: `pnpm run db:sync-links`
- Seed database: `pnpm run db:seed`
- Create admin user: `pnpm run add:admin`
- Test suite: `pnpm exec jest` or `npx jest`

## Repository structure
- `src/api/`: API routes, middleware, validation, and custom endpoints.
- `src/modules/`: custom Medusa modules, including business services and models.
- `src/workflows/`: Medusa workflows and workflow step orchestration.
- `src/links/`: database link definitions between Medusa entities and custom modules.
- `src/scripts/`: maintenance and bootstrap scripts.
- `src/admin/`: Medusa admin customizations and widgets.
- `src/subscribers/`: event subscribers when app-level event handling is needed.
- `integration-tests/`: HTTP integration tests for API behavior.
- `tests/unit/`: unit tests for workflow and module logic.

## Coding conventions
- Follow the Medusa patterns already in the repo: use `MedusaRequest` / `MedusaResponse`, `MedusaError`, and Medusa workflows for business logic.
- Prefer custom Medusa services and workflow steps over ad hoc Express controllers.
- Keep new endpoints consistent with the existing route structure under `src/api`.
- Validate request payloads early and return clear Medusa errors instead of generic failures.
- For custom modules, follow the existing `Module(...)` exports and `MedusaService`-based implementations.
- Do not rewrite working Medusa logic into generic Node patterns unless there is a clear and necessary production reason.

## Configuration and environment
- Required runtime env values include:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `JWT_SECRET`
  - `COOKIE_SECRET`
  - `MEDUSA_BACKEND_URL`
  - `STORE_CORS`
  - `ADMIN_CORS`
  - `AUTH_CORS`
- Optional integrations are gated in `medusa-config.ts` and are enabled only when their env vars are present:
  - Stripe: `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`
  - DigitalOcean Spaces / S3: `DO_SPACE_*`
  - Resend email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
  - Index engine: `MEDUSA_FF_INDEX_ENGINE`
- Do not hardcode localhost database URLs, Redis URLs, or admin credentials into production configuration.
- Respect the platform-provided `PORT`; do not force a local port in code or startup scripts.

## Medusa config guardrails
- `medusa-config.ts` is the source of truth for Medusa runtime configuration.
- Keep optional providers conditional so local development can work without forcing production-only features.
- Keep CORS entries as explicit environment-driven values rather than broad wildcard allowances for production.
- Keep `JWT_SECRET` and `COOKIE_SECRET` secrets outside the repo and never commit `.env` files.
- Prefer safe, explicit configuration for PostgreSQL and Redis over default local assumptions.

## Render / production deployment notes
- The app is designed to run with the environment variables supplied by the host platform.
- Render should provide the database and Redis URLs; do not assume `localhost` is valid in production.
- Use the Medusa build/start flow from `package.json` instead of custom startup commands unless the host requires a specific wrapper.
- Always verify that the server binds to the platform-provided port and not a fixed local port.
- Health-check endpoints should remain lightweight and safe for platform probes.

## Security and data handling
- Never commit credentials or secrets: `.env`, `.env.*`, `secrets*`, private keys, or database dumps must stay out of Git.
- Do not log passwords, tokens, API keys, JWTs, payment secrets, or customer secrets.
- Treat all external URLs, S3 endpoints, and email provider credentials as sensitive configuration.
- Keep frontend origins explicit and production-ready; do not enable wildcard CORS in a live storefront deployment.

## Quality bar for changes
- Prefer small, targeted changes that match the repo’s existing Medusa conventions.
- If a fix is needed for deployment safety, update configuration and documentation without broad rewrites.
- Validate using the project’s existing commands before claiming a change is safe.
- Preserve established custom module behavior, especially in the wishlist and media integrations.

## Helpful files to read first
- `package.json`
- `medusa-config.ts`
- `src/api/middlewares.ts`
- `src/modules/wishlist/index.ts`
- `src/modules/product-media/index.ts`
- `src/api/health/route.ts`
- `Dockerfile`
- `.gitignore`

## Notes for future AI agents
- This repo has a custom wishlist module and custom product media module. Treat those as domain-specific extensions, not generic app code.
- The backend is production-aware but still requires the correct environment values and deployment host configuration.
- Keep changes minimal, safe, and Medusa-native to avoid breaking ecommerce workflows.
