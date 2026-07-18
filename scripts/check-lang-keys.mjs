#!/usr/bin/env node
/**
 * i18n key-set checker.
 *
 * Verifies that every language carries the same translation keys, so a missing
 * translation fails lint instead of silently falling back to English.
 *
 * Two layouts are supported:
 *
 *   --blocks <dir>  LocalizedStrings files (admin/frontend): each *.ts file
 *                   contains `fr: {...}, en: {...}, es: {...}, hr: {...}`
 *                   blocks whose key sets must match REQUIRED_LANGS.
 *
 *   --files <dir>   One flat object per language file (backend/mobile):
 *                   en.ts is the baseline; fr.ts/es.ts/hr.ts must carry
 *                   exactly the same keys.
 *
 * Usage: node check-lang-keys.mjs (--blocks|--files) <dir> [ignored-file ...]
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REQUIRED_LANGS = ['en', 'fr', 'es', 'hr']

// top-level language block start, e.g. `  fr: {`
const BLOCK_START = /^ {2}([a-z]{2}): \{\s*$/
// top-level block end, e.g. `  },`
const BLOCK_END = /^ {2}\},?\s*$/
// a translation key at block level (4 spaces in blocks mode, 2 in files mode)
const BLOCK_KEY = /^ {4}([A-Z0-9_]+):/
const FILE_KEY = /^ {2}([A-Z0-9_]+):/

const errors = []

const diff = (a, b) => [...a].filter((k) => !b.has(k))

const compare = (label, lang, keys, baselineLang, baseline) => {
  const missing = diff(baseline, keys)
  const extra = diff(keys, baseline)
  if (missing.length > 0) {
    errors.push(`${label}: '${lang}' is missing keys present in '${baselineLang}': ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    errors.push(`${label}: '${lang}' has keys absent from '${baselineLang}': ${extra.join(', ')}`)
  }
}

const parseBlocks = (file) => {
  const blocks = {}
  let current = null
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (current === null) {
      const start = line.match(BLOCK_START)
      if (start) {
        current = start[1]
        blocks[current] = new Set()
      }
    } else if (BLOCK_END.test(line)) {
      current = null
    } else {
      const key = line.match(BLOCK_KEY)
      if (key) {
        blocks[current].add(key[1])
      }
    }
  }
  return blocks
}

const parseFlatFile = (file) => {
  const keys = new Set()
  let inTemplate = false
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    // toggle template-literal state so multi-line template contents are skipped
    if (!inTemplate) {
      const key = line.match(FILE_KEY)
      if (key) {
        keys.add(key[1])
      }
    }
    const backticks = (line.match(/`/g) || []).length
    if (backticks % 2 === 1) {
      inTemplate = !inTemplate
    }
  }
  return keys
}

const checkBlocksDir = (dir, ignored) => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !ignored.includes(f))
  for (const f of files) {
    const file = path.join(dir, f)
    const blocks = parseBlocks(file)
    const langs = Object.keys(blocks)
    if (langs.length === 0) {
      continue // not a LocalizedStrings file
    }
    const label = path.relative(process.cwd(), file)
    for (const lang of REQUIRED_LANGS) {
      if (!langs.includes(lang)) {
        errors.push(`${label}: missing '${lang}' block`)
      }
    }
    const baselineLang = langs.includes('en') ? 'en' : langs[0]
    for (const lang of langs) {
      if (lang !== baselineLang) {
        compare(label, lang, blocks[lang], baselineLang, blocks[baselineLang])
      }
    }
  }
}

const checkFilesDir = (dir, ignored) => {
  const baselineFile = path.join(dir, 'en.ts')
  const baseline = parseFlatFile(baselineFile)
  for (const lang of REQUIRED_LANGS.filter((l) => l !== 'en')) {
    const file = path.join(dir, `${lang}.ts`)
    if (ignored.includes(`${lang}.ts`)) {
      continue
    }
    if (!fs.existsSync(file)) {
      errors.push(`${path.relative(process.cwd(), dir)}: missing ${lang}.ts`)
      continue
    }
    compare(path.relative(process.cwd(), file), lang, parseFlatFile(file), 'en', baseline)
  }
}

const [mode, dir, ...ignored] = process.argv.slice(2)
if (!['--blocks', '--files'].includes(mode) || !dir) {
  console.error('Usage: node check-lang-keys.mjs (--blocks|--files) <dir> [ignored-file ...]')
  process.exit(2)
}

if (mode === '--blocks') {
  checkBlocksDir(dir, ignored)
} else {
  checkFilesDir(dir, ignored)
}

if (errors.length > 0) {
  console.error(`i18n key check failed (${errors.length} problem${errors.length > 1 ? 's' : ''}):`)
  for (const e of errors) {
    console.error(`  - ${e}`)
  }
  process.exit(1)
}

console.log(`i18n key check passed (${dir})`)
