import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js'; // Node ESM: el archivo es 2020.js, no el specifier sin extensión
import type { ErrorObject, ValidateFunction } from 'ajv';
import katex from 'katex';
import { debugLayout } from './debug.ts';
import { scanMarkdown } from './math-extract.ts';
import type { DeckIR, FrameIR, Issue, ValidationResult } from './types.ts';

const ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const LAYOUTS = new Set(['grid', 'row', 'column']);
const LANGS = new Set(['es', 'en']);

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../schema/deck.schema.json',
);

let manifestAjv: ValidateFunction | undefined;
let frameAjv: ValidateFunction | undefined;

function compileAjv(): { manifest: ValidateFunction; frame: ValidateFunction } {
  if (manifestAjv && frameAjv) return { manifest: manifestAjv, frame: frameAjv };
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
    $defs: Record<string, unknown>;
  };
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  manifestAjv = ajv.compile({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $ref: '#/$defs/DeckManifest',
    $defs: schema.$defs,
  });
  frameAjv = ajv.compile({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $ref: '#/$defs/FrameFrontmatter',
    $defs: schema.$defs,
  });
  return { manifest: manifestAjv, frame: frameAjv };
}

function schemaIssues(prefix: string, errors: ErrorObject[] | null | undefined): Issue[] {
  return (errors ?? []).map((e) => ({
    code: 'schema',
    message: `${prefix}: ${e.instancePath || '/'} ${e.message ?? 'inválido'}`,
  }));
}

export function findFrame(ir: DeckIR, id: string): { fileId: string; frame: FrameIR } | undefined {
  if (Object.prototype.hasOwnProperty.call(ir.frames, id)) {
    return { fileId: id, frame: ir.frames[id] };
  }
  for (const [fileId, frame] of Object.entries(ir.frames)) {
    if (frame.id === id) return { fileId, frame };
  }
  return undefined;
}

function classifyAsset(src: string): 'remote' | 'traversal' | 'type' | 'ok' {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return 'remote';
  const norm = src.replace(/^\.\//, '');
  const parts = norm.split(/[/\\]/);
  if (parts.includes('..') || norm.startsWith('/') || src.startsWith('/')) return 'traversal';
  if (!norm.startsWith('assets/')) return 'type';
  if (!/\.(png|svg)$/i.test(norm)) return 'type';
  return 'ok';
}

function assetAbs(deckDir: string, src: string): string {
  const norm = src.replace(/^\.\//, '');
  return join(deckDir, norm);
}

function checkKatex(tex: string, display: boolean): string | undefined {
  try {
    katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      output: 'htmlAndMathml',
      fleqn: false,
    });
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function blockLineCount(md: string): number {
  return md.split('\n').filter((ln) => ln.trim().length > 0).length;
}

export function validate(ir: DeckIR): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const { manifest, frame: frameVal } = compileAjv();

  if (!manifest(ir.rawManifest)) {
    errors.push(...schemaIssues('deck.yaml', manifest.errors));
  }
  for (const [fileId, fr] of Object.entries(ir.frames)) {
    if (!frameVal(fr.raw)) {
      errors.push(...schemaIssues(`frames/${fileId}.md`, frameVal.errors));
    }
  }

  if (basename(ir.deckDir) !== ir.slug) {
    errors.push({
      code: 'slug-mismatch',
      message: `directorio ${basename(ir.deckDir)} ≠ slug ${ir.slug}`,
    });
  }
  if (ir.theme !== 'editorial') {
    errors.push({ code: 'theme', message: `theme debe ser editorial (es ${ir.theme})` });
  }
  if (!LANGS.has(ir.lang)) {
    errors.push({ code: 'lang', message: `lang debe ser es|en (es ${ir.lang})` });
  }

  const idFiles = new Map<string, string[]>();
  for (const [fileId, fr] of Object.entries(ir.frames)) {
    if (!ID_RE.test(fileId)) {
      errors.push({ code: 'id-format', message: `filename ${fileId} no cumple el patrón de id` });
    }
    if (fr.id && !ID_RE.test(fr.id)) {
      errors.push({ code: 'id-format', message: `id ${fr.id} no cumple el patrón` });
    }
    if (fr.id !== fileId) {
      errors.push({
        code: 'id-filename',
        message: `frames/${fileId}.md: id ${fr.id} ≠ basename`,
      });
    }
    const layout = typeof fr.raw.layout === 'string' ? fr.raw.layout : fr.layout;
    if (fr.raw.layout !== undefined && !LAYOUTS.has(String(layout))) {
      errors.push({
        code: 'layout-unknown',
        message: `frames/${fileId}.md: layout ${String(layout)}`,
      });
    }
    const list = idFiles.get(fr.id) ?? [];
    list.push(fileId);
    idFiles.set(fr.id, list);
    const geo = fr.geometry;
    if (geo) {
      if (typeof geo.x === 'number' && geo.x < 0) {
        errors.push({ code: 'geometry-negative', message: `${fileId}: geometry.x < 0` });
      }
      if (typeof geo.y === 'number' && geo.y < 0) {
        errors.push({ code: 'geometry-negative', message: `${fileId}: geometry.y < 0` });
      }
    }
  }
  for (const [id, files] of idFiles) {
    if (id && files.length > 1) {
      errors.push({
        code: 'id-duplicate',
        message: `id ${id} en ${files.map((f) => `frames/${f}.md`).join(', ')}`,
      });
    }
  }

  const parentOf = new Map<string, string[]>();
  for (const [fileId, fr] of Object.entries(ir.frames)) {
    for (const child of fr.children) {
      const list = parentOf.get(child) ?? [];
      list.push(fileId);
      parentOf.set(child, list);
      if (!findFrame(ir, child)) {
        errors.push({
          code: 'child-missing',
          message: `${fileId} children: ${child} no existe`,
        });
      }
    }
  }
  for (const [child, parents] of parentOf) {
    if (parents.length > 1) {
      errors.push({
        code: 'child-multi-parent',
        message: `${child} aparece en children de ${parents.join(', ')}`,
      });
    }
  }

  if (!ir.root || !findFrame(ir, ir.root)) {
    errors.push({ code: 'root-missing', message: `root ${ir.root || '(vacío)'} no existe` });
  } else {
    const reachable = new Set<string>();
    const stack = new Set<string>();
    const visit = (id: string): void => {
      if (stack.has(id)) {
        errors.push({ code: 'cycle', message: `ciclo en ${id}` });
        return;
      }
      if (reachable.has(id)) return;
      const hit = findFrame(ir, id);
      if (!hit) return;
      stack.add(id);
      reachable.add(id);
      reachable.add(hit.fileId);
      reachable.add(hit.frame.id);
      for (const c of hit.frame.children) visit(c);
      stack.delete(id);
    };
    visit(ir.root);
    for (const [fileId, fr] of Object.entries(ir.frames)) {
      if (!reachable.has(fileId) && !reachable.has(fr.id)) {
        errors.push({
          code: 'orphan-file',
          message: `frames/${fileId}.md no alcanzable desde root`,
        });
      }
    }
  }

  for (const step of ir.path) {
    if (!findFrame(ir, step.id)) {
      errors.push({ code: 'path-missing', message: `path apunta a ${step.id}` });
    }
    if (typeof step.duration_ms === 'number' && (step.duration_ms < 800 || step.duration_ms > 1200)) {
      warnings.push({
        code: 'duration_ms',
        message: `${step.id}: duration_ms ${step.duration_ms} fuera de 800–1200`,
      });
    }
  }
  if (ir.camera.duration_ms < 800 || ir.camera.duration_ms > 1200) {
    warnings.push({
      code: 'duration_ms',
      message: `camera.duration_ms ${ir.camera.duration_ms} fuera de 800–1200`,
    });
  }

  for (const [fileId, fr] of Object.entries(ir.frames)) {
    const scan = scanMarkdown(fr.markdown);
    if (scan.unclosedFence) {
      errors.push({
        code: 'unclosed-fence',
        message: `frames/${fileId}.md: fence \`\`\` sin cierre`,
      });
    }
    if (scan.html) {
      errors.push({
        code: 'markdown-html',
        message: `frames/${fileId}.md: HTML crudo`,
      });
    }
    for (const m of scan.math) {
      const fail = checkKatex(m.tex, m.display);
      if (fail) {
        errors.push({
          code: 'math',
          message: `frames/${fileId}.md: TeX inválido (${fail})`,
        });
      }
    }
    for (const img of scan.images) {
      if (!img.alt.trim()) {
        warnings.push({
          code: 'img-alt',
          message: `frames/${fileId}.md: imagen sin alt (${img.src})`,
        });
      }
      const kind = classifyAsset(img.src);
      if (kind === 'remote') {
        errors.push({ code: 'asset-remote', message: `${fileId}: ${img.src}` });
        continue;
      }
      if (kind === 'traversal') {
        errors.push({ code: 'asset-traversal', message: `${fileId}: ${img.src}` });
        continue;
      }
      if (kind === 'type') {
        errors.push({ code: 'asset-type', message: `${fileId}: ${img.src}` });
        continue;
      }
      if (!existsSync(assetAbs(ir.deckDir, img.src))) {
        errors.push({
          code: 'asset-missing',
          message: `${fileId}: no existe ${img.src}`,
        });
      }
    }
    if (blockLineCount(fr.markdown) > 12) {
      warnings.push({
        code: 'body-long',
        message: `frames/${fileId}.md: cuerpo > 12 líneas de bloque`,
      });
    }
  }

  // overlap AABB exige geometry.width+height en cada hermano y el packer; sin eso no se evalúa.
  debugLayout('validate', ir.slug, errors.length, warnings.length);

  return { ok: errors.length === 0, errors, warnings };
}
