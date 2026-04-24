import { execSync } from 'node:child_process'
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

const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim()
if (status) {
  console.error('Working tree is dirty. Commit or stash changes before releasing.\n')
  console.error(status)
  process.exit(1)
}

const bumpArgs = ['pnpm exec commit-and-tag-version']
if (dryRun) bumpArgs.push('--dry-run')
if (firstRelease) bumpArgs.push('--first-release')
run(bumpArgs.join(' '))

if (dryRun) {
  console.log('\nDry run complete. No commit or push performed.')
  process.exit(0)
}

run('git push --follow-tags')

console.log('\nTag pushed. CI is building release assets — check https://github.com/terebentina/mongo-buddy/actions')
