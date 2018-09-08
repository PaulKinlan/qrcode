'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var gulp = _interopDefault(require('gulp'));
var del = _interopDefault(require('del'));
var gulpLoadPlugins = _interopDefault(require('gulp-load-plugins'));
var rename = _interopDefault(require('gulp-rename'));
require('gulp-merge');
var rollup = _interopDefault(require('gulp-better-rollup'));
var rollupPluginUglify = require('rollup-plugin-uglify');
var uglifyEs = require('uglify-es');
var babel = _interopDefault(require('rollup-plugin-babel'));

/**
 *
 *  Web Starter Kit
 *  Copyright 2015 Google Inc. All rights reserved.
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
    //.pipe($.newer('.tmp/styles'))
    .pipe($.autoprefixer(AUTOPREFIXER_BROWSERS))
    .pipe(gulp.dest('.tmp/styles'))
    .pipe($.concat('app.css'))
    // Concatenate and minify styles
    .pipe($.cssnano())
    .pipe($.size({title: 'styles'}))
    .pipe(gulp.dest('dist/styles'));
};

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
      port: '8080',
      directoryListing: false
    }));
});

let clean = () => {
  return del(['.tmp', 'dist/*', '!dist/.git'], {dot: true});
};

let sw = () => {
  // Scripts will run rollup on the three output file
  return gulp.src('app/sw.js').pipe(
    rollup({
        output: { 
          format: 'iife'
        },
        plugins: [
          babel({
            babelrc: false,
            exclude: 'node_modules/**'
          }),
          rollupPluginUglify.uglify({}, uglifyEs.minify)
        ]
      })
  ).pipe(gulp.dest('dist/'));
};

let worker_prep_lib = () => {
  // Get all the QR code libs and put them in a tmp dir
  return gulp
            .src('app/scripts/jsqrcode/*.js')
            .pipe($.concat('qrcode.js'))
            .pipe(gulp.dest('.tmp/scripts/'));
};

let worker_prep = () => {
  return gulp
  .src('app/scripts/*.js')
  .pipe(gulp.dest('.tmp/scripts/'));
};

let worker = () => {
  return gulp.src('.tmp/scripts/qrworker.js')
    .pipe(
      rollup({
          output: { 
            format: 'iife'
          },
          plugins: [
            babel({
              babelrc: false,
              exclude: 'node_modules/**'
            }),
            rollupPluginUglify.uglify({}, uglifyEs.minify)
          ]
        })
    )
    .pipe($.rename('qrworker.js'))
    .pipe(gulp.dest('dist/scripts/'));
};

let client_modules = () => {
  // Scripts will run rollup on the three output file
  return gulp.src('app/scripts/main.js')
    .pipe(
      rollup({
          output: { 
            format: 'es'
          },
          plugins: [
            rollupPluginUglify.uglify({}, uglifyEs.minify)
          ]
        })
      )
    .pipe(rename({extname: ".mjs"}))
    .pipe(gulp.dest('dist/scripts/'));
};

let client = () => {
  // Scripts will run rollup on the three output file
  return gulp.src('app/scripts/main.js')
      .pipe(
        rollup({
          output: { 
            format: 'iife'
          },
          plugins: [
            babel({
              babelrc: false,
              exclude: 'node_modules/**'
            }),
            rollupPluginUglify.uglify({}, uglifyEs.minify)
          ]
        }))
      .pipe(gulp.dest('dist/scripts/'));
};

let build = gulp.series(clean, copy, gulp.parallel(client, client_modules, sw, gulp.series(worker_prep_lib, worker_prep, worker), styles, html, images));

gulp.task('default', build);
