"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _fs = _interopRequireDefault(require("fs"));

var _del = _interopRequireDefault(require("del"));

var _defaultsDeep2 = _interopRequireDefault(require("lodash/defaultsDeep"));

var _map2 = _interopRequireDefault(require("lodash/map"));

var _mapValues2 = _interopRequireDefault(require("lodash/mapValues"));

var _gulp = _interopRequireDefault(require("gulp"));

var _gulpUtil = _interopRequireDefault(require("gulp-util"));

var _webpack = _interopRequireDefault(require("webpack"));

var _autoprefixer = _interopRequireDefault(require("autoprefixer"));

var _gulpManifest = _interopRequireDefault(require("gulp-manifest"));

var _child_process = require("child_process");

var _webpackStream = _interopRequireDefault(require("webpack-stream"));

var _webpackDevServer = _interopRequireDefault(require("webpack-dev-server"));

var _webpackHandleCssLoader = _interopRequireDefault(require("webpack-handle-css-loader"));

var _terserWebpackPlugin = _interopRequireDefault(require("terser-webpack-plugin"));

var _miniCssExtractPlugin = _interopRequireDefault(require("mini-css-extract-plugin"));

// var _webpackBundleAnalyzer = require("webpack-bundle-analyzer");

var _gulpGcloudPublish = _interopRequireDefault(require("gulp-gcloud-publish"));

var _gulpGzip = _interopRequireDefault(require("gulp-gzip"));

var _gulpSizereport = _interopRequireDefault(require("gulp-sizereport"));

var _default = function _default(_ref) {
  var config = _ref.config,
      Lang = _ref.Lang,
      paths = _ref.paths;
  var webpackBase = {
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
      publicPath: "".concat(config.SCRIPTS_CDN_URL, "/")
    }
  };

  _gulp["default"].task('build:static:dev', function () {
    return _gulp["default"].src(paths["static"]).pipe(_gulp["default"].dest(paths.build));
  });

  _gulp["default"].task('dist:clean', function (cb) {
    return (0, _del["default"])(paths.dist + '/*', cb);
  });

  _gulp["default"].task('dist:static', _gulp["default"].series('dist:clean', function () {
    return _gulp["default"].src(paths["static"]).pipe(_gulp["default"].dest(paths.dist));
  }));

  _gulp["default"].task('dist:sw:script', function () {
    return _gulp["default"].src(paths.sw).pipe((0, _webpackStream["default"])((0, _defaultsDeep2["default"])({
      mode: 'production',
      optimization: {
        minimizer: [new _terserWebpackPlugin["default"]({
          parallel: true,
          terserOptions: {
            mangle: {
              reserved: ['process']
            }
          }
        })]
      },
      module: {
        rules: [{
          test: /\.js$/,
          loader: 'babel-loader',
          options: {
            configFile: false,
            // don't use local ssr settings
            presets: ['@babel/env'],
            plugins: ['@babel/plugin-syntax-dynamic-import']
          }
        }]
      },
      output: {
        filename: 'service_worker.js'
      },
      plugins: [],
      resolve: {
        extensions: ['.js', '.json']
      }
    }, webpackBase), require('webpack'))).pipe(_gulp["default"].dest(paths.dist));
  });

  _gulp["default"].task('dist:sw:replace', function (done) {
    var stats = JSON.parse(_fs["default"].readFileSync("".concat(paths.dist, "/stats.json")));

    var sw = _fs["default"].readFileSync("".concat(paths.dist, "/service_worker.js"), 'utf-8');

    sw = sw.replace(/\|HASH\|/g, stats.hash);

    _fs["default"].writeFileSync("".concat(paths.dist, "/service_worker.js"), sw, 'utf-8');

    return done();
  });

  _gulp["default"].task('dist:scripts', _gulp["default"].series('dist:clean', function () {
    var handleLoader = new _webpackHandleCssLoader["default"]({
      minimize: true,
      extract: true,
      sourceMap: false,
      cssModules: false,
      postcss: [(0, _autoprefixer["default"])({
        browsers: ['> 3% in US', 'last 2 firefox versions']
      })]
    });
    (0, _map2["default"])(config.LANGUAGES, function (language) {
      return _fs["default"].writeFileSync("".concat(paths.dist, "/lang_").concat(language, ".json"), Lang.getJsonString(language));
    });
    var scriptsConfig = (0, _defaultsDeep2["default"])({
      mode: 'production',
      optimization: {
        // tree shake lodash
        usedExports: true,
        minimizer: [new _terserWebpackPlugin["default"]({
          parallel: true,
          terserOptions: {
            // ecma: 6
            ie8: false,
            mangle: {
              reserved: ['process']
            }
          }
        })]
      },
      plugins: [
        // new _webpackBundleAnalyzer.BundleAnalyzerPlugin(), 
        new _webpack["default"].IgnorePlugin({
        resourceRegExp: /\.json$/,
        contextRegExp: /lang/
      }), new _miniCssExtractPlugin["default"]({
        filename: 'bundle.css'
      }), function () {
        return this.plugin('done', function (stats) {
          if (stats.compilation.errors && stats.compilation.errors.length) {
            console.log(stats.compilation.errors);
            return process.exit(1);
          }
        });
      }],
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
        rules: [{
          test: /\.js$/,
          loader: 'babel-loader',
          options: {
            configFile: false,
            // don't use local ssr settings
            presets: [['@babel/preset-env', {
              modules: false,
              targets: '> 0.25%, not dead'
            }]],
            plugins: ['@babel/plugin-syntax-dynamic-import', '@babel/plugin-transform-runtime']
          }
        }, handleLoader.css(), handleLoader.styl()]
      }
    }, webpackBase);
    return _gulp["default"].src(paths.root).pipe((0, _webpackStream["default"])(scriptsConfig, require('webpack'), function (err, stats) {
      if (err) {
        _gulpUtil["default"].log(err);

        return;
      }

      var statsJson = JSON.stringify({
        hash: stats.toJson().hash,
        time: Date.now()
      });
      return _fs["default"].writeFileSync("".concat(paths.dist, "/stats.json"), statsJson);
    })).pipe(_gulp["default"].dest(paths.dist));
  }));

  _gulp["default"].task('dist:concat', function (done) {
    var stats = JSON.parse(_fs["default"].readFileSync("".concat(paths.dist, "/stats.json")));

    _fs["default"].renameSync("".concat(paths.dist, "/bundle.css"), "".concat(paths.dist, "/bundle_").concat(stats.hash, ".css"));

    var bundle = _fs["default"].readFileSync("".concat(paths.dist, "/bundle.js"), 'utf-8');

    bundle = bundle.replace(/\|HASH\|/g, stats.hash);
    var matches = bundle.match(/process\.env\.[a-zA-Z0-9_]+/g);
    (0, _map2["default"])(matches, function (match) {
      var key = match.replace('process.env.', '');
      bundle = bundle.replace(match, "'".concat(process.env[key], "'"));
      return bundle;
    });
    (0, _map2["default"])(config.LANGUAGES, function (language) {
      var lang = _fs["default"].readFileSync("".concat(paths.dist, "/lang_").concat(language, ".json"), 'utf-8');

      return _fs["default"].writeFileSync("".concat(paths.dist, "/bundle_").concat(stats.hash, "_").concat(language, ".js"), lang + bundle, 'utf-8');
    });
    return done();
  });

  _gulp["default"].task('dist:gc', function () {
    return _gulp["default"].src("".concat(paths.dist, "/*bundle*")).pipe((0, _gulpGzip["default"])()).pipe((0, _gulpGcloudPublish["default"])({
      bucket: 'fdn.uno',
      keyFilename: '../padlock/free-roam-google-cloud-storage-creds.json',
      projectId: 'free-roam-app',
      base: '/d/scripts',
      "public": true,
      transformDestination: function transformDestination(path) {
        return path;
      },
      metadata: {
        cacheControl: 'max-age=315360000, no-transform, public'
      }
    }));
  });

  _gulp["default"].task('dist:manifest', _gulp["default"].series(_gulp["default"].parallel('dist:static', 'dist:scripts'), function () {
    return _gulp["default"].src(paths.manifest).pipe((0, _gulpManifest["default"])({
      hash: true,
      timestamp: false,
      preferOnline: true,
      fallback: ['/ /offline.html']
    })).pipe(_gulp["default"].dest(paths.dist));
  }));

  _gulp["default"].task('dist:sizereport', function () {
    return _gulp["default"].src("".concat(paths.dist, "/bundle*")).pipe((0, _gulpSizereport["default"])());
  });

  _gulp["default"].task('dist:sw', _gulp["default"].series('dist:sw:script', 'dist:sw:replace'));

  _gulp["default"].task('dist', _gulp["default"].series('dist:clean', _gulp["default"].parallel('dist:scripts', 'dist:static'), 'dist:concat', 'dist:sw', 'dist:gc', 'dist:sizereport'));

  _gulp["default"].task('dev:server', _gulp["default"].series('build:static:dev', function () {
    var devServer;
    process.on('exit', function () {
      var _devServer;

      return (_devServer = devServer) === null || _devServer === void 0 ? void 0 : _devServer.kill();
    });
    return function () {
      var _devServer2;

      (_devServer2 = devServer) === null || _devServer2 === void 0 ? void 0 : _devServer2.kill();
      devServer = (0, _child_process.spawn)('node', ['-r', paths.babelConfig, 'bin/dev_server.js'], {
        stdio: 'inherit'
      });
      return devServer.on('close', function (code) {
        if (code === 8) {
          return _gulp["default"].log('Error detected, waiting for changes');
        }
      });
    };
  }()));

  _gulp["default"].task('dev:webpack-server', function () {
    var entries = ["webpack-dev-server/client?".concat(config.WEBPACK_DEV_URL), 'webpack/hot/dev-server', paths.root];
    var handleLoader = new _webpackHandleCssLoader["default"]({
      minimize: false,
      extract: false,
      sourceMap: false,
      cssModules: false,
      postcss: [(0, _autoprefixer["default"])({
        browsers: ['> 3% in US', 'last 2 firefox versions']
      })]
    });
    var compiler = (0, _webpack["default"])((0, _defaultsDeep2["default"])({
      devtool: 'inline-source-map',
      entry: entries,
      output: {
        path: __dirname,
        publicPath: "".concat(config.WEBPACK_DEV_URL, "/"),
        pathinfo: false
      },
      // seems to improve perf
      module: {
        rules: [{
          test: /\.js$/,
          loader: 'babel-loader',
          options: {
            presets: ['@babel/env'],
            plugins: ['@babel/plugin-syntax-dynamic-import']
          }
        }, handleLoader.css(), handleLoader.styl()]
      },
      plugins: [new _webpack["default"].HotModuleReplacementPlugin(), // new webpack.IgnorePlugin /\.json$/, /lang/
      // new HardSourceWebpackPlugin()
      new _webpack["default"].DefinePlugin({
        'process.env': (0, _mapValues2["default"])(process.env, function (val) {
          return JSON.stringify(val);
        })
      })]
    }, webpackBase));
    var webpackOptions = {
      publicPath: "".concat(config.WEBPACK_DEV_URL, "/"),
      hot: true,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      noInfo: true,
      disableHostCheck: true
    };

    if (config.DEV_USE_HTTPS) {
      console.log('using https');
      webpackOptions.https = true;
      webpackOptions.key = _fs["default"].readFileSync('./bin/fr-dev.key');
      webpackOptions.cert = _fs["default"].readFileSync('./bin/fr-dev.crt');
    }

    return new _webpackDevServer["default"](compiler, webpackOptions).listen(config.WEBPACK_DEV_PORT, function (err) {
      if (err) {
        return console.log(err);
      } else {
        return console.log({
          event: 'webpack_server_start',
          message: "Webpack listening on port ".concat(config.WEBPACK_DEV_PORT)
        });
      }
    });
  });

  _gulp["default"].task('watch', function () {
    return _gulp["default"].watch(paths.js, ['dev:server']);
  });

  _gulp["default"].task('watch:dev:server', _gulp["default"].series('dev:server', function () {
    return _gulp["default"].watch(paths.js, ['dev:server']);
  }));

  return _gulp["default"].task('dev', _gulp["default"].parallel('dev:webpack-server', 'watch:dev:server'));
};

exports["default"] = _default;
