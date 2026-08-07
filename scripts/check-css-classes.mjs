#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

// Allowed exceptions: classes used as inert modifiers alongside other classes
// .settings-entry is used on <button className="nav-item settings-entry"> where .nav-item carries all styling
const ALLOWLIST = [
  'settings-entry', // inert modifier on .nav-item
]

// Compute the src directory relative to this script
// Script is at: /mnt/.../DeepDive/scripts/check-css-classes.mjs
// We want: /mnt/.../DeepDive/src
const scriptFile = new URL(import.meta.url).pathname
const scriptDir = resolve(scriptFile, '..')
const srcDir = resolve(scriptDir, '../src')

/**
 * Recursively find all .tsx/.jsx files in a directory
 */
function findComponentFiles(dir) {
  const files = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findComponentFiles(fullPath))
    } else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Extract class names from a className attribute value.
 * Handles:
 * 1. Static: className="a b c"
 * 2. Template literal: className={`a ${cond ? 'b' : ''} c`}
 * 3. Plain string: className={'a b'}
 */
function extractClassNamesFromJsx(content) {
  const classNames = new Set()

  // Extract className="..." (double quoted static)
  const staticDoubleRegex = /className\s*=\s*"([^"]*)"/g
  let match
  while ((match = staticDoubleRegex.exec(content)) !== null) {
    const value = match[1]
    if (value && value.trim()) {
      const classes = value.trim().split(/\s+/)
      classes.forEach(cls => {
        if (cls) classNames.add(cls)
      })
    }
  }

  // Extract className='...' (single quoted static)
  const staticSingleRegex = /className\s*=\s*'([^']*)'/g
  while ((match = staticSingleRegex.exec(content)) !== null) {
    const value = match[1]
    if (value && value.trim()) {
      const classes = value.trim().split(/\s+/)
      classes.forEach(cls => {
        if (cls) classNames.add(cls)
      })
    }
  }

  // Handle template literals: className={`...`}
  // Use a simple regex that finds className={` followed by content ending with `}
  const templateRegex = /className\s*=\s*\{`([^`]+)`\}/g
  while ((match = templateRegex.exec(content)) !== null) {
    const templateContent = match[1]
    processTemplateContent(classNames, templateContent)
  }

  return classNames
}

/**
 * Helper to extract classes from template literal content
 */
function processTemplateContent(classNames, content) {
  // Extract literal parts by removing ${...} expressions
  const literalParts = content.replace(/\$\{[^}]*\}/g, ' ')
  const trimmed = literalParts.trim()
  if (trimmed) {
    const literalClasses = trimmed.split(/\s+/)
    literalClasses.forEach(cls => {
      if (cls && cls.length > 0) classNames.add(cls)
    })
  }

  // Extract string literals from ${...} blocks
  // Match quoted strings: '...' or "..."
  // Look for both ' and " delimiters, but be careful not to match across delimiters
  const singleQuoteRegex = /\$\{[^}]*'([^']*)'[^}]*\}/g
  let match
  while ((match = singleQuoteRegex.exec(content)) !== null) {
    const str = match[1]
    if (str && str.trim()) {
      const classes = str.trim().split(/\s+/)
      classes.forEach(cls => {
        if (cls && cls.length > 0) classNames.add(cls)
      })
    }
  }

  const doubleQuoteRegex = /\$\{[^}]*"([^"]*)"/g
  while ((match = doubleQuoteRegex.exec(content)) !== null) {
    const str = match[1]
    if (str && str.trim()) {
      const classes = str.trim().split(/\s+/)
      classes.forEach(cls => {
        if (cls && cls.length > 0) classNames.add(cls)
      })
    }
  }
}

/**
 * Recursively find all .css files in src/styles
 */
function findStyleFiles(dir) {
  const files = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findStyleFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(fullPath)
    }
  }
  return files
}

/**
 * Extract class selectors from CSS content.
 * Handles: .foo, .foo:hover, .foo.bar, .a, .b { ... }, nested in @media, etc.
 * Returns bare class names without pseudo-selectors or combinators.
 */
function extractClassesFromCss(content) {
  const classes = new Set()

  // Match class selectors: .classname or .classname:pseudo or .classname.otherclass
  // Pattern: . followed by identifier (a-zA-Z0-9_-), optionally followed by :pseudo or .otherclass
  const classRegex = /\.([a-zA-Z0-9_-]+)/g
  let match

  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1]
    if (className) {
      classes.add(className)
    }
  }

  return classes
}

// Main execution
const componentsDir = join(srcDir, 'components')
const appTsx = join(srcDir, 'App.tsx')
const stylesDir = join(srcDir, 'styles')
const indexCss = join(srcDir, 'index.css')

// Collect all referenced classes
const referencedClasses = new Map() // className -> Set of file paths

const componentFiles = findComponentFiles(componentsDir)

// Check if App.tsx exists
let allComponentFiles = [...componentFiles]
try {
  readdirSync(srcDir)
  if (readdirSync(srcDir).includes('App.tsx')) {
    allComponentFiles.push(appTsx)
  }
} catch {
  // Ignore
}

for (const filePath of allComponentFiles) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const classes = extractClassNamesFromJsx(content)
    for (const cls of classes) {
      // Skip empty classes
      if (!cls || cls.trim().length === 0) continue
      if (!referencedClasses.has(cls)) {
        referencedClasses.set(cls, [])
      }
      referencedClasses.get(cls).push(filePath)
    }
  } catch {
    // Silently ignore read errors
  }
}

// Collect all defined classes
const definedClasses = new Set()

const styleFiles = findStyleFiles(stylesDir)

// Also include index.css from src root
const allStyleFiles = [...styleFiles]
try {
  readdirSync(srcDir)
  if (readdirSync(srcDir).includes('index.css')) {
    allStyleFiles.push(indexCss)
  }
} catch {
  // Ignore
}

for (const filePath of allStyleFiles) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const classes = extractClassesFromCss(content)
    for (const cls of classes) {
      definedClasses.add(cls)
    }
  } catch {
    // Silently ignore read errors
  }
}

// Find missing classes
const missing = []
for (const [className, files] of referencedClasses) {
  // Skip empty classes
  if (!className || className.trim().length === 0) continue
  if (!definedClasses.has(className) && !ALLOWLIST.includes(className)) {
    missing.push({ className, files })
  }
}

// Report
if (missing.length === 0) {
  console.log('✓ All CSS classes are defined.')
  process.exit(0)
} else {
  missing.sort((a, b) => a.className.localeCompare(b.className))
  for (const { className, files } of missing) {
    const fileList = files.map(f => f.replace(srcDir, 'src')).join(', ')
    console.log(`${className} (${fileList})`)
  }
  process.exit(1)
}
