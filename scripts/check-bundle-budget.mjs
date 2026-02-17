import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const JS_BUDGET_BYTES = Number(process.env.BUNDLE_BUDGET_JS_BYTES ?? 900_000);
const CSS_BUDGET_BYTES = Number(process.env.BUNDLE_BUDGET_CSS_BYTES ?? 250_000);

const distDir = path.resolve(process.cwd(), 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

const SCRIPT_SRC_RE = /<script[^>]+src="([^"]+)"/g;
const MODULE_PRELOAD_RE = /<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g;
const STYLESHEET_RE = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;

function bytesToKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function normalizeAssetPath(assetPath) {
  const clean = assetPath.split('?')[0];
  return clean.startsWith('/') ? clean.slice(1) : clean;
}

function collectMatches(content, regex) {
  const results = new Set();
  for (const match of content.matchAll(regex)) {
    const assetPath = match[1];
    if (!assetPath || assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
      continue;
    }
    results.add(normalizeAssetPath(assetPath));
  }
  return [...results];
}

async function readAssetSizes(assetPaths) {
  const entries = [];
  for (const assetPath of assetPaths) {
    const absolutePath = path.join(distDir, assetPath);
    const { size } = await stat(absolutePath);
    entries.push({ assetPath, size });
  }
  entries.sort((a, b) => b.size - a.size);
  return entries;
}

function sumSizes(entries) {
  return entries.reduce((total, entry) => total + entry.size, 0);
}

function printGroup(name, entries, total, budget) {
  console.log(`\n${name} preload assets:`);
  if (entries.length === 0) {
    console.log('  - none');
  } else {
    for (const entry of entries) {
      console.log(`  - ${entry.assetPath}: ${bytesToKiB(entry.size)}`);
    }
  }
  console.log(`${name} total: ${bytesToKiB(total)} / budget ${bytesToKiB(budget)}`);
}

async function main() {
  const indexHtml = await readFile(indexHtmlPath, 'utf8');

  const jsAssetPaths = [
    ...collectMatches(indexHtml, SCRIPT_SRC_RE),
    ...collectMatches(indexHtml, MODULE_PRELOAD_RE),
  ];
  const cssAssetPaths = collectMatches(indexHtml, STYLESHEET_RE);

  const jsEntries = await readAssetSizes(jsAssetPaths);
  const cssEntries = await readAssetSizes(cssAssetPaths);

  const jsTotal = sumSizes(jsEntries);
  const cssTotal = sumSizes(cssEntries);

  printGroup('JS', jsEntries, jsTotal, JS_BUDGET_BYTES);
  printGroup('CSS', cssEntries, cssTotal, CSS_BUDGET_BYTES);

  if (jsTotal > JS_BUDGET_BYTES || cssTotal > CSS_BUDGET_BYTES) {
    const failures = [];
    if (jsTotal > JS_BUDGET_BYTES) {
      failures.push(`JS initial assets exceed budget by ${bytesToKiB(jsTotal - JS_BUDGET_BYTES)}`);
    }
    if (cssTotal > CSS_BUDGET_BYTES) {
      failures.push(`CSS initial assets exceed budget by ${bytesToKiB(cssTotal - CSS_BUDGET_BYTES)}`);
    }
    throw new Error(failures.join(' | '));
  }

  console.log('\nBundle budgets are within limits.');
}

main().catch((error) => {
  console.error('\nBundle budget check failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
