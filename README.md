# Toolset

Opinionated CLI to bootstrap JS/TS project tooling fast

It helps you install and initialize:

- `husky + lint-staged + commitlint`
- `oxlint + oxfmt`
- `release-it + conventional changelog`

> [!IMPORTANT]
> This is an opinionated tool: it applies predefined defaults and file changes designed for a specific workflow.

## Why

When starting a new project, wiring up quality and release tooling usually means repeating the same setup steps.  
`@clctv/toolset` turns that into a guided CLI that:

- detects your package manager automatically
- installs the required dev dependencies
- writes the necessary config files
- initializes selected tools with sensible defaults

## Features

- Interactive terminal UI powered by `@clack/prompts`
- Package manager detection (`npm`, `pnpm`, `yarn`, `bun`, `deno`)
- Multi-select setup flow so you only install what you need
- Tool-specific initialization logic for each selected option

## Installation

```bash
npm i -g @clctv/toolset
```

## Usage

Run the CLI in your project root:

```bash
toolset
```

You will be prompted to choose which tool groups to set up.

### What each option does

#### husky + lint-staged + commitlint

- installs:
  - `husky`
  - `lint-staged`
  - `@commitlint/cli`
  - `@commitlint/config-conventional`
- initializes Husky hooks
- writes:
  - `.husky/pre-commit` (`lint-staged`)
  - `.husky/commit-msg` (`commitlint --edit "$1"`)
- updates `package.json` with `commitlint` config

#### oxlint + oxfmt

- installs:
  - `oxlint`
  - `oxfmt`
- runs init commands for both
- if `lint-staged` exists, updates `package.json` with:
  - `oxlint --fix` for JS/TS files
  - `oxfmt --no-error-on-unmatched-pattern` fallback formatting
- writes `.vscode/settings.json` with Oxc formatter defaults

#### release-it

- installs:
  - `release-it`
  - `@release-it/conventional-changelog`
- updates `package.json`:
  - `scripts.release`
  - `publishConfig.access`
  - `release-it` config (build hook, GitHub release, changelog plugin)
- writes `.npmrc` with npm registry

> [!NOTE]
> The CLI updates project files in the current working directory.  
> Run it from the root of the project you want to configure.

## Requirements

- Node.js 18+
- A JavaScript/TypeScript project with `package.json`
