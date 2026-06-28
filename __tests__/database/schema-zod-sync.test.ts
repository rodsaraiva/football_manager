import * as fs from 'fs';
import * as path from 'path';
import { ZodObject } from 'zod';
import { SCHEMA_SQL } from '../../src/database/schema';

// EH-4: detecta drift entre o schema SQL (fonte da verdade) e os schemas Zod do read-path.
// Cada query migrada exporta __rowSchemas mapeando seus row-schemas às tabelas; este teste
// descobre todos via glob (parallel-safe — não edita arquivo compartilhado) e exige que
// TODA key de cada schema corresponda a uma coluna real. Pega coluna renomeada/removida
// antes que vire erro de runtime. better-sqlite3 não é necessário (parse puro de string).

const CONSTRAINT_KEYWORDS = new Set(['PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK', 'CONSTRAINT']);

function parseTableColumns(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const tableRe = /CREATE TABLE(?: IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\n\);/g;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(sql)) !== null) {
    const [, name, body] = m;
    const cols = new Set<string>();
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const tok = line.match(/^"?([a-zA-Z_][\w]*)"?/);
      if (!tok) continue;
      const ident = tok[1];
      if (CONSTRAINT_KEYWORDS.has(ident.toUpperCase())) continue;
      cols.add(ident);
    }
    tables.set(name, cols);
  }
  return tables;
}

interface RegisteredSchema {
  table: string;
  schema: ZodObject<any>;
  file: string;
}

// Schemas Zod do read-path vivem tanto em src/database/queries quanto em arquivos de
// engine que leem o DB (ex.: src/engine/history/season-archiver.ts). Varremos os dois
// roots recursivamente, mas só damos require em arquivos cujo TEXTO contém __rowSchemas —
// barato e evita carregar ~100 módulos de engine só para o teste.
function collectSchemaFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSchemaFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      if (fs.readFileSync(full, 'utf8').includes('__rowSchemas')) out.push(full);
    }
  }
}

function discoverRowSchemas(): RegisteredSchema[] {
  const roots = ['../../src/database', '../../src/engine'].map((r) => path.join(__dirname, r));
  const files: string[] = [];
  for (const root of roots) collectSchemaFiles(root, files);
  const found: RegisteredSchema[] = [];
  for (const full of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(full) as {
      __rowSchemas?: Array<{ table: string; schema: ZodObject<any> }>;
    };
    if (!Array.isArray(mod.__rowSchemas)) continue; // tolera arquivos sem schema registrado
    for (const entry of mod.__rowSchemas) {
      found.push({ table: entry.table, schema: entry.schema, file: path.relative(path.join(__dirname, '../..'), full) });
    }
  }
  return found;
}

const tables = parseTableColumns(SCHEMA_SQL);
const registered = discoverRowSchemas();

describe('schema SQL <-> Zod sync (EH-4)', () => {
  it('parseia as tabelas de SCHEMA_SQL (sanity do parser)', () => {
    // Guarda contra um parser silenciosamente vazio que tornaria o resto vacuamente verde.
    expect(tables.size).toBeGreaterThan(40);
    expect(tables.get('club_finances')).toBeDefined();
    expect([...(tables.get('club_finances') ?? [])].sort()).toEqual(
      ['amount', 'club_id', 'description', 'id', 'save_id', 'season', 'type', 'week'].sort(),
    );
  });

  it('a descoberta alcança schemas fora de queries/ (engine/history/season-archiver)', () => {
    // Guarda contra a regressão do glob: se a varredura voltar a olhar só queries/, o
    // season-archiver (engine) some e o drift das tabelas dele passa silencioso.
    const files = new Set(registered.map((r) => r.file.replace(/\\/g, '/')));
    expect([...files].some((f) => f.includes('engine/history/season-archiver'))).toBe(true);
    const tablesCovered = new Set(registered.map((r) => r.table));
    expect(tablesCovered.has('competitions')).toBe(true);
  });

  it('cada __rowSchemas registrado aponta para uma tabela real', () => {
    const missing = registered
      .filter((r) => !tables.has(r.table))
      .map((r) => `${r.file}: tabela "${r.table}" não existe em SCHEMA_SQL`);
    expect(missing).toEqual([]);
  });

  it('toda key de cada schema Zod corresponde a uma coluna real da tabela', () => {
    const drift: string[] = [];
    for (const { table, schema, file } of registered) {
      const cols = tables.get(table);
      if (!cols) continue; // coberto pelo teste anterior
      for (const key of Object.keys(schema.shape)) {
        if (!cols.has(key)) {
          drift.push(`${file}: ${table}.${key} não é coluna real (drift de schema?)`);
        }
      }
    }
    expect(drift).toEqual([]);
  });
});
