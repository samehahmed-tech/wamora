import path from 'path';
import { fileURLToPath } from 'url';

// Project dir under tsx/vite (import.meta.url) and under the esbuild CJS
// bundle (BUNDLE_DIR injected via --banner). Falls back to cwd.
function bundleDir(): string | null {
  try {
    if (typeof BUNDLE_DIR === 'string' && BUNDLE_DIR) return BUNDLE_DIR as string;
  } catch {
    /* not bundled */
  }
  return null;
}

function metaDir(): string | null {
  try {
    const u = (import.meta as any)?.url;
    if (typeof u === 'string' && u) return path.dirname(fileURLToPath(u));
  } catch {
    /* ignore */
  }
  return null;
}

declare const BUNDLE_DIR: string | undefined;

export const APP_DIR = bundleDir() || metaDir() || process.cwd();
