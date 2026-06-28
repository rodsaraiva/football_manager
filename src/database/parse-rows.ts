import { ZodType } from 'zod';

// Validação de runtime para o read-path do driver SQLite (.all()/.get()).
// Substitui casts crus "as Tipo" por uma fronteira que falha localizada — com
// o nome da query e o caminho do campo — em vez de propagar dado malformado.

function fieldPath(path: ReadonlyArray<PropertyKey>): string {
  return path.length ? path.map(String).join('.') : '(root)';
}

// Escape-hatch: quando desligada, o read-path volta ao comportamento pré-Zod (cast
// cru, custo zero). Existe para hot-paths que provem regressão de performance; o default
// é ligada e desligá-la NÃO altera os dados retornados, só pula a checagem de formato.
// Override por ambiente: FM_VALIDATE_ROWS=0 nasce desligada (útil em benchmarks/runtime).
let validationEnabled = !(
  typeof process !== 'undefined' && process.env && process.env.FM_VALIDATE_ROWS === '0'
);

export function setRowValidationEnabled(enabled: boolean): void {
  validationEnabled = enabled;
}

export function isRowValidationEnabled(): boolean {
  return validationEnabled;
}

export function parseRows<T>(schema: ZodType<T>, rows: unknown, queryName: string): T[] {
  if (!validationEnabled) {
    return rows as T[];
  }
  if (!Array.isArray(rows)) {
    throw new Error(`[${queryName}] esperava array do driver SQLite, recebeu ${typeof rows}`);
  }
  const out: T[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const result = schema.safeParse(rows[i]);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(
        `[${queryName}] linha ${i}: campo "${fieldPath(issue.path)}" — ${issue.message}`,
      );
    }
    out[i] = result.data;
  }
  return out;
}

export function parseRow<T>(schema: ZodType<T>, row: unknown, queryName: string): T {
  // .get() retorna undefined (better-sqlite3) ou null (expo-sqlite) quando não há
  // linha; normaliza para null para que um schema .nullable() o aceite e um schema
  // não-nulável lance — preservando o comportamento do cast "as Tipo | undefined".
  const normalized = row === undefined ? null : row;
  if (!validationEnabled) {
    return normalized as T;
  }
  const result = schema.safeParse(normalized);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `[${queryName}] campo "${fieldPath(issue.path)}" — ${issue.message}`,
    );
  }
  return result.data;
}
