import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const firstRelease = args.includes('--first-release')

function run(cmd) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

// Guard: abort if working tree is dirty
const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim()
if (status) {
  console.error('Working tree is dirty. Commit or stash changes before releasing.\n')
  console.error(status)
  process.exit(1)
}

// Bump version, update CHANGELOG, commit, tag
const bumpArgs = ['npx commit-and-tag-version']
if (dryRun) bumpArgs.push('--dry-run')
if (firstRelease) bumpArgs.push('--first-release')
run(bumpArgs.join(' '))

if (dryRun) {
  console.log('\nDry run complete. No build performed.')
  process.exit(0)
}

// Clean output directories
for (const dir of ['out', 'dist']) {
  const target = resolve(root, dir)
  console.log(`\nCleaning ${dir}/`)
  rmSync(target, { recursive: true, force: true })
}

// Build and package
run('pnpm dist')

console.log('\nRelease complete!')
