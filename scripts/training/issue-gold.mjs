import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite-node/vite-node.mjs'),
  '--config', 'apps/web/vitest.config.ts', 'scripts/training/issue-gold.ts', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, DATABASE_PATH: path.join(root, 'apps/web/data/gharibo.db') },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
