#!/usr/bin/env node
// Pre-release guard: dry-run the develop → main merge WITHOUT touching the
// working tree, and fail if it would conflict. Run before opening a
// `develop → main` ("Create a merge commit") release PR.
import { spawnSync } from 'node:child_process'

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8' })
  return { status: res.status, stdout: (res.stdout ?? '').trim(), stderr: (res.stderr ?? '').trim() }
}

const branch = git(['branch', '--show-current']).stdout
if (!branch) {
  console.error('Detached HEAD — run this from develop before opening the release PR.')
  process.exit(2)
}

const fetch = git(['fetch', 'origin', 'main'])
if (fetch.status !== 0) {
  console.error(`Could not fetch origin/main:\n${fetch.stderr}`)
  process.exit(2)
}

// A clean 3-way merge means the release connects without conflicts.
const merge = git(['merge-tree', '--write-tree', '--messages', 'origin/main', branch])
if (merge.status === 0) {
  console.log(`OK: ${branch} merges into main cleanly — safe to open the release PR.`)
  process.exit(0)
}

console.error(`CONFLICT: merging ${branch} into origin/main would conflict.`)
console.error('Fix first: git switch develop && git merge origin/main (resolve, commit, push).')
const detail = (merge.stderr || merge.stdout || '').split('\n')
for (const line of detail.slice(0, 40)) console.error(line)
process.exit(1)