import { defineConfig } from 'astro/config';
import os from 'node:os';
import path from 'node:path';
import deckAssets from './src/integrations/deck-assets.ts';

const pagesBase = process.env.PREZI_BASE;
const pagesSite = process.env.PREZI_SITE;

export default defineConfig({
  output: 'static',
  ...(pagesSite ? { site: pagesSite } : {}),
  ...(pagesBase ? { base: pagesBase } : {}),
  server: { host: true, port: 4322 },
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  integrations: [deckAssets()],
  vite: {
    cacheDir: path.join(os.homedir(), '.cache/prezi-slides-vite'),
    server: {
      host: true,
      port: 4322,
      // ROOT es ext4: inotify funciona. No usePolling.
    },
  },
});
