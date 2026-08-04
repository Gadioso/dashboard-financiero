import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { legalTranslations } from '../lib/legal-translations.ts';
import { additionalUiTranslations } from '../lib/additional-ui-translations.ts';

const spanishSignal = /[áéíóúñ¿¡]|\b(?:el|la|los|las|de|del|para|con|sin|tu|tus|este|esta|estos|estas|una|un|que|cómo|cuándo|puedes|debes)\b/i;

function normalized(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function legalCopy(file: string) {
  const sourceText = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const copy = new Set<string>();

  function visit(node: ts.Node) {
    if (ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const value = normalized(node.text);
      if (value.length >= 9 && spanishSignal.test(value) && !value.startsWith('@/')) copy.add(value);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return copy;
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file) : file.endsWith('.tsx') ? [file] : [];
  });
}

function stringPropertyKeys(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const keys = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && (ts.isStringLiteral(node.name) || ts.isNoSubstitutionTemplateLiteral(node.name))) keys.add(normalized(node.name.text));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return keys;
}

function visibleSpanishJsx(file: string) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const copy = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const value = normalized(node.text);
      if (value.length >= 2 && spanishSignal.test(value)) copy.add(value);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return copy;
}

test('every Spanish Privacy and Terms copy fragment has an English translation', () => {
  const files = [resolve('app/privacy/page.tsx'), resolve('app/terms/page.tsx')];
  const missing = files.flatMap((file) => [...legalCopy(file)].filter((value) => !legalTranslations[value]));

  assert.deepEqual(missing, [], `Missing legal translations:\n${missing.join('\n')}`);
  assert.ok(Object.keys(legalTranslations).length >= 150, 'The legal catalog unexpectedly lost coverage.');
});

test('the extended UI catalog retains coverage for hidden and dynamic states', () => {
  const required = [
    'Captura manual',
    'Ahorrado actualmente',
    'Seguimiento auditable',
    'Primero genera tu llave en el paso 1.',
    'Completa el plan para independizarte y viajar',
  ];

  for (const source of required) assert.ok(additionalUiTranslations[source], `Missing UI translation: ${source}`);
  assert.ok(Object.keys(additionalUiTranslations).length >= 200, 'The extended UI catalog unexpectedly lost coverage.');
});

test('every visible Spanish JSX label is represented in an English catalog', () => {
  const catalog = new Set([
    ...Object.keys(legalTranslations),
    ...Object.keys(additionalUiTranslations),
    ...stringPropertyKeys(resolve('lib/i18n.ts')),
  ]);
  const excluded = new Set([resolve('app/privacy/page.tsx'), resolve('app/terms/page.tsx')]);
  const missing = filesBelow(resolve('app'))
    .filter((file) => !excluded.has(file) && !file.includes('/api/'))
    .flatMap((file) => [...visibleSpanishJsx(file)].filter((value) => !catalog.has(value)).map((value) => `${file.replace(`${resolve('.')}/`, '')}: ${value}`));

  assert.deepEqual(missing, [], `Visible JSX copy is missing from the English catalogs:\n${missing.join('\n')}`);
});

test('the application owns localization instead of browser auto-translation', () => {
  const layout = readFileSync(resolve('app/layout.tsx'), 'utf8');
  const login = readFileSync(resolve('app/login/page.tsx'), 'utf8');

  assert.match(layout, /<html[^>]+translate="no"[^>]+notranslate/);
  assert.match(layout, /google:\s*"notranslate"/);
  assert.match(login, /'correo en inglés'/);
});
