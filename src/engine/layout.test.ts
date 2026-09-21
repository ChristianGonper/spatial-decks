import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FRAME_PAD_X,
  FRAME_PAD_Y,
  LayoutError,
  layoutTree,
  packSiblings,
  PARENT_BODY_GAP,
} from './layout.ts';
import type { DeckIR, FrameIR, Geometry, Size } from './types.ts';

function frame(
  id: string,
  opts: {
    layout?: string;
    children?: string[];
    geometry?: Geometry;
  } = {},
): FrameIR {
  const f: FrameIR = {
    id,
    layout: opts.layout ?? 'grid',
    children: opts.children ?? [],
    markdown: '',
    raw: { id },
  };
  if (opts.geometry) f.geometry = opts.geometry;
  return f;
}

function irOf(frames: Record<string, FrameIR>, root = 'root'): DeckIR {
  return {
    slug: 't',
    title: 't',
    lang: 'es',
    theme: 'editorial',
    root,
    camera: { duration_ms: 1000 },
    video: { hold_ms: 3000 },
    path: [{ id: root }],
    frames,
    deckDir: '/tmp/t',
    rawManifest: { slug: 't', root },
  };
}

function leavesGrid(n: number, layout = 'grid'): DeckIR {
  const ids = Array.from({ length: n }, (_, i) => `c${i}`);
  const frames: Record<string, FrameIR> = {
    root: frame('root', { layout, children: ids }),
  };
  for (const id of ids) frames[id] = frame(id);
  return irOf(frames);
}

function leafMeasures(n: number, size: Size = { width: 100, height: 80 }): Record<string, Size> {
  const m: Record<string, Size> = { root: { width: 0, height: 0 } };
  for (let i = 0; i < n; i++) m[`c${i}`] = { ...size };
  return m;
}

const OUTER_100_80: Size = { width: 100, height: 80 };

describe('packSiblings', () => {
  it('grid n=4, 100×80, GAP 40 → i=1 en x=140', () => {
    const sizes = [OUTER_100_80, OUTER_100_80, OUTER_100_80, OUTER_100_80];
    const slots = packSiblings(sizes, 'grid');
    assert.equal(slots.length, 4);
    assert.deepEqual(slots[0], { x: 0, y: 0 });
    assert.equal(slots[1].x, 140);
    assert.equal(slots[1].y, 0);
    assert.deepEqual(slots[2], { x: 0, y: 120 });
    assert.deepEqual(slots[3], { x: 140, y: 120 });
  });

  it('grid n=3: 2 columnas; i=2 en (0, 120)', () => {
    const slots = packSiblings([OUTER_100_80, OUTER_100_80, OUTER_100_80], 'grid');
    assert.equal(Math.max(1, Math.ceil(Math.sqrt(3))), 2);
    assert.deepEqual(slots[2], { x: 0, y: 120 });
  });

  it('row n=3: x = 0, 140, 280; y=0', () => {
    const slots = packSiblings([OUTER_100_80, OUTER_100_80, OUTER_100_80], 'row');
    assert.deepEqual(
      slots.map((s) => s.x),
      [0, 140, 280],
    );
    assert.ok(slots.every((s) => s.y === 0));
  });

  it('column n=3: y = 0, 120, 240; x=0', () => {
    const slots = packSiblings([OUTER_100_80, OUTER_100_80, OUTER_100_80], 'column');
    assert.deepEqual(
      slots.map((s) => s.y),
      [0, 120, 240],
    );
    assert.ok(slots.every((s) => s.x === 0));
  });

  it('override width antes de pack: 300 outer agranda colW[0]; i=1 en x=340', () => {
    const slots = packSiblings(
      [
        { width: 300, height: 80 },
        { width: 100, height: 80 },
      ],
      'grid',
    );
    assert.equal(slots[1].x, 340);
    assert.equal(slots[1].y, 0);
  });

  it('n=1 grid → 1 columna en (0,0)', () => {
    const slots = packSiblings([OUTER_100_80], 'grid');
    assert.equal(slots.length, 1);
    assert.deepEqual(slots[0], { x: 0, y: 0 });
    assert.equal(Math.max(1, Math.ceil(Math.sqrt(1))), 1);
  });

  it('celdas no estiran: hijo estrecho no cambia su x de columna', () => {
    const slots = packSiblings(
      [
        { width: 100, height: 80 },
        { width: 50, height: 80 },
        { width: 100, height: 80 },
      ],
      'grid',
    );
    assert.deepEqual(slots[1], { x: 140, y: 0 });
    assert.deepEqual(slots[2], { x: 0, y: 120 });
  });
});

describe('layoutTree', () => {
  it('cuerpo 100×80 → outer 148×120; i=1 x local=188', () => {
    const ir = leavesGrid(2);
    const map = layoutTree(ir, leafMeasures(2));
    assert.equal(map.c0.width, 148);
    assert.equal(map.c0.height, 120);
    assert.equal(map.c1.width, 148);
    assert.equal(map.c1.height, 120);

    const originX = map.root.x + FRAME_PAD_X;
    const originY = map.root.y + FRAME_PAD_Y + 0 + PARENT_BODY_GAP;
    // i=0 world: origin del área de hijos
    assert.equal(map.c0.x, originX);
    assert.equal(map.c0.y, originY);
    assert.equal(map.c0.x, 24);
    assert.equal(map.c0.y, 36);

    const local1 = map.c1.x - originX;
    assert.equal(local1, 188);
    assert.equal(local1, 148 + 40);

    const innerW = map.root.width - 2 * FRAME_PAD_X;
    assert.ok(innerW >= 148 + 40 + 148);
  });

  it('n=1 grid → 1 columna', () => {
    const ir = leavesGrid(1);
    const map = layoutTree(ir, leafMeasures(1));
    const originX = map.root.x + FRAME_PAD_X;
    assert.equal(map.c0.x, originX);
    assert.equal(map.c0.width, 148);
    assert.equal(map.c0.height, 120);
  });

  it('AABB de hijos ⊆ interior (pads)', () => {
    const ir = leavesGrid(4);
    const map = layoutTree(ir, leafMeasures(4));
    const p = map.root;
    for (const id of ['c0', 'c1', 'c2', 'c3']) {
      const c = map[id];
      assert.ok(c.x >= p.x + FRAME_PAD_X, `${id} x`);
      assert.ok(c.y >= p.y + FRAME_PAD_Y, `${id} y`);
      assert.ok(c.x + c.width <= p.x + p.width - FRAME_PAD_X, `${id} right`);
      assert.ok(c.y + c.height <= p.y + p.height - FRAME_PAD_Y, `${id} bottom`);
    }
  });

  it('override x que cruza hermano → overlap (medidas fake, no CLI validate)', () => {
    const ir = irOf({
      root: frame('root', { layout: 'grid', children: ['a', 'b'] }),
      a: frame('a'),
      b: frame('b', { geometry: { x: 100 } }),
    });
    const measures: Record<string, Size> = {
      root: { width: 0, height: 0 },
      a: { width: 100, height: 80 },
      b: { width: 100, height: 80 },
    };
    assert.throws(
      () => layoutTree(ir, measures),
      (err: unknown) => err instanceof LayoutError && err.code === 'overlap',
    );
  });

  it('x=0 es valor (no se trata como ausente) y solapa al hermano en 0', () => {
    const ir = irOf({
      root: frame('root', { layout: 'row', children: ['a', 'b'] }),
      a: frame('a'),
      b: frame('b', { geometry: { x: 0 } }),
    });
    const measures: Record<string, Size> = {
      root: { width: 0, height: 0 },
      a: { width: 100, height: 80 },
      b: { width: 100, height: 80 },
    };
    assert.throws(
      () => layoutTree(ir, measures),
      (err: unknown) => err instanceof LayoutError && err.code === 'overlap',
    );
  });

  it('toque de borde exacto no es overlap', () => {
    const ir = irOf({
      root: frame('root', { layout: 'row', children: ['a', 'b'] }),
      a: frame('a'),
      b: frame('b', { geometry: { x: 148 } }),
    });
    const measures: Record<string, Size> = {
      root: { width: 0, height: 0 },
      a: { width: 100, height: 80 },
      b: { width: 100, height: 80 },
    };
    const map = layoutTree(ir, measures);
    assert.equal(map.b.x - map.a.x, 148);
  });

  it('padre post-override: hijo x:200 agranda childrenArea.width', () => {
    const ir = irOf({
      root: frame('root', { layout: 'grid', children: ['a'] }),
      a: frame('a', { geometry: { x: 200 } }),
    });
    const map = layoutTree(ir, {
      root: { width: 0, height: 0 },
      a: { width: 100, height: 80 },
    });
    const innerW = map.root.width - 2 * FRAME_PAD_X;
    assert.ok(innerW >= 200 + 148);
    const originX = map.root.x + FRAME_PAD_X;
    assert.equal(map.a.x - originX, 200);
  });

  it('fake display math 520×80 → padre innerW ≥ 520; outer hoja=568', () => {
    const ir = irOf({
      root: frame('root', { layout: 'grid', children: ['hoja'] }),
      hoja: frame('hoja'),
    });
    const map = layoutTree(ir, {
      root: { width: 0, height: 0 },
      hoja: { width: 520, height: 80 },
    });
    assert.equal(map.hoja.width, 568);
    assert.equal(map.hoja.height, 80 + 2 * FRAME_PAD_Y);
    const innerW = map.root.width - 2 * FRAME_PAD_X;
    assert.ok(innerW >= 520);
  });

  it('fake img 320×240 → outer 368×280', () => {
    const ir = irOf({
      root: frame('root', { layout: 'grid', children: ['hoja'] }),
      hoja: frame('hoja'),
    });
    const map = layoutTree(ir, {
      root: { width: 0, height: 0 },
      hoja: { width: 320, height: 240 },
    });
    assert.equal(map.hoja.width, 368);
    assert.equal(map.hoja.height, 280);
  });

  it('root ignora geometry.x/y', () => {
    const ir = irOf({
      root: frame('root', { geometry: { x: 99, y: 77 }, children: [] }),
    });
    const map = layoutTree(ir, { root: { width: 10, height: 10 } });
    assert.equal(map.root.x, 0);
    assert.equal(map.root.y, 0);
  });

  it('contenido que desborda un width menor no entra en AABB', () => {
    const ir = irOf({
      root: frame('root', { layout: 'row', children: ['a', 'b'] }),
      a: frame('a', { geometry: { width: 50 } }),
      b: frame('b'),
    });
    const map = layoutTree(ir, {
      root: { width: 0, height: 0 },
      a: { width: 520, height: 80 },
      b: { width: 100, height: 80 },
    });
    assert.equal(map.a.width, 50);
    const originX = map.root.x + FRAME_PAD_X;
    assert.equal(map.b.x - originX, 50 + 40);
  });
});
