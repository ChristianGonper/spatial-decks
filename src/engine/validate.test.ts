import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadAllDecks, loadDeck } from './load.ts';
import { scanMarkdown } from './math-extract.ts';
import type { DeckIR } from './types.ts';
import { rewriteAssetSrc } from './markdown.ts';
import { withBase } from './public-path.ts';
import { validate } from './validate.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PRD16 = new Set([
  'schema',
  'layout-unknown',
  'id-duplicate',
  'id-filename',
  'path-missing',
  'asset-missing',
]);

function fixture(name: string): string {
  return join(repoRoot, 'tests/fixtures', name);
}

function assertPrd16(name: string): void {
  const result = validate(loadDeck(fixture(name)));
  assert.equal(result.ok, false, `${name} debería fallar`);
  const codes = new Set(result.errors.map((e) => e.code));
  const hit = [...codes].some((c) => PRD16.has(c));
  assert.ok(hit, `${name}: códigos ${[...codes].join(',')} no intersectan §16`);
}

function tinyIr(md: string, slug = 'x'): DeckIR {
  return {
    slug,
    title: 'x',
    lang: 'es',
    theme: 'editorial',
    root: 'root',
    camera: { duration_ms: 1000 },
    video: { hold_ms: 3000 },
    path: [{ id: 'root' }],
    deckDir: join('/tmp', slug),
    rawManifest: {
      slug,
      title: 'x',
      lang: 'es',
      theme: 'editorial',
      root: 'root',
      path: ['root'],
    },
    frames: {
      root: {
        id: 'root',
        layout: 'grid',
        children: [],
        markdown: md,
        raw: { id: 'root' },
      },
    },
  };
}

describe('withBase / assets', () => {
  it('rewriteAssetSrc usa BASE_URL (local = /)', () => {
    assert.equal(withBase('deck-assets/x/a.svg'), '/deck-assets/x/a.svg');
    assert.equal(rewriteAssetSrc('assets/punto.svg', 'golden-tiny'), '/deck-assets/golden-tiny/punto.svg');
  });
});

describe('golden-tiny', () => {
  it('valida ok y loadAllDecks no incluye fixtures', () => {
    const ir = loadDeck(join(repoRoot, 'decks/golden-tiny'));
    const result = validate(ir);
    assert.equal(
      result.ok,
      true,
      result.errors.map((e) => `${e.code}: ${e.message}`).join('; '),
    );
    assert.equal(ir.frames.root.children.length, 2);
    assert.equal(ir.path.length, 4);
    assert.equal(ir.path[3].duration_ms, 800);
    const all = loadAllDecks(join(repoRoot, 'decks'));
    const slugs = all.map((d) => d.slug).sort();
    assert.deepEqual(slugs, ['golden-tiny', 'quasi-geostrofica', 'ramas-demo']);
  });
});

describe('quasi-geostrofica', () => {
  it('valida ok', () => {
    const ir = loadDeck(join(repoRoot, 'decks/quasi-geostrofica'));
    const result = validate(ir);
    assert.equal(
      result.ok,
      true,
      result.errors.map((e) => `${e.code}: ${e.message}`).join('; '),
    );
    assert.ok(Object.keys(ir.frames).length >= 15);
    assert.equal(ir.path[0]?.id, 'root');
    assert.equal(ir.path.at(-1)?.id, 'root');
  });
});

describe('fixtures §16', () => {
  it('id-duplicate', () => assertPrd16('id-duplicate'));
  it('path-missing', () => assertPrd16('path-missing'));
  it('asset-missing', () => assertPrd16('asset-missing'));
  it('layout-diagonal', () => assertPrd16('layout-diagonal'));
});

describe('markdown scan', () => {
  it('unclosed-fence y markdown-html', () => {
    const fence = validate(tinyIr('hola\n```python\nprint(1)\n'));
    assert.equal(fence.ok, false);
    assert.ok(fence.errors.some((e) => e.code === 'unclosed-fence'));

    const html = validate(tinyIr('texto <div>no</div>'));
    assert.equal(html.ok, false);
    assert.ok(html.errors.some((e) => e.code === 'markdown-html'));
  });

  it('math fuera de fences; $ dentro de ``` no cuenta', () => {
    const src = 'fuera $a+b$\n```\n$no$\n```\n$$c$$\n`code $x$ ok`\n';
    const scan = scanMarkdown(src);
    assert.equal(scan.unclosedFence, false);
    assert.equal(scan.math.length, 2);
    assert.equal(scan.math[0].tex, 'a+b');
    assert.equal(scan.math[0].display, false);
    assert.equal(src.slice(scan.math[0].start, scan.math[0].end), '$a+b$');
    assert.equal(scan.math[1].display, true);
    assert.match(scan.math[1].tex, /c/);
  });

  it('TeX inválido → math', () => {
    const r = validate(tinyIr('malo $\\notacomando{'));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.code === 'math'));
  });

  it('assets/<dir>/file.png es asset-type', () => {
    const r = validate(tinyIr('![x](assets/dir/x.png)'));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.code === 'asset-type'));
  });
});
