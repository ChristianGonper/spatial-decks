export type MathSpan = {
  tex: string;
  display: boolean;
  start: number;
  end: number;
};
export type MdImage = { alt: string; src: string };

export function mathPlaceholder(i: number): string {
  return `@@MATH${i}@@`;
}

export type ScanResult = {
  math: MathSpan[];
  images: MdImage[];
  unclosedFence: boolean;
  html: boolean;
};

function normalizeNewlines(source: string): string {
  return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function isEscaped(text: string, i: number): boolean {
  let n = 0;
  for (let k = i - 1; k >= 0 && text[k] === '\\'; k--) n++;
  return n % 2 === 1;
}

/** Fences ``` por línea; $ / $$ y HTML fuera de fences y de `inline code`. */
export function scanMarkdown(source: string): ScanResult {
  const text = normalizeNewlines(source);
  const n = text.length;
  const inFence = new Uint8Array(n);
  let fenceOpen = false;
  let i = 0;
  while (i < n) {
    const nl = text.indexOf('\n', i);
    const lineEnd = nl === -1 ? n : nl;
    const line = text.slice(i, lineEnd);
    if (/^\s*```/.test(line)) {
      fenceOpen = !fenceOpen;
      inFence.fill(1, i, lineEnd);
    } else if (fenceOpen) {
      inFence.fill(1, i, lineEnd);
    }
    i = lineEnd + 1;
  }
  const unclosedFence = fenceOpen;

  const math: MathSpan[] = [];
  const images: MdImage[] = [];
  let html = false;
  let inCode = false;

  i = 0;
  while (i < n) {
    if (inFence[i]) {
      inCode = false;
      i++;
      continue;
    }
    const ch = text[i];
    if (ch === '`') {
      inCode = !inCode;
      i++;
      continue;
    }
    if (inCode) {
      i++;
      continue;
    }
    if (ch === '<' && i + 1 < n && /[A-Za-z]/.test(text[i + 1])) {
      html = true;
      i++;
      continue;
    }
    if (text.startsWith('![', i)) {
      const altEnd = text.indexOf(']', i + 2);
      if (altEnd !== -1 && text[altEnd + 1] === '(') {
        const srcEnd = text.indexOf(')', altEnd + 2);
        if (srcEnd !== -1) {
          images.push({
            alt: text.slice(i + 2, altEnd),
            src: text.slice(altEnd + 2, srcEnd).trim(),
          });
          i = srcEnd + 1;
          continue;
        }
      }
    }
    if (ch === '$' && !isEscaped(text, i)) {
      const display = text[i + 1] === '$' && !isEscaped(text, i + 1);
      const delim = display ? '$$' : '$';
      const start = i + delim.length;
      let j = start;
      let close = -1;
      while (j < n) {
        if (inFence[j]) break;
        if (text[j] === '`' ) {
          // inline code corta el math
          break;
        }
        if (text.startsWith(delim, j) && !isEscaped(text, j)) {
          close = j;
          break;
        }
        j++;
      }
      if (close === -1) {
        math.push({ tex: text.slice(start), display, start: i, end: n });
        break;
      }
      math.push({
        tex: text.slice(start, close),
        display,
        start: i,
        end: close + delim.length,
      });
      i = close + delim.length;
      continue;
    }
    i++;
  }

  return { math, images, unclosedFence, html };
}

/** Sustituye `$`/`$$` por placeholders para que markdown-it no los interprete. */
export function protectMath(source: string): { md: string; math: MathSpan[] } {
  const text = normalizeNewlines(source);
  const { math } = scanMarkdown(text);
  let md = text;
  for (let i = math.length - 1; i >= 0; i--) {
    md = md.slice(0, math[i].start) + mathPlaceholder(i) + md.slice(math[i].end);
  }
  return { md, math };
}
