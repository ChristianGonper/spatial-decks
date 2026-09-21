import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katex from 'katex';
import { mathPlaceholder, protectMath } from './math-extract.ts';
import { withBase } from './public-path.ts';

const KATEX_OPTS = {
  throwOnError: true,
  output: 'htmlAndMathml' as const,
  fleqn: false,
};

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
  return withBase(`deck-assets/${slug}/${file}`);
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
    html = html.split(mathPlaceholder(i)).join(rendered);
  }
  return html;
}
