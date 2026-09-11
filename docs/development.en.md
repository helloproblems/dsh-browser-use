# Development guide

[中文](development.md) | English

This repository follows the TypeScript layout and source/artifact separation in the [DeepSeek Harness development guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md). Harness-specific Typert generation, website builds, translation merge drivers, and vendor hooks do not apply to this independent plugin bundle.

## Setup

Use Node.js within the declared engines range and Corepack with the pinned pnpm 11.7.0. Keep the checkout, dependencies, and toolchain in the same operating system; install dependencies separately for Windows and WSL.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
```

## TypeScript projects

| Configuration | Responsibility |
|---|---|
| Root tsconfig.json | Solution entry referencing Host and Client; forms no program. |
| tsconfig.base.json | Strict compiler options and workspace source aliases; no files or include. |
| tsconfig.base.client.json | React JSX and DOM libraries, without automatically included Node types. |
| tsconfig.host.json | Host tests and Vitest configuration, referencing four Host package projects. |
| tsconfig.client.json | Client tests, referencing the Domain Client project. |
| Package tsconfig.json | Host compilation, or a solution-only root for Domain. |
| Domain tsconfig.host.json / tsconfig.client.json | Separate Host and Client leaves with independent incremental records. |

Host and Client compile independently so their Cordis Context augmentations do not share a program. Aggregates reference the matching Domain leaf directly. Host tests exclude tests/client; Client tests belong under that directory.

Use package names across packages and .ts extensions in local imports. Vitest derives workspace aliases from tsconfig.base.json, so tests execute source without requiring bundles. Static checks must not resolve workspace imports through built lib files.

Typecheck traverses project references and emits package JavaScript, declarations, and maps under lib/types; aggregate test projects use noEmit. Build cleans runtime outputs, compiles both faces, then bundles the emitted JavaScript into lib/index.js and the Domain loader module lib/client.js. Package exports select declarations through types and runtime bundles through default. Clean removes package lib directories and aggregate .cache/typecheck records.

## Automatic builds and hot reload

Run `pnpm dev` in the plugin repository (equivalent to `pnpm build:watch` or `pnpm build --watch`), then run `pnpm dsh web` in a second terminal in the deepseek-harness repository. Wait for the initial plugin build before starting DSH.

Watch mode performs one clean TypeScript build at startup, then runs `tsc -b --watch` and five esbuild watchers. Source edits update `lib/types`, which feeds the four Host `lib/index.js` bundles and the Domain `lib/client.js` loader module. Subsequent builds preserve lib directories and atomically replace runtime files only when their contents change. Temporary files live in `.cache/build`, outside the HMR roots. Ctrl+C stops both the compiler and the bundle watchers.

Enable `hmr` in the DSH user patch and include all four package lib directories in `config.root`; enable Web `client-hmr` as well. See the [Chinese guide](development.md#自动构建与热加载) for a Windows patch example and adjust its paths to your checkout. `pnpm build` remains a one-shot build. Do not run clean or build concurrently with watch. Compilation errors are reported in the terminal and watch resumes after a fix; an initial TypeScript compilation failure exits and requires restarting after the fix.

## Validation

Run checks for the changed surface. Source checks need no prior build:

```sh
corepack pnpm clean
corepack pnpm test
corepack pnpm typecheck
```

Changes to package exports, declarations, or bundling also require:

```sh
corepack pnpm build
node --test scripts/tests/build-watch.mjs
corepack pnpm pack --dry-run
corepack pnpm pack:bundle
corepack pnpm verify:bundle
```

Default tests include real MCP catalog discovery without launching a browser. Browser interaction tests opt in through EDGE_SMOKE=1, CHROME_SMOKE=1, and BROWSER_SWITCH_SMOKE=1 and require the relevant browsers. Report skipped checks and the actual validation platform.

Bundle packing uses a unique system temporary directory so pnpm cannot collect dependencies from the checkout's ancestor node_modules. The tarball includes the four workspace packages and their declarations, plus both development guides. External runtime dependencies and host peers are also declared on the bundle root because installers do not traverse bundled package manifests. Conflicting ranges fail packing. The temporary directory is removed on success or failure, and the tarball is written under .artifacts/pack.

verify:bundle installs that tarball in a fresh temporary directory using the web profile's hoisted layout with automatic peer installation disabled, supplies the declared host peers, imports all four plugins, and checks both MCP backend dependencies without launching a browser. It requires registry access or a populated pnpm cache.

After changing the Windows path picker, run `node --test scripts/tests/windows-picker-smoke.mjs` on an interactive desktop. It opens real file and folder dialogs, checks visibility, foreground activation, selection, and cancellation, and closes the test dialogs automatically.

## Code conventions

Keep strict checks enabled, including unchecked indexing, exact optional properties, unused declarations, and explicit overrides. Validate Remote JSON before using it in the editor. Keep typed in-process calls typed rather than introducing any. Register Cordis contributions through effects with disposers; providers own browser resources.

Update the owning README and exported API JSDoc when public behavior changes. Use FIXME for release blockers, TODO for near-term work, and XXX for deferred possibilities. End text files with one newline and run git diff --check before handing off changes.
