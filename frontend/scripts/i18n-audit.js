#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const UI_DIRS = [
  path.join(ROOT, 'src', 'components'),
  path.join(ROOT, 'src', 'app'),
];
const LOCALES_DIR = path.join(ROOT, 'src', 'locales');

const BUILTIN_NAMESPACES = new Set(['translation', 'user', 'admin', 'reseller', 'common']);
const SUPPORTED_LANGS = ['en', 'es', 'zh', 'pt', 'fr', 'ru', 'tr', 'sk'];

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (full.endsWith('.tsx') || full.endsWith('.jsx')) out.push(full);
  }
  return out;
}

function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractUseTranslationNamespaces(content) {
  const namespaces = [];
  const useTranslationRegex = /useTranslation\s*\(([\s\S]*?)\)/g;
  let match;
  while ((match = useTranslationRegex.exec(content)) !== null) {
    const args = match[1] || '';
    const stringRegex = /['"]([^'"]+)['"]/g;
    let stringMatch;
    while ((stringMatch = stringRegex.exec(args)) !== null) {
      namespaces.push(stringMatch[1]);
    }
  }
  return namespaces;
}

function extractLoadedNamespaces(content) {
  const loaded = [];
  const loadRegex = /useLoadNamespace\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = loadRegex.exec(content)) !== null) {
    loaded.push(match[1]);
  }
  return loaded;
}

function extractHardcodedLocaleCalls(content) {
  const matches = [];
  const localeRegex = /toLocale(?:DateString|TimeString|String)\s*\(\s*['"]en-US['"]/g;
  let match;
  while ((match = localeRegex.exec(content)) !== null) {
    matches.push(match.index);
  }
  return matches;
}

function namespaceExists(ns) {
  if (BUILTIN_NAMESPACES.has(ns)) return true;
  const parts = ns.split('/');
  const asFile = path.join(LOCALES_DIR, ...parts) + '.json';
  const asFolder = path.join(LOCALES_DIR, ...parts);
  if (fs.existsSync(asFile)) return true;
  if (fs.existsSync(asFolder) && fs.statSync(asFolder).isDirectory()) return true;
  return false;
}

function flattenKeys(value, prefix = '', out = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v, key, out);
    } else {
      out.push(key);
    }
  }
  return out;
}

function loadJson(file) {
  return JSON.parse(readFile(file));
}

function walkEnFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkEnFiles(full, out);
      continue;
    }
    if (entry.isFile() && entry.name === 'en.json') out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file);
}

function run() {
  const uiFiles = UI_DIRS.flatMap((dir) => walkFiles(dir));

  const unknownNamespaces = [];
  const missingLoaders = [];
  const hardcodedLocaleCalls = [];

  for (const file of uiFiles) {
    const content = readFile(file);
    const usedNs = Array.from(new Set(extractUseTranslationNamespaces(content)));
    const loadedNs = new Set(extractLoadedNamespaces(content));
    const localeCalls = extractHardcodedLocaleCalls(content);

    for (const ns of usedNs) {
      if (!namespaceExists(ns)) {
        unknownNamespaces.push({ file: rel(file), namespace: ns });
      }
    }

    const dynamicNs = usedNs.filter((ns) => ns.includes('/'));
    const missingForFile = dynamicNs.filter((ns) => !loadedNs.has(ns));
    if (missingForFile.length > 0) {
      missingLoaders.push({
        file: rel(file),
        namespaces: Array.from(new Set(missingForFile)),
      });
    }

    if (localeCalls.length > 0) {
      hardcodedLocaleCalls.push({
        file: rel(file),
        count: localeCalls.length,
      });
    }
  }

  const localeIssues = [];
  const enFiles = walkEnFiles(LOCALES_DIR);
  for (const enFile of enFiles) {
    const enData = loadJson(enFile);
    const enKeys = new Set(flattenKeys(enData));
    const dir = path.dirname(enFile);

    for (const lang of SUPPORTED_LANGS) {
      if (lang === 'en') continue;
      const langFile = path.join(dir, `${lang}.json`);
      if (!fs.existsSync(langFile)) {
        localeIssues.push({
          type: 'missing_file',
          base: rel(enFile),
          target: rel(langFile),
          details: '',
        });
        continue;
      }
      const langData = loadJson(langFile);
      const langKeys = new Set(flattenKeys(langData));
      const missingKeys = [];
      for (const key of enKeys) {
        if (!langKeys.has(key)) missingKeys.push(key);
      }
      if (missingKeys.length > 0) {
        localeIssues.push({
          type: 'missing_keys',
          base: rel(enFile),
          target: rel(langFile),
          details: `${missingKeys.length} keys (sample: ${missingKeys.slice(0, 5).join(', ')})`,
        });
      }
    }
  }

  let hasErrors = false;

  if (unknownNamespaces.length > 0) {
    hasErrors = true;
    console.error('\n[i18n-audit] Unknown namespaces found:');
    for (const issue of unknownNamespaces) {
      console.error(`- ${issue.file}: ${issue.namespace}`);
    }
  }

  if (missingLoaders.length > 0) {
    hasErrors = true;
    console.error('\n[i18n-audit] Dynamic namespaces used without useLoadNamespace in the same file:');
    for (const issue of missingLoaders) {
      console.error(`- ${issue.file}: ${issue.namespaces.join(', ')}`);
    }
  }

  if (hardcodedLocaleCalls.length > 0) {
    hasErrors = true;
    console.error('\n[i18n-audit] Hardcoded locale detected in date/time formatting (use i18n.language or undefined):');
    for (const issue of hardcodedLocaleCalls) {
      console.error(`- ${issue.file}: ${issue.count} occurrence(s)`);
    }
  }

  if (localeIssues.length > 0) {
    hasErrors = true;
    console.error('\n[i18n-audit] Locale parity issues:');
    for (const issue of localeIssues) {
      console.error(`- ${issue.type}: ${issue.base} -> ${issue.target} ${issue.details}`.trim());
    }
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log('[i18n-audit] OK');
  console.log(`[i18n-audit] UI files checked: ${uiFiles.length}`);
  console.log(`[i18n-audit] Namespace checks: passed`);
  console.log(`[i18n-audit] Locale parity checks: passed`);
}

run();
