#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { cancel, intro, isCancel, log, multiselect, outro, spinner } from '@clack/prompts'
import { resolveCommand } from 'package-manager-detector/commands'
import { detect } from 'package-manager-detector/detect'
import colors from 'picocolors'

type ToolId = 'git-hooks' | 'oxc' | 'release'
type PackageManagerAgent = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno'

type SetupContext = {
  agent: PackageManagerAgent
}

type SetupTool = {
  id: ToolId
  label: string
  hint: string
  dependencies: string[]
  setup: (context: SetupContext) => Promise<void>
}

const supportedTools: SetupTool[] = [
  {
    id: 'git-hooks',
    label: 'husky + lint-staged + commitlint',
    hint: 'Git hooks with staged lint and commit message lint',
    dependencies: ['husky', 'lint-staged', '@commitlint/cli', '@commitlint/config-conventional'],
    setup: async (context) => {
      await runWithAgent(context.agent, 'execute-local', ['husky', 'init'])
      await setupLintStaged()
      await setupCommitlint()
    },
  },
  {
    id: 'oxc',
    label: 'oxlint + oxfmt',
    hint: 'Initialize Oxlint and Oxfmt, and configure editor + lint-staged',
    dependencies: ['oxlint', 'oxfmt'],
    setup: async (context) => {
      await runWithAgent(context.agent, 'execute-local', ['oxlint', '--init'])
      await runWithAgent(context.agent, 'execute-local', ['oxfmt', '--init'])
      await setupOxc()
    },
  },
  {
    id: 'release',
    label: 'release-it',
    hint: 'Setup release-it and conventional changelog',
    dependencies: ['release-it', '@release-it/conventional-changelog'],
    setup: async (context) => {
      await setupRelease(context.agent)
    },
  },
]

const supportedToolMap = new Map<ToolId, SetupTool>(supportedTools.map((tool) => [tool.id, tool]))

function uniqueDependencies(tools: SetupTool[]) {
  const dependencies: string[] = []

  for (const tool of tools) {
    for (const dependency of tool.dependencies) {
      if (!dependencies.includes(dependency)) {
        dependencies.push(dependency)
      }
    }
  }

  return dependencies
}

function runSilent(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    let stderrOutput = ''
    const child = spawn(command, args, {
      stdio: 'pipe',
      cwd: process.cwd(),
      env: process.env,
    })

    child.stderr?.on('data', (chunk) => {
      stderrOutput += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      const detail = stderrOutput.trim()
      reject(
        new Error(
          detail
            ? `Command failed: ${command} ${args.join(' ')}\n${detail}`
            : `Command failed: ${command} ${args.join(' ')}`,
        ),
      )
    })
  })
}

async function setupLintStaged() {
  const preCommitPath = join(process.cwd(), '.husky', 'pre-commit')
  writeFileSync(preCommitPath, 'lint-staged\n', 'utf8')
}

async function setupCommitlint() {
  const commitMsgPath = join(process.cwd(), '.husky', 'commit-msg')
  const command = 'commitlint --edit "$1"'
  writeFileSync(commitMsgPath, `${command}\n`, 'utf8')
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJsonContent = readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent) as Record<string, unknown>

  packageJson.commitlint = {
    extends: ['@commitlint/config-conventional'],
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
}

async function setupOxc() {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJsonContent = readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent) as Record<string, unknown>
  const dependencies = (packageJson.dependencies ?? {}) as Record<string, unknown>
  const devDependencies = (packageJson.devDependencies ?? {}) as Record<string, unknown>
  const hasLintStaged = Boolean(dependencies['lint-staged'] || devDependencies['lint-staged'])

  if (hasLintStaged) {
    packageJson['lint-staged'] = {
      '*.{js,jsx,ts,tsx,mjs,cjs}': 'oxlint --fix',
      '*': 'oxfmt --no-error-on-unmatched-pattern',
    }
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  }

  const vscodeDirPath = join(process.cwd(), '.vscode')
  if (!existsSync(vscodeDirPath)) {
    mkdirSync(vscodeDirPath, { recursive: true })
  }

  const vscodeSettingsPath = join(vscodeDirPath, 'settings.json')
  const vscodeSettings = {
    'editor.codeActionsOnSave': {
      'source.fixAll.oxc': 'always',
    },
    'oxc.fmt.configPath': '.oxfmtrc.json',
    'editor.defaultFormatter': 'oxc.oxc-vscode',
    'editor.formatOnSave': true,
  }
  writeFileSync(vscodeSettingsPath, `${JSON.stringify(vscodeSettings, null, 2)}\n`, 'utf8')
}

async function setupRelease(agent: PackageManagerAgent) {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const packageJsonContent = readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent) as Record<string, unknown>
  const scripts = (packageJson.scripts ?? {}) as Record<string, unknown>
  scripts.release = 'release-it --only-version'
  packageJson.scripts = scripts
  packageJson.publishConfig = {
    access: 'public',
  }
  const buildCommand = resolveCommand(agent, 'run', ['build'])
  const beforeInitHook = buildCommand
    ? `${buildCommand.command} ${buildCommand.args.join(' ')}`
    : `${agent} run build`
  packageJson['release-it'] = {
    hooks: {
      'before:init': [beforeInitHook],
    },
    git: {
      commitMessage: 'chore: release v${version}',
    },
    github: {
      release: true,
      releaseName: 'v${version}',
      web: true,
    },
    plugins: {
      '@release-it/conventional-changelog': {
        preset: 'angular',
        infile: 'CHANGELOG.md',
        ignoreRecommendedBump: true,
      },
    },
  }
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

  const npmrcPath = join(process.cwd(), '.npmrc')
  writeFileSync(npmrcPath, 'registry=https://registry.npmjs.org\n', 'utf8')
}

async function runWithAgent(
  agent: PackageManagerAgent,
  action: 'add' | 'execute-local',
  args: string[],
) {
  const resolved = resolveCommand(agent, action, args)
  if (!resolved) {
    throw new Error(`Unsupported command resolution: ${agent} ${action}`)
  }

  await runSilent(resolved.command, resolved.args)
}

async function detectPackageManager() {
  const detected = await detect()
  return (detected?.agent as PackageManagerAgent | undefined) ?? 'npm'
}

async function main() {
  console.log('')
  intro(colors.cyan(colors.bold("Let's setup your project!")))

  const packageManager = await detectPackageManager()

  log.info(`Detected package manager: ${packageManager}`)

  const selected = await multiselect({
    message: 'Select tools to install and initialize',
    options: supportedTools.map((tool) => ({
      value: tool.id,
      label: tool.label,
      hint: tool.hint,
    })),
    required: false,
  })

  if (isCancel(selected)) {
    cancel('Cancelled')
    process.exit(0)
  }

  if (selected.length === 0) {
    outro('No tools selected')
    return
  }

  const selectedTools = selected
    .map((toolId) => supportedToolMap.get(toolId as ToolId))
    .filter((tool): tool is SetupTool => Boolean(tool))

  const dependencies = uniqueDependencies(selectedTools)

  if (dependencies.length > 0) {
    const installStep = spinner()
    installStep.start(`Installing dependencies: ${dependencies.join(', ')}`)
    try {
      await runWithAgent(packageManager, 'add', ['-D', ...dependencies])
      installStep.stop('Dependencies installed')
    } catch (error) {
      installStep.error('Dependencies installation failed')
      throw error
    }
  }

  for (const tool of selectedTools) {
    const setupStep = spinner()
    setupStep.start(`Initializing ${tool.label}`)
    try {
      await tool.setup({ agent: packageManager })
      setupStep.stop(`${tool.label} initialized`)
    } catch (error) {
      setupStep.error(`${tool.label} initialization failed`)
      throw error
    }
  }

  outro('Done')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error occurred'
  cancel(message)
  process.exit(1)
})
