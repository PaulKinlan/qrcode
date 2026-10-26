import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, dirname, posix } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));

// The service worker's precache list and cache version are DERIVED, never hand-maintained
// (bead qrcode-gro): the list is walked out of dist/ after the bundle is written, and the
// version is injected from package.json below. app/scripts/sw/fileManifest.js used to hold a
// hand-typed list, which silently broke offline install whenever an asset was renamed.
function generatePrecacheManifest() {
  const MANIFEST_NAME = 'sw-manifest.json';
  // Never precache the worker itself (the browser owns its update cycle) or the manifest.
  const EXCLUDED = new Set(['sw.js', MANIFEST_NAME]);

  return {
    name: 'generate-precache-manifest',
    apply: 'build',
    // Must run after copyPublicFiles() has put the public files and images into dist/.
    closeBundle() {
      const distDir = join(__dirname, 'dist');
      const files = [];

      const walk = (dir, prefix) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          const rel = prefix ? posix.join(prefix, entry) : entry;
          if (statSync(full).isDirectory()) walk(full, rel);
          else files.push(rel);
        }
      };
      walk(distDir, '');
      files.sort();

      const precache = files.filter((file) => !EXCLUDED.has(file) && !file.endsWith('.map'));
      if (precache.length === 0) {
        // An empty manifest installs a worker that caches nothing: fail the build, loudly.
        throw new Error('precache manifest: dist/ produced no files to precache');
      }

      writeFileSync(
        join(distDir, MANIFEST_NAME),
        `${JSON.stringify({ version: pkg.version, files: precache }, null, 2)}\n`
      );
      console.log(`precache manifest: ${precache.length} files for v${pkg.version}`);
    }
  };
}

// Keep /about.html as a real Vite entry without a second hand-maintained app document.
// The pre hook runs for both dev requests and production HTML entry transforms.
export function aboutHtmlAlias() {
  return {
    name: 'about-html-alias',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (context.path !== '/about.html') return html;
        // A second app document would be ignored by this alias. Refuse it instead of
        // silently discarding an About-page edit during dev or build.
        const placeholder = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<!doctype html>/i, '').trim();
        if (placeholder) {
          throw new Error('app/about.html is an alias: edit app/index.html instead of adding markup here');
        }
        return readFileSync(join(__dirname, 'app', 'index.html'), 'utf8');
      }
    }
  };
}

// Vite rewrites every static `new URL('<specifier>', import.meta.url)` at build time. The
// Emscripten glue inside @undecaf/zbar-wasm has `new URL('./', import.meta.url)` in its Node
// branch; that specifier resolves to the package's own dist/ directory, so the rewrite emits a
// byte-identical COPY of the module as an asset (dist/assets/index-<hash>.mjs), and the precache
// walker below then ships it - even though its only reader is a `process.versions.node` branch
// that cannot run in a browser worker (bead qrcode-lmm: 12.9 kB of never-fetched weight in
// every install). `@vite-ignore` suppresses the rewrite for that one call.
//
// This has to be registered under `worker.plugins`: Vite builds workers in their own
// environment, and a plugin in the top-level `plugins` array is never run for worker modules
// (verified on 6.4.1 with a logging transform hook). The module is only imported by the worker.
const ZBAR_BROWSER_ENTRY = /[\\/]@undecaf[\\/]zbar-wasm[\\/]dist[\\/]index\.mjs$/;
const EMSCRIPTEN_DIR_URL = /new URL\(\s*(["'])\.\/\1\s*,\s*import\.meta\.url\s*\)/;

function skipEmscriptenDirectoryUrl() {
  return {
    name: 'skip-emscripten-directory-url',
    enforce: 'pre',
    transform(code, id) {
      if (!ZBAR_BROWSER_ENTRY.test(id.split('?')[0]) || !EMSCRIPTEN_DIR_URL.test(code)) return null;
      return {
        code: code.replace(EMSCRIPTEN_DIR_URL, 'new URL(/* @vite-ignore */ "./", import.meta.url)'),
        map: null
      };
    }
  };
}

// Public assets copied as-is into dist/ (they sit at the site root, so Vite does not process
// them). This list is the single source of truth: test/build/dist-artifacts.test.mjs imports it
// and asserts every entry landed in dist/ (bead qrcode-f7s).
export const PUBLIC_FILES = [
  'favicon.ico',
  'humans.txt',
  'manifest.webapp',
  'robots.txt',
  'scripts/sw-register.js', // served as-is: index.html loads it as a CLASSIC script (bead qrcode-3bc)
  'webstore-manifest.json'
];

// Plugin to copy additional public files
function copyPublicFiles() {
  return {
    name: 'copy-public-files',
    // A copy failure MUST fail the build (bead qrcode-f7s). The precache manifest is derived by
    // walking whatever landed in dist/ (see generatePrecacheManifest below), so a copy that only
    // warned left the build green, the manifest and dist/ agreeing with each other, and the
    // shipped PWA silently missing an icon, the favicon or the web app manifest.
    closeBundle() {
      for (const file of PUBLIC_FILES) {
        const src = join(__dirname, 'app', file);
        const dest = join(__dirname, 'dist', file);
        try {
          copyFileSync(src, dest);
        } catch (err) {
          throw new Error(`copy-public-files: cannot copy public asset app/${file} into dist/: ${err.message}`);
        }
      }

      // Ship the LGPL license alongside the separately distributed ZBar WASM binary.
      const licensesDir = join(__dirname, 'dist', 'licenses');
      mkdirSync(licensesDir, { recursive: true });
      copyFileSync(
        join(__dirname, 'node_modules', '@undecaf', 'zbar-wasm', 'LICENSE'),
        join(licensesDir, 'zbar-wasm.txt')
      );

      // Copy all images. Also uncaught: a partially copied image tree is a broken PWA (missing
      // icons in the manifest), not a warning.
      const copyDir = (src, dest) => {
        mkdirSync(dest, { recursive: true });
        for (const entry of readdirSync(src)) {
          const srcPath = join(src, entry);
          const destPath = join(dest, entry);
          if (statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            copyFileSync(srcPath, destPath);
          }
        }
      };

      copyDir(join(__dirname, 'app', 'images'), join(__dirname, 'dist', 'images'));
    }
  };
}

export default defineConfig({
  root: 'app',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: './app/index.html',
        about: './app/about.html',
        sw: './app/sw.js'
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Service worker at root
          if (chunkInfo.name === 'sw') {
            return '[name].js';
          }
          // Everything else in scripts directory
          return 'scripts/[name].js';
        },
        chunkFileNames: 'scripts/[name].js',
        assetFileNames: (assetInfo) => {
          // Stable URL so the service worker can precache the external decoder binary.
          if (assetInfo.name.endsWith('.wasm')) {
            return 'scripts/[name].[ext]';
          }
          // Keep styles in styles directory
          if (assetInfo.name.endsWith('.css')) {
            return 'styles/[name].[ext]';
          }
          // Keep images in images directory
          if (/\.(png|jpg|jpeg|gif|svg|ico|webp)$/.test(assetInfo.name)) {
            return 'images/[name].[ext]';
          }
          // Everything else in root or appropriate location
          return '[name].[ext]';
        }
      }
    },
    target: 'es2020',
    minify: 'terser'
  },
  plugins: [aboutHtmlAlias(), copyPublicFiles(), generatePrecacheManifest()],
  // Single source of the app version: package.json. app/sw.js interpolates __APP_VERSION__
  // into its cache names, so bumping the version invalidates the cache and nothing else.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  worker: {
    format: 'es',
    // Worker modules are transformed in their own environment: see skipEmscriptenDirectoryUrl().
    plugins: () => [skipEmscriptenDirectoryUrl()],
    rollupOptions: {
      output: {
        entryFileNames: 'scripts/[name].js',
        assetFileNames: (assetInfo) => assetInfo.name.endsWith('.wasm')
          ? 'scripts/[name].[ext]'
          : 'assets/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    port: 8080,
    strictPort: false
  },
  preview: {
    port: 8080,
    strictPort: false
  }
});
