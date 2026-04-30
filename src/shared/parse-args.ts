export interface ParsedArgs {
  readonly flags: Record<string, string | boolean>;
  readonly positional: readonly string[];
}

export interface ParseOptions {
  readonly boolean?: readonly string[];
  readonly string?: readonly string[];
  readonly alias?: Record<string, string>;
}

export function parseArgs(argv: readonly string[], options: ParseOptions = {}): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  const booleanFlags = new Set(options.boolean ?? []);
  const stringFlags = new Set(options.string ?? []);
  const aliases = options.alias ?? {};
  let positionalOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index] ?? "";

    if (positionalOnly) {
      positional.push(item);
      continue;
    }

    if (item === "--") {
      positionalOnly = true;
      continue;
    }

    if (!item.startsWith("-") || item === "-") {
      positional.push(item);
      continue;
    }

    const normalized = normalizeFlag(item, aliases);
    const eqIndex = normalized.indexOf("=");
    if (eqIndex !== -1) {
      const key = normalized.slice(2, eqIndex);
      flags[key] = normalized.slice(eqIndex + 1);
      continue;
    }

    const key = normalized.slice(2);
    if (booleanFlags.has(key)) {
      flags[key] = true;
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--") || (!stringFlags.has(key) && next.startsWith("-"))) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { flags, positional };
}

function normalizeFlag(item: string, aliases: Record<string, string>): string {
  if (item.startsWith("--")) return item;
  const key = item.slice(1);
  const alias = aliases[key] ?? key;
  return `--${alias}`;
}
