import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Plugin to copy additional public files
function copyPublicFiles() {
  return {
    name: 'copy-public-files',
    closeBundle() {
      const filesToCopy = [
        'about.html',
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
        main: './app/index.html',
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
  plugins: [copyPublicFiles()],
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        entryFileNames: 'scripts/[name].js'
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
