// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
// TODO: we could probably replace all gulp with only webpack

import fs from 'fs'
import del from 'del'
import _defaultsDeep from 'lodash/defaultsDeep'
import _map from 'lodash/map'
import _mapValues from 'lodash/mapValues'
import gulp from 'gulp'
import gutil from 'gulp-util'
import webpack from 'webpack'
import autoprefixer from 'autoprefixer'
import manifest from 'gulp-manifest'
import { spawn } from 'child_process'
import webpackStream from 'webpack-stream'
import WebpackDevServer from 'webpack-dev-server'
import HandleCSSLoader from 'webpack-handle-css-loader'
import TerserPlugin from 'terser-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
// import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'
import gcPub from 'gulp-gcloud-publish'
import gzip from 'gulp-gzip'
import sizereport from 'gulp-sizereport'

export default (function ({ config, Lang, paths }) {
  const webpackBase = {
    mode: 'development',
    node: {
      Buffer: false,
      setImmediate: false
    },
    module: {
      exprContextRegExp: /$^/,
      exprContextCritical: false
    },
    resolve: {
      extensions: ['.js', '.json'],
      alias: {
        react: 'preact/compat',
        'react-dom': 'preact/compat'
      }
    },
    output: {
      filename: 'bundle.js',
      publicPath: `${config.SCRIPTS_CDN_URL}/`
    }
  }

  gulp.task('build:static:dev', () => gulp.src(paths.static)
    .pipe(gulp.dest(paths.build)))

  gulp.task('dist:clean', cb => del(paths.dist + '/*', cb))

  gulp.task('dist:static', gulp.series('dist:clean', () => gulp.src(paths.static)
    .pipe(gulp.dest(paths.dist)))
  )

  gulp.task('dist:sw:script', () => gulp.src(paths.sw)
    .pipe(webpackStream(_defaultsDeep({
      mode: 'production',
      optimization: {
        minimizer: [
          new TerserPlugin({
            parallel: true,
            terserOptions: {
              mangle: {
                reserved: ['process']
              }
            }
          })
        ]
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            loader: 'babel-loader',
            options: {
              configFile: false, // don't use local ssr settings
              presets: ['@babel/env'],
              plugins: ['@babel/plugin-syntax-dynamic-import']
            }
          }
        ]
      },
      output: {
        filename: 'service_worker.js'
      },
      plugins: [],
      resolve: {
        extensions: ['.js', '.json']
      }
    }, webpackBase), require('webpack'))).pipe(gulp.dest(paths.dist)))

  gulp.task('dist:sw:replace', function (done) {
    const stats = JSON.parse(fs.readFileSync(`${paths.dist}/stats.json`))
    let sw = fs.readFileSync(`${paths.dist}/service_worker.js`, 'utf-8')
    sw = sw.replace(/\|HASH\|/g, stats.hash)
    fs.writeFileSync(`${paths.dist}/service_worker.js`, sw, 'utf-8')
    return done()
  })

  gulp.task('dist:scripts', gulp.series('dist:clean', function () {
    const handleLoader = new HandleCSSLoader({
      minimize: true,
      extract: true,
      sourceMap: false,
      cssModules: false,
      postcss: [
        autoprefixer({
          browsers: ['> 3% in US', 'last 2 firefox versions']
        })
      ]
    })
    _map(config.LANGUAGES, language => fs.writeFileSync(
      `${paths.dist}/lang_${language}.json`,
      Lang.getJsonString(language)
    ))

    const scriptsConfig = _defaultsDeep({
      mode: 'production',
      optimization: {
        usedExports: true, // tree shake lodash
        minimizer: [
          new TerserPlugin({
            parallel: true,
            terserOptions: {
              // ecma: 6
              ie8: false,
              mangle: {
                reserved: ['process']
              }
            }
          })
        ]
      },
      plugins: [
        // new BundleAnalyzerPlugin()
        new webpack.IgnorePlugin({
          resourceRegExp: /\.json$/,
          contextRegExp: /lang/
        }),
        new MiniCssExtractPlugin({
          filename: 'bundle.css'
        }),
        function () {
          return this.plugin('done', function (stats) {
            if (stats.compilation.errors && stats.compilation.errors.length) {
              console.log(stats.compilation.errors)
              return process.exit(1)
            }
          })
        }
      ],
      // remark requires this (parse-entities -> character-entities)
      // character-entities is 38kb and not really necessary. legacy is 1.64kb
      resolve: {
        alias: {
          'character-entities': 'character-entities-legacy'
        }
      },
      output: {
        // TODO: '[hash].bundle.js' if we have caching issues, or use appcache
        filename: 'bundle.js',
        chunkFilename: '[name]_bundle_[hash].js'
      },
      module: {
        rules: [
          {
            test: /\.js$/,
            loader: 'babel-loader',
            options: {
              configFile: false, // don't use local ssr settings
              presets: [['@babel/preset-env', { modules: false, targets: '> 0.25%, not dead' }]],
              plugins: [
                '@babel/plugin-syntax-dynamic-import',
                '@babel/plugin-transform-runtime'
              ]
            }
          },
          handleLoader.css(),
          handleLoader.styl()
        ]
      }
    }, webpackBase)

    return gulp.src(paths.root)
      .pipe(webpackStream(scriptsConfig, require('webpack'), function (err, stats) {
        if (err) {
          gutil.log(err)
          return
        }
        const statsJson = JSON.stringify({ hash: stats.toJson().hash, time: Date.now() })
        return fs.writeFileSync(`${paths.dist}/stats.json`, statsJson)
      })).pipe(gulp.dest(paths.dist))
  })
  )

  gulp.task('dist:concat', function (done) {
    const stats = JSON.parse(fs.readFileSync(`${paths.dist}/stats.json`))

    fs.renameSync(
      `${paths.dist}/bundle.css`,
      `${paths.dist}/bundle_${stats.hash}.css`
    )

    let bundle = fs.readFileSync(`${paths.dist}/bundle.js`, 'utf-8')
    bundle = bundle.replace(/\|HASH\|/g, stats.hash)
    const matches = bundle.match(/process\.env\.[a-zA-Z0-9_]+/g)
    _map(matches, function (match) {
      const key = match.replace('process.env.', '')
      bundle = bundle.replace(match, `'${process.env[key]}'`)
      return bundle
    })
    _map(config.LANGUAGES, function (language) {
      const lang = fs.readFileSync(
        `${paths.dist}/lang_${language}.json`, 'utf-8'
      )
      return fs.writeFileSync(
        `${paths.dist}/bundle_${stats.hash}_${language}.js`,
        lang + bundle
        , 'utf-8')
    })
    return done()
  })

  gulp.task('dist:gc', () => gulp.src(`${paths.dist}/*bundle*`)
    .pipe(gzip())
    .pipe(gcPub({
      bucket: 'fdn.uno',
      keyFilename: '../padlock/free-roam-google-cloud-storage-creds.json',
      projectId: 'free-roam-app',
      base: '/d/scripts',
      public: true,
      transformDestination (path) {
        return path
      },
      metadata: {
        cacheControl: 'max-age=315360000, no-transform, public'
      }
    })))

  gulp.task('dist:manifest', gulp.series(gulp.parallel('dist:static', 'dist:scripts'), () => gulp.src(paths.manifest)
    .pipe(manifest({
      hash: true,
      timestamp: false,
      preferOnline: true,
      fallback: ['/ /offline.html']
    }))
    .pipe(gulp.dest(paths.dist)))
  )

  gulp.task('dist:sizereport', () => gulp.src(`${paths.dist}/bundle*`)
    .pipe(sizereport()))

  gulp.task('dist:sw', gulp.series(
    'dist:sw:script',
    'dist:sw:replace'
  )
  )

  gulp.task('dist', gulp.series(
    'dist:clean',
    gulp.parallel('dist:scripts', 'dist:static'),
    'dist:concat',
    'dist:sw',
    'dist:gc',
    'dist:sizereport'
  )
  )

  gulp.task('dev:server', gulp.series('build:static:dev', (function () {
    let devServer = null
    process.on('exit', () => devServer != null ? devServer.kill() : undefined)
    return function () {
      if (devServer != null) {
        devServer.kill()
      }
      devServer = spawn('babel-node', ['bin/dev_server.js'], { stdio: 'inherit' })
      return devServer.on('close', function (code) {
        if (code === 8) {
          return gulp.log('Error detected, waiting for changes')
        }
      })
    }
  })()
  )
  )

  gulp.task('dev:webpack-server', function () {
    const entries = [
      `webpack-dev-server/client?${config.WEBPACK_DEV_URL}`,
      'webpack/hot/dev-server',
      paths.root
    ]

    const handleLoader = new HandleCSSLoader({
      minimize: false,
      extract: false,
      sourceMap: false,
      cssModules: false,
      postcss: [
        autoprefixer({
          browsers: ['> 3% in US', 'last 2 firefox versions']
        })
      ]
    })

    const compiler = webpack(_defaultsDeep({
      devtool: 'inline-source-map',
      entry: entries,
      output: {
        path: __dirname,
        publicPath: `${config.WEBPACK_DEV_URL}/`,
        pathinfo: false
      }, // seems to improve perf
      module: {
        rules: [
          {
            test: /\.js$/,
            loader: 'babel-loader',
            options: {
              presets: ['@babel/env'],
              plugins: ['@babel/plugin-syntax-dynamic-import']
            }
          },
          handleLoader.css(),
          handleLoader.styl()
        ]
      },
      plugins: [
        new webpack.HotModuleReplacementPlugin(),
        // new webpack.IgnorePlugin /\.json$/, /lang/
        // new HardSourceWebpackPlugin()
        new webpack.DefinePlugin({ 'process.env': _mapValues(process.env, val => JSON.stringify(val)) })
      ]
    }, webpackBase)
    )

    const webpackOptions = {
      publicPath: `${config.WEBPACK_DEV_URL}/`,
      hot: true,
      headers: { 'Access-Control-Allow-Origin': '*' },
      noInfo: true,
      disableHostCheck: true
    }

    if (config.DEV_USE_HTTPS) {
      console.log('using https')
      webpackOptions.https = true
      webpackOptions.key = fs.readFileSync('./bin/fr-dev.key')
      webpackOptions.cert = fs.readFileSync('./bin/fr-dev.crt')
    }

    return new WebpackDevServer(compiler, webpackOptions)
      .listen(config.WEBPACK_DEV_PORT, function (err) {
        if (err) {
          return console.log(err)
        } else {
          return console.log({
            event: 'webpack_server_start',
            message: `Webpack listening on port ${config.WEBPACK_DEV_PORT}`
          })
        }
      })
  })

  gulp.task('watch', () => gulp.watch(paths.js, ['dev:server']))

  gulp.task('watch:dev:server', gulp.series('dev:server', () => gulp.watch(paths.js, ['dev:server'])))

  return gulp.task('dev', gulp.parallel('dev:webpack-server', 'watch:dev:server'))
})