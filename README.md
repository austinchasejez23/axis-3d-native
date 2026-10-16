# AXIS 3D Modeling

A mobile-first 3D modeling app built with React and Vite.

## Run locally

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Start the dev server: `npm run dev`.
4. Open the URL printed in the terminal.

## Build

`npm run build` writes the production bundle to `dist/`. Preview it with `npm run preview`.

## Lint

`npx eslint src`

## Standalone test build

This branch runs without Base44 at startup or during modeling. The splash opens
the local Library, and geometry is stored in IndexedDB with an index in
localStorage. Models, tools, gestures and interface remain in the local app.

Accounts, sign-in, subscriptions, checkout, promotions and cloud backups are
disabled. This build grants **no Pro entitlements**; the existing Free project,
triangle and tool restrictions still apply. You cannot manage or delete any
production account through this test build.

Reference images are read directly from the selected device file and saved
inside local project data. Existing projects with remote reference-image URLs
may still need their original remote image source to display.

To verify isolation and run modeling regression tests:

```sh
npm ci
npm run test:standalone
for test in scripts/*-regression.mjs; do node "$test"; done
npm run lint
npm run typecheck
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The Android application ID has **not** been changed. Debug APKs retain the
existing `.debug` application ID suffix. **Do not publish this test branch as
a release or merge without explicit review.**
