import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katex from 'katex';

const KATEX_OPTS = {
  throwOnError: true,
  output: 'htmlAndMathml' as const,
  fleqn: false,
};

function isEscaped(text: string, i: number): boolean {
  let n = 0;
  for (let k = i - 1; k >= 0 && text[k] === '\\'; k--) n++;
  return n % 2 === 1;
}

function placeholder(i: number): string {
  return `@@MATH${i}@@`;
}

/** Saca `$`/`$$` fuera de fences y de `inline code` para que markdown-it no los rompa. */
function protectMath(source: string): { md: string; math: { tex: string; display: boolean }[] } {
  const text = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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

  const math: { tex: string; display: boolean }[] = [];
  let out = '';
  let inCode = false;
  i = 0;
  while (i < n) {
    if (inFence[i]) {
      inCode = false;
      out += text[i];
      i++;
      continue;
    }
    const ch = text[i];
    if (ch === '`') {
      inCode = !inCode;
      out += ch;
      i++;
      continue;
    }
    if (inCode) {
      out += ch;
      i++;
      continue;
    }
    if (ch === '$' && !isEscaped(text, i)) {
      const display = text[i + 1] === '$' && !isEscaped(text, i + 1);
      const delim = display ? '$$' : '$';
      const start = i + delim.length;
      let j = start;
      let close = -1;
      while (j < n) {
        if (inFence[j]) break;
        if (text[j] === '`') break;
        if (text.startsWith(delim, j) && !isEscaped(text, j)) {
          close = j;
          break;
        }
        j++;
      }
      if (close === -1) {
        math.push({ tex: text.slice(start), display });
        out += placeholder(math.length - 1);
        break;
      }
      math.push({ tex: text.slice(start, close), display });
      out += placeholder(math.length - 1);
      i = close + delim.length;
      continue;
    }
    out += ch;
    i++;
  }
  return { md: out, math };
}

export function rewriteAssetSrc(src: string, slug: string): string {
  const raw = src.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) {
    throw new Error(`asset-remote: ${src}`);
  }
  const norm = raw.replace(/^\.\//, '');
  if (norm.split(/[/\\]/).includes('..') || norm.startsWith('/')) {
    throw new Error(`asset-traversal: ${src}`);
  }
  if (!norm.startsWith('assets/')) {
    throw new Error(`asset-type: ${src}`);
  }
  const file = norm.slice('assets/'.length);
  if (!file || file.includes('/') || file.includes('\\')) {
    throw new Error(`asset-type: ${src}`);
  }
  if (!/\.(png|svg)$/i.test(file)) {
    throw new Error(`asset-type: ${src}`);
  }
  return `/deck-assets/${slug}/${file}`;
}

function makeMd(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: false,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre><code class="hljs language-${md.utils.escapeHtml(lang)}">${
            hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
          }</code></pre>`;
        } catch {
          /* cae al escape */
        }
      }
      return `<pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });
  const defaultImage =
    md.renderer.rules.image ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    token.attrSet('src', rewriteAssetSrc(src, (env as { slug: string }).slug));
    return defaultImage(tokens, idx, options, env, self);
  };
  return md;
}

const md = makeMd();

export function renderFrameHtml(markdown: string, slug: string): string {
  const { md: protectedMd, math } = protectMath(markdown);
  let html = md.render(protectedMd, { slug });
  for (let i = 0; i < math.length; i++) {
    const rendered = katex.renderToString(math[i].tex, {
      ...KATEX_OPTS,
      displayMode: math[i].display,
    });
    html = html.split(placeholder(i)).join(rendered);
  }
  return html;
}
