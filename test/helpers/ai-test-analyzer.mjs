#!/usr/bin/env node
// AI-Assisted Test Coverage Analyzer
// Analyzes source files, identifies untested code paths, and generates test skeletons
// Can be used with LLM to produce final test implementations

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEST_DIR = join(ROOT, 'test');
const SOURCE_DIRS = ['src', 'server'];

// Regex patterns for exportable functions
const FN_RE = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
const EXPORT_RE = /export\s+\{\s*([^}]+)\s*\}/g;
const ARROW_RE = /export\s+(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;

// Parse test files for already-tested functions
function parseTestedFunctions(content) {
  const tested = new Set();
  // Match function calls in test code
  const callRe = /(\w+)\s*\(/g;
  let match;
  while ((match = callRe.exec(content)) !== null) {
    if (!['test', 'assert', 'describe', 'it', 'before', 'after'].includes(match[1])) {
      tested.add(match[1]);
    }
  }
  // Match import statements
  const importRe = /import\s+\{([^}]+)\}\s+from/g;
  while ((match = importRe.exec(content)) !== null) {
    match[1].split(',').forEach(s => tested.add(s.trim().split(/\s+as\s+/)[0].trim()));
  }
  return tested;
}

// Parse source file for exported functions
function parseExportedFunctions(content) {
  const fns = new Set();
  let match;
  const combined = new Set();

  // Named function exports
  while ((match = FN_RE.exec(content)) !== null) {
    combined.add(match[1]);
  }

  // Const arrow exports
  while ((match = ARROW_RE.exec(content)) !== null) {
    combined.add(match[1]);
  }

  // Export { x, y } syntax
  while ((match = EXPORT_RE.exec(content)) !== null) {
    match[1].split(',').forEach(s => {
      const name = s.trim().split(/\s+as\s+/)[0].trim();
      combined.add(name);
    });
  }

  return combined;
}

async function analyze() {
  console.log('🔍 AI Test Coverage Analyzer\n');

  // Collect all source files
  const sourceFiles = [];
  for (const dir of SOURCE_DIRS) {
    const fullDir = join(ROOT, dir);
    try {
      const entries = await readdir(fullDir, { recursive: true });
      for (const entry of entries) {
        const fullPath = join(fullDir, entry);
        try {
          const s = await stat(fullPath);
          if (s.isFile() && /\.(m?js|jsx)$/.test(entry) && !entry.includes('.test.')) {
            sourceFiles.push(fullPath);
          }
        } catch {}
      }
    } catch {}
  }

  // Parse all source files
  const allExports = new Map();
  for (const file of sourceFiles) {
    const content = await readFile(file, 'utf8');
    const fns = parseExportedFunctions(content);
    if (fns.size > 0) {
      allExports.set(relative(ROOT, file), { fns, content });
    }
  }

  // Collect all test files
  const testFiles = [];
  try {
    const entries = await readdir(TEST_DIR, { recursive: true });
    for (const entry of entries) {
      const fullPath = join(TEST_DIR, entry);
      try {
        const s = await stat(fullPath);
        if (s.isFile() && /\.(test\.|spec\.|\.test\.)/.test(entry)) {
          testFiles.push(fullPath);
        }
      } catch {}
    }
  } catch {}

  // Parse tested functions
  const allTested = new Set();
  for (const file of testFiles) {
    const content = await readFile(file, 'utf8');
    for (const fn of parseTestedFunctions(content)) {
      allTested.add(fn);
    }
  }

  // Find gaps
  const gaps = [];
  for (const [file, { fns }] of allExports) {
    const untested = [...fns].filter(fn => !allTested.has(fn));
    if (untested.length > 0) {
      gaps.push({ file, untested });
    }
  }

  // Report
  console.log(`📁 Source files analyzed: ${allExports.size}`);
  console.log(`🧪 Test files found: ${testFiles.length}`);
  console.log(`✅ Functions already tested: ${allTested.size}`);

  if (gaps.length === 0) {
    console.log('\n🎉 All exported functions have test coverage!');
    return;
  }

  console.log(`\n⚠️  Untested exported functions found:\n`);
  for (const { file, untested } of gaps) {
    console.log(`  📄 ${file}:`);
    for (const fn of untested) {
      console.log(`     - ${fn}()`);
    }
  }

  // Generate test skeleton suggestions
  console.log('\n📝 Suggested test skeletons for AI to complete:\n');
  for (const { file, untested } of gaps) {
    for (const fn of untested) {
      console.log(`// Test for ${fn}() in ${file}`);
      console.log(`test('${fn} handles valid input', () => {`);
      console.log(`  // TODO: import and test ${fn}`);
      console.log(`  // assert.equal(${fn}(...), expected);`);
      console.log(`});\n`);
    }
  }

  return { gaps, allTested: [...allTested] };
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  analyze().catch(console.error);
}

export { analyze, parseExportedFunctions, parseTestedFunctions };
