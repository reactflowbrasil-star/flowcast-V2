#!/usr/bin/env node
/*
Fix structural issues in OpenAPI JSON where some paths accidentally ended up
nested under another path item (JSON remains valid but Swagger UI ignores those).

This script lifts any object keys that look like path keys (start with "/")
found anywhere under `paths` (except direct children) up to the top-level
`paths` object.

Usage:
  node backend/tools/fix_swagger_json.js backend/static/swagger.json --write
  node backend/tools/fix_swagger_json.js backend/static/swagger.json > backend/static/swagger.json
*/

const fs = require('fs');

function parseArgs(argv) {
  const args = { file: 'backend/static/swagger.json', write: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true;
    else if (!a.startsWith('-')) args.file = a;
  }
  return args;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function stableSortObjectKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

function liftNestedPathKeys(openapi) {
  if (!isPlainObject(openapi) || !isPlainObject(openapi.paths)) return 0;

  const top = openapi.paths;
  let moved = 0;

  function visit(node) {
    if (!isPlainObject(node)) return;

    for (const key of Object.keys(node)) {
      const value = node[key];

      if (key.startsWith('/') && node !== top) {
        if (!Object.prototype.hasOwnProperty.call(top, key)) {
          top[key] = value;
        } else if (isPlainObject(top[key]) && isPlainObject(value)) {
          // Prefer existing top-level entry, but keep any missing method keys from nested.
          top[key] = { ...value, ...top[key] };
        }

        delete node[key];
        moved++;
        continue;
      }

      visit(value);
    }
  }

  // Repeat until no more nested path keys remain.
  while (true) {
    const before = moved;
    visit(top);
    if (moved === before) break;
  }

  return moved;
}

function validateNoNestedPathKeys(openapi) {
  const bad = [];
  if (!isPlainObject(openapi) || !isPlainObject(openapi.paths)) return bad;

  for (const [p, item] of Object.entries(openapi.paths)) {
    if (!isPlainObject(item)) continue;
    for (const k of Object.keys(item)) {
      if (k.startsWith('/')) bad.push({ parent: p, nested: k });
    }
  }
  return bad;
}

function main() {
  const { file, write } = parseArgs(process.argv);
  const raw = fs.readFileSync(file, 'utf8');
  const openapi = JSON.parse(raw);

  const moved = liftNestedPathKeys(openapi);

  // Keep output deterministic.
  if (isPlainObject(openapi.paths)) openapi.paths = stableSortObjectKeys(openapi.paths);
  if (isPlainObject(openapi.components) && isPlainObject(openapi.components.schemas)) {
    openapi.components.schemas = stableSortObjectKeys(openapi.components.schemas);
  }

  const nested = validateNoNestedPathKeys(openapi);
  if (nested.length) {
    console.error('Still found nested path keys under paths items:', nested.slice(0, 25));
    process.exit(2);
  }

  const out = JSON.stringify(openapi, null, 2) + '\n';

  if (write) {
    fs.writeFileSync(file, out);
    console.error(`Fixed ${file}: lifted ${moved} nested path keys`);
  } else {
    process.stdout.write(out);
  }
}

main();
