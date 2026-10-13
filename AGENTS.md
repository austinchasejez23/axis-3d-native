# AGENTS.md

## Project Context

This is the AXIS 3D Modeling app, a React + Vite single-page app. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup.

## Project Layout

- `src/pages/`: route-level screens (splash, library, modeler, account pages).
- `src/components/modeler/`: modeling panels, tool grids, and toolbars.
- `src/lib/`: scene engine (`SceneManager.js`), materials, painting, guides, and shared helpers.
- `src/api/`: the app's backend client.
- `vite.config.js`: Vite config and plugins.

## Working Rules

- Run `npm run dev` for local development and `npm run build` before finishing a change.
- Run `npx eslint <changed files>` and fix errors before finishing a change.
- Reuse existing components, theme values, and client patterns before adding new ones.
