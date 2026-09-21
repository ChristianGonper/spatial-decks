import { defineConfig } from 'astro/config';
import os from 'node:os';
import path from 'node:path';
import deckAssets from './src/integrations/deck-assets.ts';

export default defineConfig({
  output: 'static',
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
