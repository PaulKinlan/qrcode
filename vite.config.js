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
function aboutHtmlAlias() {
  return {
    name: 'about-html-alias',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return context.path === '/about.html'
          ? readFileSync(join(__dirname, 'app', 'index.html'), 'utf8')
          : html;
      }
    }
  };
}

// Plugin to copy additional public files
function copyPublicFiles() {
  return {
    name: 'copy-public-files',
    closeBundle() {
      const filesToCopy = [
        'favicon.ico',
        'humans.txt',
        'manifest.webapp',
        'robots.txt',
        'webstore-manifest.json'
      ];

      filesToCopy.forEach(file => {
        try {
          const src = join(__dirname, 'app', file);
          const dest = join(__dirname, 'dist', file);
          copyFileSync(src, dest);
        } catch (err) {
          console.warn(`Failed to copy ${file}:`, err.message);
        }
      });

      // Ship the LGPL license alongside the separately distributed ZBar WASM binary.
      const licensesDir = join(__dirname, 'dist', 'licenses');
      mkdirSync(licensesDir, { recursive: true });
      copyFileSync(
        join(__dirname, 'node_modules', '@undecaf', 'zbar-wasm', 'LICENSE'),
        join(licensesDir, 'zbar-wasm.txt')
      );

      // Copy all images
      const copyDir = (src, dest) => {
        try {
          mkdirSync(dest, { recursive: true });
          const entries = readdirSync(src);
          entries.forEach(entry => {
            const srcPath = join(src, entry);
            const destPath = join(dest, entry);
            const stat = statSync(srcPath);
            if (stat.isDirectory()) {
              copyDir(srcPath, destPath);
            } else {
              copyFileSync(srcPath, destPath);
            }
          });
        } catch (err) {
          console.warn(`Failed to copy directory ${src}:`, err.message);
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
