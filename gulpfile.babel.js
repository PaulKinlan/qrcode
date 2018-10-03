/**
 *
 *  QR Snapper
 *  Copyright 2018 Google Inc. All rights reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License
 *
 */
import gulp from 'gulp';
import del from 'del';
import gulpLoadPlugins from 'gulp-load-plugins';
import {rollup} from 'rollup';
import { terser } from 'rollup-plugin-terser';
import babel from 'rollup-plugin-babel';

const $ = gulpLoadPlugins();

// Optimize images
let images = () =>
  gulp.src('app/images/**/*')
    .pipe($.cache($.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe(gulp.dest('dist/images'))
    .pipe($.size({title: 'images'}));

// Copy all files at the root level (app)
let copy = () =>
  gulp.src([
    'app/*',
    '!app/*.html'
  ], {
    dot: true
  }).pipe(gulp.dest('dist'))
    .pipe($.size({title: 'copy'}));

// Compile and automatically prefix stylesheets
let styles = () => {
  const AUTOPREFIXER_BROWSERS = [
    'ie >= 10',
    'ie_mob >= 10',
    'ff >= 30',
    'chrome >= 34',
    'safari >= 7',
    'opera >= 23',
    'ios >= 7',
    'android >= 4.4',
    'bb >= 10'
  ];

  // For best performance, don't add Sass partials to `gulp.src`
  return gulp.src([
    'app/styles/**/*.css'
  ])
    // .pipe($.newer('.tmp/styles'))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('.tmp/styles'))
    .pipe($.concat('app.css'))
    // Concatenate and minify styles
    .pipe($.cssnano())
    .pipe($.size({title: 'styles'}))
    .pipe(gulp.dest('dist/styles'));
};
gulp.task('fix-styles', styles);

// Scan your HTML for assets & optimize them
let html = () => {
  return gulp.src('app/**/*.html')
    .pipe($.useref({
      searchPath: '{.tmp,app}',
      noAssets: true
    }))

    // Minify any HTML
    .pipe($.if('*.html', $.htmlmin({
      removeComments: true,
      collapseWhitespace: true,
      collapseBooleanAttributes: true,
      removeAttributeQuotes: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      removeOptionalTags: true
    })))
    // Output files
    .pipe($.if('*.html', $.size({title: 'html', showFiles: true})))
    .pipe(gulp.dest('dist'));
};

gulp.task('webserver', function() {
  gulp.src('dist')
    .pipe($.webserver({
      host: '0.0.0.0',
      port: '8080',
      directoryListing: false
    }));
});

gulp.task('webserver-dev', function() {
  gulp.src('app')
    .pipe($.webserver({
      host: 'localhost',
      port: '8080',
      directoryListing: false
    }));
});

let clean = () => {
  return del(['.tmp', 'dist/*', '!dist/.git'], {dot: true});
};

let sw = () => {
  return rollup({
    input: './app/sw.js',
    plugins: [
      terser()
    ]
  }).then(bundle => {
    return bundle.write({
      file: './dist/sw.js',
      format: 'iife'
    })
  })
}

let worker_prep_lib = () => {
  // Get all the QR code libs and put them in a tmp dir
  return gulp
            .src('app/scripts/jsqrcode/*.js')
            .pipe($.concat('qrcode.js'))
            .pipe(gulp.dest('.tmp/scripts/'));
}

let worker_prep = () => {
  return gulp
            .src('app/scripts/*.js')
            .pipe(gulp.dest('.tmp/scripts/'));
}

let worker = () => {
  return rollup({
    input: '.tmp/scripts/qrworker.js',
    plugins: [
      babel({
        babelrc: false,
        presets: [['@babel/env',{"targets": { "chrome": "52" }}]],
        exclude: 'node_modules/**'
      }),
      terser()
    ]
  }).then(bundle => {
    return bundle.write({
      file: './dist/scripts/qrworker.js',
      format: 'iife'
    })
  })
}

let client_modules = () => {
  return rollup({
    input: './app/scripts/main.mjs',
    plugins: [
      terser()
    ]
  }).then(bundle => {
    return bundle.write({
      file: './dist/scripts/main.mjs',
      format: 'es'
    })
  })
};

let client = () => {
  return rollup({
    input: './app/scripts/main.mjs',
    plugins: [
      babel({
        babelrc: false,
        presets: [['@babel/env',{"targets": { "chrome": "41" }}]],
        exclude: 'node_modules/**'
      }),
      terser()
    ]
  }).then(bundle => {
    return bundle.write({
      file: './dist/scripts/main.js',
      format: 'iife'
    })
  })
};

let build = gulp.series(clean, copy, gulp.parallel(client, client_modules, sw, gulp.series(worker_prep_lib, worker_prep, worker), styles, html, images));

gulp.task('default', build);
