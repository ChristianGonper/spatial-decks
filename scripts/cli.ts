import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LoadError, loadAllDecks, loadDeck } from '../src/engine/load.ts';
import { validate } from '../src/engine/validate.ts';
import type { DeckIR, ValidationResult } from '../src/engine/types.ts';

function printResult(slug: string, result: ValidationResult): void {
  if (result.ok) {
    console.log(`${slug}: ok`);
  } else {
    console.log(`${slug}: error`);
    for (const e of result.errors) {
      console.log(`  [${e.code}] ${e.message}`);
    }
  }
  for (const w of result.warnings) {
    console.log(`  aviso [${w.code}] ${w.message}`);
  }
}

function runValidate(slug: string | undefined): number {
  let decks: DeckIR[];
  try {
    if (slug) {
      const dir = resolve('decks', slug);
      if (!existsSync(join(dir, 'deck.yaml'))) {
        console.error(`no hay decks/${slug}/deck.yaml`);
        return 1;
      }
      decks = [loadDeck(dir)];
    } else {
      decks = loadAllDecks('decks');
    }
  } catch (err) {
    if (err instanceof LoadError) {
      console.error(`[${err.code}] ${err.message}`);
      return 1;
    }
    throw err;
  }

  let failed = false;
  for (const ir of decks) {
    const result = validate(ir);
    printResult(ir.slug, result);
    if (!result.ok) failed = true;
  }
  if (decks.length === 0) {
    console.log('ningún deck en decks/*/deck.yaml');
  }
  return failed ? 1 : 0;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'validate') {
  process.exit(runValidate(arg));
}
if (cmd === 'video') {
  console.error('video: no implementado todavía');
  process.exit(2);
}
console.error('uso: cli.ts validate [slug]');
process.exit(2);
