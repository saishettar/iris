# Iris frontend

Vite + React + TypeScript + React Router + shadcn/ui (Radix primitives, Tailwind v4).

See the repo root [`README.md`](../README.md) and
[`observability_platform_scope.md`](../observability_platform_scope.md) for
project context.

## Dev

```
npm install
npm run dev
```

Set `VITE_API_BASE_URL` (see `.env.example`) to point at the collector;
defaults to `http://localhost:4318`.

## Adding shadcn/ui components

```
npx shadcn@latest add <component>
```
