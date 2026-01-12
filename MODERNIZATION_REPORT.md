# QR Snapper - Project Modernization Report

**Date:** January 2026  
**Project:** QR Snapper (QR Code Scanner PWA)  
**Current State:** Using Gulp, Rollup, Babel (2018-2019 era tooling)

## Executive Summary

This report provides a comprehensive analysis and actionable recommendations for modernizing the QR Snapper project. The project currently uses outdated build tools (Gulp 4.0, Rollup 1.9) and has several areas where modern web development practices and APIs can be adopted. This report addresses:

1. **Build Infrastructure Modernization** - Migrating from Gulp to modern build tools
2. **Project Structure Improvements** - Reorganizing code for better maintainability
3. **Modern Web API Adoption** - Leveraging current browser capabilities

---

## 1. Build Infrastructure Modernization

### Current State Analysis

**Current Build Setup:**
- **Gulp 4.0** as task runner (2018 era)
- **Rollup 1.9** for module bundling (outdated, current is 4.x)
- **Babel 7.4** for transpilation
- **Multiple Gulp plugins** for CSS, HTML, and image optimization
- **Complex multi-step build process** (see `gulpfile.babel.js`)

**Key Issues:**
- Gulp adds unnecessary complexity for simple build tasks
- Multiple transformation steps (Rollup → Babel → Terser)
- Slow build times due to sequential processing
- Need for `@babel/register` to run gulpfile
- Outdated dependencies with security vulnerabilities

### Recommended Modern Build Tools

#### Option 1: Vite (★ Recommended)

**Why Vite:**
- Lightning-fast dev server with HMR (Hot Module Replacement)
- Native ES modules in development (no bundling needed)
- Optimized production builds using Rollup 4.x under the hood
- Built-in support for service workers
- Minimal configuration required
- Excellent for PWAs

**Migration Approach:**
```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'app',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'app/index.html',
        worker: 'app/scripts/qrworker.js'
      },
      output: {
        entryFileNames: 'scripts/[name].js',
        chunkFileNames: 'scripts/[name].js',
        assetFileNames: '[ext]/[name].[ext]'
      }
    }
  },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'app',
      filename: 'sw.js',
      manifest: {
        /* your manifest.json content */
      }
    })
  ],
  worker: {
    format: 'es'
  }
});
```

**Benefits:**
- ⚡ Instant dev server startup
- 🔥 Sub-100ms HMR
- 📦 Optimized production builds
- 🛠️ No need for Babel in modern browsers
- 🔌 Rich plugin ecosystem

**Migration Effort:** Medium (1-2 days)

#### Option 2: esbuild (For Maximum Speed)

**Why esbuild:**
- 10-100x faster than traditional bundlers
- Written in Go (compiled native performance)
- Built-in minification and tree-shaking
- Simple configuration

**Configuration Example:**
```javascript
// build.js
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['app/scripts/main.mjs'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['chrome90', 'firefox88', 'safari14'],
  outfile: 'dist/scripts/main.js',
});
```

**Limitations:**
- Less mature plugin ecosystem than Vite
- No dev server (need separate tool like `serve`)
- Service worker handling requires additional setup

**Migration Effort:** Low (1 day)

#### Option 3: Parcel 2 (Zero Config)

**Why Parcel:**
- True zero-config setup
- Automatic asset optimization
- Built-in dev server with HMR
- Good PWA support

**Benefits:**
- Simplest migration path
- No configuration file needed
- Handles all asset types automatically

**Limitations:**
- Less control over build process
- Can be slower than Vite/esbuild
- Less ecosystem support than Vite

**Migration Effort:** Low (1 day)

### Recommended Migration Path

**Phase 1: Setup Vite** (Day 1)
1. Install Vite and vite-plugin-pwa
2. Create basic `vite.config.js`
3. Move `app/index.html` configuration
4. Test dev server

**Phase 2: Configure Workers** (Day 2)
1. Configure Web Worker bundling
2. Set up service worker with vite-plugin-pwa
3. Test worker functionality

**Phase 3: Production Build** (Day 3)
1. Configure production optimizations
2. Set up asset handling (images, CSS)
3. Verify PWA functionality
4. Test across browsers

**Phase 4: Cleanup** (Day 4)
1. Remove Gulp and related dependencies
2. Update package.json scripts
3. Update documentation

### Dependencies to Remove

```json
{
  "devDependencies": {
    // Remove all Gulp-related packages
    "gulp": "^4.0.0",
    "gulp-autoprefixer": "^6.0.0",
    "gulp-babel": "^8.0.0",
    "gulp-better-rollup": "^3.4.0",
    "gulp-cache": "^1.1.1",
    "gulp-concat": "^2.5.2",
    "gulp-cssnano": "^2.0.0",
    "gulp-htmlmin": "^5.0.1",
    "gulp-if": "^2.0.0",
    "gulp-imagemin": "^5.0.3",
    "gulp-load-plugins": "^1.0.0",
    "gulp-newer": "^1.0.0",
    "gulp-size": "^3.0.0",
    "gulp-useref": "^3.1.6",
    "gulp-rollup": "^2.16.2",
    
    // Remove old Babel (Vite handles this internally)
    "@babel/core": "^7.4.3",
    "@babel/preset-env": "^7.4.3",
    "@babel/register": "^7.4.0",
    
    // Remove old Rollup (Vite uses Rollup 4.x internally)
    "rollup": "^1.9.0",
    "rollup-plugin-babel": "^4.3.2",
    "rollup-plugin-terser": "^4.0.4",
    
    // Remove outdated utilities
    "del": "^3.0.0"
  }
}
```

### New Dependencies

```json
{
  "devDependencies": {
    "vite": "^6.0.0",
    "vite-plugin-pwa": "^0.21.0"
  },
  "dependencies": {
    "comlink": "^4.4.2"  // Update to latest
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "serve": "vite preview --port 8080"
  }
}
```

---

## 2. Project Structure Improvements

### Current Structure Analysis

**Current Organization:**
```
app/
├── scripts/
│   ├── jsqrcode/          # 20+ files, ~4400 lines
│   │   └── *.js           # All concatenated in build
│   ├── sw/
│   │   ├── router.js
│   │   └── fileManifest.js
│   ├── main.mjs           # 606 lines - TOO LARGE
│   ├── qrclient.js        # 15 lines
│   ├── qrworker.js        # 59 lines
│   └── comlink.js
├── styles/
├── images/
└── index.html
```

**Issues with `main.mjs`:**
- **606 lines** in a single file
- **Multiple responsibilities** mixed together:
  - Camera management
  - QR code detection logic
  - UI management (dialogs, buttons)
  - Callback handling
  - Navigation logic
- **Poor separation of concerns**
- **Difficult to test** individual components
- **Hard to maintain** and extend

### Recommended Structure

```
app/
├── index.html
├── manifest.json
├── scripts/
│   ├── main.js                    # Entry point (minimal)
│   ├── lib/                       # Extracted utilities
│   │   ├── qr-detector/           # QR detection logic
│   │   │   ├── index.js
│   │   │   ├── qrclient.js
│   │   │   └── qrworker.js
│   │   ├── jsqrcode/              # Keep as-is (third-party)
│   │   │   └── *.js
│   │   └── comlink.js
│   ├── components/                # UI components
│   │   ├── camera/
│   │   │   ├── CameraManager.js
│   │   │   ├── CameraSource.js
│   │   │   ├── WebCamManager.js
│   │   │   └── CameraFallback.js
│   │   ├── dialogs/
│   │   │   ├── QRCodeDialog.js
│   │   │   ├── AboutDialog.js
│   │   │   └── CallbackController.js
│   │   └── QRCodeCamera.js        # Main coordinator
│   ├── utils/
│   │   ├── url-utils.js           # normalizeUrl, validation
│   │   └── device-utils.js        # Feature detection
│   └── workers/
│       └── qr-worker.js
├── sw/                            # Service worker code
│   ├── sw.js
│   ├── router.js
│   └── config.js
├── styles/
│   ├── base.css
│   ├── camera.css
│   ├── dialogs.css
│   └── main.css
└── assets/
    └── images/
```

### Breaking Down `main.mjs`

#### Current Problems:

1. **QRCodeCamera** (50 lines) - Mixes initialization and event handling
2. **QRCodeManager** (86 lines) - Too many responsibilities
3. **QRCodeCallbackController** (100 lines) - Complex validation logic
4. **WebCamManager** (120 lines) - Camera handling
5. **CameraSource** (180 lines) - Low-level camera API
6. **CameraManager** (118 lines) - Canvas and overlay management

#### Recommended Breakdown:

**1. Create Component Files:**

```javascript
// components/camera/CameraManager.js
export class CameraManager {
  constructor(element) {
    this.element = element;
    this.sourceManager = null;
    this.context = null;
    // ... initialization
  }
  
  onframe(callback) { /* ... */ }
  resize() { /* ... */ }
  stop() { /* ... */ }
}
```

```javascript
// components/camera/CameraSource.js
export class CameraSource {
  constructor(videoElement) {
    this.videoElement = videoElement;
    this.stream = null;
    // ... initialization
  }
  
  async getCameras() { /* ... */ }
  async setCamera(idx) { /* ... */ }
  stop() { /* ... */ }
}
```

```javascript
// components/dialogs/QRCodeDialog.js
export class QRCodeDialog {
  constructor(element) {
    this.element = element;
    this.setupEventListeners();
  }
  
  show(url) { /* ... */ }
  hide() { /* ... */ }
  
  setupEventListeners() {
    // Handle share, copy, navigate, etc.
  }
}
```

```javascript
// utils/url-utils.js
export function normalizeUrl(url) {
  try {
    return new URL(url);
  } catch (e) {
    return null;
  }
}

export function isSecureUrl(url) {
  return url.protocol === 'https:' || url.hostname === 'localhost';
}
```

**2. Simplified Main Entry:**

```javascript
// scripts/main.js
import { QRCodeCamera } from './components/QRCodeCamera.js';
import { registerServiceWorker } from './utils/sw-register.js';

// Initialize app
const app = new QRCodeCamera();

// Register service worker
registerServiceWorker();

// Global error handling
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
```

### Module Organization Benefits

**Before:**
- ❌ 606 lines in one file
- ❌ Hard to test specific features
- ❌ Difficult to understand flow
- ❌ Changes affect entire file

**After:**
- ✅ Files under 200 lines each
- ✅ Easy to unit test individual components
- ✅ Clear separation of concerns
- ✅ Changes are isolated
- ✅ Better code reuse
- ✅ Easier onboarding for new developers

### JSQRCode Library Considerations

**Current State:**
- 20+ separate JavaScript files
- Concatenated during build
- Old ES5 code style
- ~150KB unminified

**Options:**

1. **Keep as-is** (minimal risk)
   - Already works
   - Don't fix what isn't broken
   - May want to bundle as single module

2. **Find Modern Alternative**
   - Consider `jsQR` (more modern, better maintained)
   - Consider `qr-scanner` (TypeScript, modern APIs)
   - Migration would require testing

3. **Use Native Barcode Detection API**
   - Your code already has fallback mechanism!
   - `BarcodeDetector` is in `qrworker.js`
   - Available in Chrome, Edge, Samsung Internet
   - Keep polyfill for Firefox, Safari

**Recommendation:** Keep current jsqrcode library but consider reorganizing into a single bundled module for easier management.

---

## 3. Modern Web API Adoption

### Camera API Modernization

#### Current Implementation Issues

**In `main.mjs` (CameraSource class):**
```javascript
var useMediaDevices = ('mediaDevices' in navigator
                        && 'enumerateDevices' in navigator.mediaDevices
                        && 'getUserMedia' in navigator.mediaDevices);
var gUM = (navigator.getUserMedia ||
           navigator.webkitGetUserMedia ||
           navigator.mozGetUserMedia ||
           navigator.msGetUserMedia || null);
```

**Problems:**
- Still checking for prefixed APIs (webkit, moz, ms) - unnecessary in 2026
- Uses `MediaStreamTrack.getSources()` - deprecated since 2016
- Doesn't leverage modern constraints API features
- No use of ideal/exact constraint syntax

#### Recommended Modern Approach

**1. getUserMedia with Modern Constraints:**

```javascript
// utils/camera-api.js
export class ModernCameraAPI {
  static async getCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return [];
    }
  }
  
  static async requestCamera(deviceId = null, facingMode = 'environment') {
    const constraints = {
      video: {
        facingMode: deviceId ? undefined : { ideal: facingMode },
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 1 }  // Square for QR codes
      },
      audio: false
    };
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      console.error('Camera access denied:', error);
      throw error;
    }
  }
  
  static async getDefaultCamera() {
    const cameras = await this.getCameras();
    
    // Prefer rear/environment facing camera for QR scanning
    const rearCamera = cameras.find(camera => 
      camera.label.toLowerCase().includes('back') ||
      camera.label.toLowerCase().includes('rear') ||
      camera.label.toLowerCase().includes('environment')
    );
    
    return rearCamera || cameras[0];
  }
}
```

**2. Media Stream Constraints API:**

```javascript
// Better control over camera settings
const track = stream.getVideoTracks()[0];
const capabilities = track.getCapabilities();

// If camera supports focus mode, set it to continuous
if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
  await track.applyConstraints({
    advanced: [{ focusMode: 'continuous' }]
  });
}

// If camera supports torch/flash (for low light QR scanning)
if (capabilities.torch) {
  await track.applyConstraints({
    advanced: [{ torch: true }]
  });
}
```

**3. Handle Camera Switching:**

```javascript
export class CameraController {
  constructor() {
    this.currentStream = null;
    this.cameras = [];
  }
  
  async initialize() {
    this.cameras = await ModernCameraAPI.getCameras();
    await this.switchCamera(0);
  }
  
  async switchCamera(index) {
    // Stop current stream
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
    }
    
    // Get new stream
    const camera = this.cameras[index];
    this.currentStream = await ModernCameraAPI.requestCamera(camera.deviceId);
    
    return this.currentStream;
  }
  
  async toggleTorch(enabled) {
    const track = this.currentStream?.getVideoTracks()[0];
    if (track) {
      const capabilities = track.getCapabilities();
      if (capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: enabled }]
        });
        return true;
      }
    }
    return false;
  }
}
```

### Other Modern Web APIs to Adopt

#### 1. Screen Wake Lock API

**Purpose:** Keep screen on while scanning QR codes

```javascript
// utils/wake-lock.js
export class WakeLockManager {
  constructor() {
    this.wakeLock = null;
  }
  
  async request() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake lock active');
        
        // Re-request on visibility change
        document.addEventListener('visibilitychange', async () => {
          if (this.wakeLock !== null && document.visibilityState === 'visible') {
            this.wakeLock = await navigator.wakeLock.request('screen');
          }
        });
      } catch (err) {
        console.error('Wake lock failed:', err);
      }
    }
  }
  
  release() {
    if (this.wakeLock !== null) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }
}
```

**Usage in QR Scanner:**
```javascript
const wakeLock = new WakeLockManager();
await wakeLock.request(); // When camera starts
wakeLock.release(); // When camera stops
```

#### 2. Web Share API (Already Partial)

**Current:** Basic share implementation exists  
**Enhancement:** Add share with files (share screenshots of QR codes)

```javascript
// components/share-controller.js
export class ShareController {
  static async shareUrl(url) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'QR Code',
          text: `Scanned QR Code: ${url}`,
          url: url
        });
        return true;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share failed:', err);
        }
        return false;
      }
    }
    return false;
  }
  
  static async shareImage(canvas, url) {
    if (navigator.share && navigator.canShare) {
      try {
        // Convert canvas to blob
        const blob = await new Promise(resolve => 
          canvas.toBlob(resolve, 'image/png')
        );
        
        const file = new File([blob], 'qr-code.png', { type: 'image/png' });
        
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'QR Code',
            text: url
          });
          return true;
        }
      } catch (err) {
        console.error('Share image failed:', err);
      }
    }
    return false;
  }
}
```

#### 3. Async Clipboard API (Already Partial)

**Current:** Basic clipboard.writeText()  
**Enhancement:** Better error handling and feedback

```javascript
// utils/clipboard.js
export class ClipboardManager {
  static async write(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error('Clipboard write failed:', err);
        return this.fallbackCopy(text);
      }
    }
    return this.fallbackCopy(text);
  }
  
  static fallbackCopy(text) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch (err) {
      document.body.removeChild(textarea);
      return false;
    }
  }
}
```

#### 4. Barcode Detection API (Already Implemented!)

**Current State:** Your code already has this! In `qrworker.js`:
```javascript
if ('BarcodeDetector' in self && 'getSupportedFormats' in BarcodeDetector) {
  const formats = await BarcodeDetector.getSupportedFormats();
  if (formats.find(format => format === 'qr_code')) {
    return nativeDetector(new BarcodeDetector({formats: ['qr_code']}));
  }
}
```

**Recommendation:** This is already well-implemented! Just document it better.

**Browser Support:**
- ✅ Chrome/Edge 83+
- ✅ Samsung Internet
- ❌ Firefox (use polyfill)
- ❌ Safari (use polyfill)

#### 5. View Transitions API (Optional Enhancement)

**Purpose:** Smooth transitions between scanning and result views

```javascript
// utils/transitions.js
export function smoothTransition(updateCallback) {
  if (document.startViewTransition) {
    document.startViewTransition(updateCallback);
  } else {
    updateCallback();
  }
}
```

**Usage:**
```javascript
// When showing QR code dialog
smoothTransition(() => {
  qrcodeDialog.show(url);
});
```

#### 6. File System Access API (Future Enhancement)

**Purpose:** Save scanned QR code history to local files

```javascript
// utils/file-system.js
export class QRHistoryManager {
  static async saveHistory(qrCodes) {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'qr-history.json',
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] }
          }]
        });
        
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(qrCodes, null, 2));
        await writable.close();
        
        return true;
      } catch (err) {
        console.error('Save failed:', err);
        return false;
      }
    }
    return false;
  }
}
```

#### 7. Permissions API

**Purpose:** Better UX by checking permissions before requesting

```javascript
// utils/permissions.js
export class PermissionsManager {
  static async checkCameraPermission() {
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'camera' });
        return result.state; // 'granted', 'denied', or 'prompt'
      } catch (err) {
        // Some browsers don't support camera permission query
        return 'prompt';
      }
    }
    return 'prompt';
  }
  
  static async requestCameraWithPermissionCheck() {
    const permission = await this.checkCameraPermission();
    
    if (permission === 'denied') {
      throw new Error('Camera permission denied. Please enable in settings.');
    }
    
    // Request camera access
    return await navigator.mediaDevices.getUserMedia({ video: true });
  }
}
```

#### 8. Compression Streams API (For Service Worker)

**Purpose:** Efficient caching with compression

```javascript
// sw/cache-utils.js
async function cacheWithCompression(request, response) {
  if ('CompressionStream' in self) {
    const compressionStream = new CompressionStream('gzip');
    const compressedStream = response.body.pipeThrough(compressionStream);
    
    const compressedResponse = new Response(compressedStream, {
      headers: {
        ...response.headers,
        'Content-Encoding': 'gzip'
      }
    });
    
    return compressedResponse;
  }
  return response;
}
```

### Removing Deprecated APIs

**Remove these checks (no longer needed in 2026):**

```javascript
// ❌ Remove webkit/moz prefixes
navigator.webkitGetUserMedia
navigator.mozGetUserMedia
navigator.msGetUserMedia

// ❌ Remove deprecated MediaStreamTrack.getSources
MediaStreamTrack.getSources()

// ❌ Remove old constraint syntax
video: { optional: [{ sourceId: id }] }
```

**Replace with:**

```javascript
// ✅ Modern standard APIs only
navigator.mediaDevices.getUserMedia()
navigator.mediaDevices.enumerateDevices()

// ✅ Modern constraint syntax
video: { deviceId: { exact: deviceId } }
```

### Progressive Enhancement Strategy

Always provide fallbacks for modern APIs:

```javascript
// utils/feature-detection.js
export const Features = {
  hasWakeLock: 'wakeLock' in navigator,
  hasShare: 'share' in navigator,
  hasClipboard: 'clipboard' in navigator,
  hasBarcodeDetector: 'BarcodeDetector' in window,
  hasViewTransitions: 'startViewTransition' in document,
  hasFileSystemAccess: 'showSaveFilePicker' in window,
  
  // Camera features
  async getCameraCapabilities() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      track.stop();
      return capabilities;
    } catch {
      return {};
    }
  }
};
```

---

## 4. Additional Recommendations

### TypeScript Migration (Optional)

**Benefits:**
- Type safety
- Better IDE support
- Catch errors at compile time
- Better documentation through types

**Effort:** Medium-High  
**Priority:** Low (not essential)

### Testing Infrastructure

**Currently:** No tests  
**Recommended:**

```javascript
// tests/camera.test.js
import { describe, it, expect, vi } from 'vitest';
import { CameraManager } from '../app/scripts/components/camera/CameraManager';

describe('CameraManager', () => {
  it('should initialize camera source', async () => {
    // Test implementation
  });
  
  it('should handle camera switching', async () => {
    // Test implementation
  });
});
```

**Tools:**
- Vitest (fast, Vite-compatible)
- Playwright (E2E testing)

### Performance Monitoring

```javascript
// utils/performance.js
export class PerformanceMonitor {
  static markScanStart() {
    performance.mark('scan-start');
  }
  
  static markScanEnd() {
    performance.mark('scan-end');
    performance.measure('scan-duration', 'scan-start', 'scan-end');
    
    const measure = performance.getEntriesByName('scan-duration')[0];
    console.log(`QR scan took ${measure.duration}ms`);
    
    // Send to analytics if needed
    if ('ga' in window) {
      ga('send', 'timing', 'QR Scan', 'duration', Math.round(measure.duration));
    }
  }
}
```

### Security Improvements

**Current Issue in `main.mjs`:**
```javascript
// Line 195-196
if (this.currentUrl.protocol === "javascript:") {
  console.log("XSS prevented!");
  return;
}
```

**Recommendation:** Add more comprehensive URL validation

```javascript
// utils/security.js
export class URLValidator {
  static SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'];
  
  static isSafeURL(url) {
    if (!url || !(url instanceof URL)) return false;
    
    // Check protocol
    if (!this.SAFE_PROTOCOLS.includes(url.protocol)) {
      console.warn('Unsafe protocol detected:', url.protocol);
      return false;
    }
    
    // Check for data: URLs with scripts
    if (url.protocol === 'data:') {
      const dataContent = url.href.substring(5).toLowerCase();
      if (dataContent.includes('script') || dataContent.includes('javascript')) {
        return false;
      }
    }
    
    return true;
  }
}
```

### Accessibility Improvements

```javascript
// Add ARIA labels and keyboard navigation
const cameraToggle = document.querySelector('.Camera-toggle');
cameraToggle.setAttribute('role', 'button');
cameraToggle.setAttribute('aria-label', 'Switch camera');

// Announce QR code detection to screen readers
const liveRegion = document.createElement('div');
liveRegion.setAttribute('role', 'status');
liveRegion.setAttribute('aria-live', 'polite');
liveRegion.className = 'sr-only';
document.body.appendChild(liveRegion);

// When QR code found
liveRegion.textContent = 'QR code detected';
```

---

## 5. Migration Timeline

### Quick Wins (Week 1)
- ✅ Update to modern camera API (remove prefixes)
- ✅ Add Wake Lock API
- ✅ Improve clipboard handling
- ✅ Better error handling

### Build System Migration (Week 2-3)
- 🏗️ Set up Vite
- 🏗️ Migrate build configuration
- 🏗️ Update service worker setup
- 🏗️ Test production builds

### Code Refactoring (Week 4-5)
- 📦 Break down main.mjs into modules
- 📦 Extract components
- 📦 Create utility modules
- 📦 Update imports

### Testing & Documentation (Week 6)
- ✅ Add basic tests
- ✅ Update README
- ✅ Document new APIs
- ✅ Browser compatibility testing

---

## 6. Browser Compatibility

### Current Target
- Chrome 41+ (due to Babel compilation)
- Firefox 30+
- Safari 7+

### Recommended Modern Target (2026)
- Chrome 90+ (2021)
- Firefox 88+ (2021)
- Safari 14+ (2020)
- Edge 90+ (2021)

**This allows:**
- Native ES modules
- Optional chaining (`?.`)
- Nullish coalescing (`??`)
- Async/await
- Modern DOM APIs
- No transpilation needed!

**Benefits:**
- Smaller bundle sizes
- Faster execution
- Simpler build process
- Native debugging

---

## 7. Estimated Effort

| Task | Effort | Priority | Impact |
|------|--------|----------|--------|
| Vite Migration | 3-4 days | High | High |
| Code Restructuring | 5-7 days | High | High |
| Modern Camera API | 2 days | High | Medium |
| Wake Lock API | 0.5 day | Medium | Low |
| Testing Setup | 2-3 days | Medium | Medium |
| Documentation | 1-2 days | Medium | Low |
| **Total** | **14-19 days** | | |

---

## 8. Conclusion

The QR Snapper project is well-architected but uses outdated tooling from 2018-2019. The recommended modernization approach prioritizes:

1. **Build System First** - Move to Vite for immediate developer experience improvements
2. **Code Structure Second** - Break down large files for better maintainability
3. **Modern APIs Third** - Adopt new web platform features progressively

The migration can be done incrementally without breaking existing functionality. The main benefits will be:

- ⚡ **Faster development** (Vite HMR)
- 📦 **Smaller bundles** (modern browsers, less transpilation)
- 🧪 **Better testability** (modular code)
- 🔧 **Easier maintenance** (modern tooling, better structure)
- 🚀 **Better UX** (modern APIs like Wake Lock)

**Recommendation:** Start with Vite migration, then tackle code restructuring, and finally adopt modern Web APIs incrementally based on browser support and user needs.

---

## Appendix: Sample Migration Commands

```bash
# Remove old dependencies
npm uninstall gulp gulp-* @babel/core @babel/preset-env @babel/register \
  rollup rollup-plugin-* del

# Install Vite
npm install -D vite vite-plugin-pwa

# Update comlink
npm install comlink@latest

# Optional: Add testing
npm install -D vitest @vitest/ui

# Optional: Add TypeScript support
npm install -D typescript @types/node
```

```json
// New package.json scripts
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  }
}
```
