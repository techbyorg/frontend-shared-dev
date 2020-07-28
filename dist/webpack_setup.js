"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = _default;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _fs = _interopRequireDefault(require("fs"));

var _webpack = _interopRequireDefault(require("webpack"));

var _awsSdk = _interopRequireDefault(require("aws-sdk"));

var _webpackHandleCssLoader = _interopRequireDefault(require("webpack-handle-css-loader"));

var _terserWebpackPlugin = _interopRequireDefault(require("terser-webpack-plugin"));

var _miniCssExtractPlugin = _interopRequireDefault(require("mini-css-extract-plugin"));

var _autoprefixer = _interopRequireDefault(require("autoprefixer"));

var _webpackS3Plugin = _interopRequireDefault(require("webpack-s3-plugin"));

var _cleanWebpackPlugin = require("clean-webpack-plugin");

var _webpackStatsPlugin = require("webpack-stats-plugin");

var _replaceHashInFileWebpackPlugin = _interopRequireDefault(require("replace-hash-in-file-webpack-plugin"));

var _copyWebpackPlugin = _interopRequireDefault(require("copy-webpack-plugin"));

var _lodash = _interopRequireDefault(require("lodash"));

// use babel until https://github.com/webpack/webpack-cli/issues/282 is resolved
// source ../kube/secrets/production.env.sh && ./node_modules/webpack/bin/webpack.js --config-register ~/dev/impact/babel.register.config.js
// ./node_modules/webpack/bin/webpack.js --config-register ~/dev/impact/babel.register.config.js
// import webpackStream from 'webpack-stream'
// import WebpackDevServer from 'webpack-dev-server'
// import CompressionPlugin from 'compression-webpack-plugin'
function _default(_ref) {
  var Lang = _ref.Lang,
      paths = _ref.paths,
      config = _ref.config;
  // This is the main configuration object.
  // Here you write different options and tell Webpack what to do
  var handleLoader = new _webpackHandleCssLoader["default"]({
    minimize: config.ENV === config.ENVS.PROD,
    extract: !process.env.WEBPACK_DEV_SERVER,
    sourceMap: false,
    cssModules: false,
    postcss: [(0, _autoprefixer["default"])({
      browsers: ['> 3% in US', 'last 2 firefox versions']
    })]
  });
  var spacesEndpoint = new _awsSdk["default"].Endpoint('sfo2.digitaloceanspaces.com');
  var baseWebpackConfig = {
    node: {
      Buffer: false,
      setImmediate: false
    },
    module: {
      exprContextRegExp: /$^/,
      exprContextCritical: false,
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
          sourceType: 'unambiguous',
          plugins: ['@babel/plugin-syntax-dynamic-import', '@babel/plugin-transform-runtime', '@babel/plugin-proposal-class-properties', 'babel-plugin-transform-inline-environment-variables']
        }
      }, handleLoader.css(), handleLoader.styl()]
    },
    resolve: {
      extensions: ['.js', '.json'],
      alias: {
        react: 'preact/compat',
        'react-dom': 'preact/compat'
      }
    },
    output: {
      filename: '[name].js',
      publicPath: config.SCRIPTS_CDN_URL
    }
  };
  var isDevServer = process.env.WEBPACK_DEV_SERVER;

  if (isDevServer) {
    return _lodash["default"].defaultsDeep({
      devtool: 'inline-source-map',
      entry: ["webpack-dev-server/client?".concat(config.WEBPACK_DEV_URL), 'webpack/hot/dev-server', paths.root],
      output: {
        filename: 'bundle.js',
        path: __dirname,
        publicPath: "".concat(config.WEBPACK_DEV_URL, "/"),
        pathinfo: false
      },
      // seems to improve perf
      devServer: {
        host: config.HOST,
        port: config.WEBPACK_DEV_PORT,
        publicPath: "".concat(config.WEBPACK_DEV_URL, "/"),
        hot: true,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        disableHostCheck: true
      },
      plugins: [new _webpack["default"].HotModuleReplacementPlugin(), // new webpack.IgnorePlugin /\.json$/, /lang/
      // new HardSourceWebpackPlugin()
      new _webpack["default"].DefinePlugin({
        'process.env': _lodash["default"].mapValues(process.env, function (val) {
          return JSON.stringify(val);
        })
      })]
    }, baseWebpackConfig);
  }

  var LangPlugin =
  /*#__PURE__*/
  function () {
    function LangPlugin() {
      (0, _classCallCheck2["default"])(this, LangPlugin);
    }

    (0, _createClass2["default"])(LangPlugin, [{
      key: "apply",
      // Define `apply` as its prototype method which is supplied with compiler as its argument
      value: function apply(compiler) {
        // Specify the event hook to attach to
        compiler.hooks.afterEmit.tap('LangPlugin', function (stats) {
          _lodash["default"].forEach(config.LANGUAGES, function (language) {
            var lang = Lang.getJsonString(language);

            var bundle = _fs["default"].readFileSync("".concat(paths.dist, "/bundle.js"), 'utf-8');

            return _fs["default"].writeFileSync("".concat(paths.dist, "/bundle_").concat(stats.hash, "_").concat(language, ".js"), lang + bundle, 'utf-8');
          });
        });
      }
    }]);
    return LangPlugin;
  }();

  return _lodash["default"].defaultsDeep({
    mode: 'production',
    entry: {
      bundle: paths.root,
      service_worker: paths.sw
    },
    optimization: {
      usedExports: true,
      // tree shake lodash
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
    plugins: [new _cleanWebpackPlugin.CleanWebpackPlugin(), new _copyWebpackPlugin["default"]({
      patterns: [{
        from: paths["static"],
        to: ''
      }]
    }), // new BundleAnalyzerPlugin(),
    new _webpack["default"].IgnorePlugin({
      resourceRegExp: /\.json$/,
      contextRegExp: /lang/
    }), new _miniCssExtractPlugin["default"]({
      filename: 'bundle_[hash].css'
    }), // new CompressionPlugin({
    //   test: /\.(js|css)$/,
    //   filename: '[path][query]',
    //   algorithm: 'gzip',
    //   deleteOriginalAssets: false
    // }),,
    new _webpackStatsPlugin.StatsWriterPlugin({
      fields: ['hash']
    }), new _replaceHashInFileWebpackPlugin["default"]([{
      dir: paths.dist,
      files: ['service_worker.js'],
      rules: [{
        search: /g\|HASH\|/g,
        replace: '[hash]'
      }]
    }]), // generate bundles for each language
    new LangPlugin(), new _webpackS3Plugin["default"]({
      s3Options: {
        endpoint: spacesEndpoint,
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET
      },
      s3UploadOptions: {
        Bucket: 'tdn.one',
        // Here we set the Content-Encoding header for all the gzipped files to 'gzip'
        ContentEncoding: function ContentEncoding(fileName) {
          if (/\.gz/.test(fileName)) {
            return 'gzip';
          }
        },
        // Here we set the Content-Type header for the gzipped files to their appropriate values, so the browser can interpret them properly
        ContentType: function ContentType(fileName) {
          if (/\.css/.test(fileName)) {
            return 'text/css';
          }

          if (/\.js/.test(fileName)) {
            return 'text/javascript';
          }
        }
      },
      basePath: 'd/scripts',
      // This is the name the uploaded directory will be given
      directory: 'dist' // This is the directory you want to upload

    }), function () {
      return this.plugin('done', function (stats) {
        if (stats.compilation.errors && stats.compilation.errors.length) {
          console.log(stats.compilation.errors);
          return process.exit(1);
        }
      });
    }],
    output: {
      filename: '[name].js',
      chunkFilename: '[name]_bundle_[hash].js',
      publicPath: config.SCRIPTS_CDN_URL
    },
    stats: {
      children: false
    }
  }, baseWebpackConfig);
}
