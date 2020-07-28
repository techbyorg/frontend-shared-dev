// use babel until https://github.com/webpack/webpack-cli/issues/282 is resolved
// source ../kube/secrets/production.env.sh && ./node_modules/webpack/bin/webpack.js --config-register ~/dev/impact/babel.register.config.js
// ./node_modules/webpack/bin/webpack.js --config-register ~/dev/impact/babel.register.config.js
import fs from 'fs'
import webpack from 'webpack'
import AWS from 'aws-sdk'
// import webpackStream from 'webpack-stream'
// import WebpackDevServer from 'webpack-dev-server'
import HandleCSSLoader from 'webpack-handle-css-loader'
import TerserPlugin from 'terser-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import autoprefixer from 'autoprefixer'
// import CompressionPlugin from 'compression-webpack-plugin'
import S3Plugin from 'webpack-s3-plugin'
import { CleanWebpackPlugin } from 'clean-webpack-plugin'
import { StatsWriterPlugin } from 'webpack-stats-plugin'
import ReplaceHashInFileWebpackPlugin from 'replace-hash-in-file-webpack-plugin'
import CopyPlugin from 'copy-webpack-plugin'
import _ from 'lodash'

export default function ({ Lang, paths, config }) {
  // This is the main configuration object.
  // Here you write different options and tell Webpack what to do
  const handleLoader = new HandleCSSLoader({
    minimize: config.ENV === config.ENVS.PROD,
    extract: !process.env.WEBPACK_DEV_SERVER,
    sourceMap: false,
    cssModules: false,
    postcss: [
      autoprefixer({
        browsers: ['> 3% in US', 'last 2 firefox versions']
      })
    ]
  })

  const spacesEndpoint = new AWS.Endpoint('sfo2.digitaloceanspaces.com')

  const baseWebpackConfig = {
    node: {
      Buffer: false,
      setImmediate: false
    },
    module: {
      exprContextRegExp: /$^/,
      exprContextCritical: false,
      rules: [
        {
          test: /\.js$/,
          loader: 'babel-loader',
          options: {
            configFile: false, // don't use local ssr settings
            presets: [['@babel/preset-env', { modules: false, targets: '> 0.25%, not dead' }]],
            sourceType: 'unambiguous',
            plugins: [
              '@babel/plugin-syntax-dynamic-import',
              '@babel/plugin-transform-runtime',
              '@babel/plugin-proposal-class-properties',
              'babel-plugin-transform-inline-environment-variables'
            ]
          }
        },
        handleLoader.css(),
        handleLoader.styl()
      ]
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
      publicPath: `${config.SCRIPTS_CDN_URL}/`
    }
  }

  const isDevServer = process.env.WEBPACK_DEV_SERVER
  if (isDevServer) {
    return _.defaultsDeep({
      devtool: 'inline-source-map',
      entry: [
        `webpack-dev-server/client?${config.WEBPACK_DEV_URL}`,
        'webpack/hot/dev-server',
        paths.root
      ],
      output: {
        filename: 'bundle.js',
        path: __dirname,
        publicPath: `${config.WEBPACK_DEV_URL}/`,
        pathinfo: false
      }, // seems to improve perf
      devServer: {
        host: config.HOST,
        port: config.WEBPACK_DEV_PORT,
        publicPath: `${config.WEBPACK_DEV_URL}/`,
        hot: true,
        headers: { 'Access-Control-Allow-Origin': '*' },
        disableHostCheck: true
      },
      plugins: [
        new webpack.HotModuleReplacementPlugin(),
        // new webpack.IgnorePlugin /\.json$/, /lang/
        // new HardSourceWebpackPlugin()
        new webpack.DefinePlugin({ 'process.env': _.mapValues(process.env, val => JSON.stringify(val)) })
      ]
    }, baseWebpackConfig)
  }

  class LangPlugin {
    // Define `apply` as its prototype method which is supplied with compiler as its argument
    apply (compiler) {
      // Specify the event hook to attach to
      compiler.hooks.afterEmit.tap(
        'LangPlugin',
        (stats) => {
          _.forEach(config.LANGUAGES, function (language) {
            const lang = Lang.getJsonString(language)
            const bundle = fs.readFileSync(`${paths.dist}/bundle.js`, 'utf-8')
            return fs.writeFileSync(
              `${paths.dist}/bundle_${stats.hash}_${language}.js`,
              lang + bundle
              , 'utf-8')
          })
        }
      )
    }
  }

  return _.defaultsDeep({
    mode: 'production',
    entry: {
      bundle: paths.root,
      service_worker: paths.sw
    },
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
      new CleanWebpackPlugin(),
      new CopyPlugin({
        patterns: [
          { from: paths.static, to: '' }
        ]
      }),
      // new BundleAnalyzerPlugin(),
      new webpack.IgnorePlugin({
        resourceRegExp: /\.json$/,
        contextRegExp: /lang/
      }),
      new MiniCssExtractPlugin({
        filename: 'bundle_[hash].css'
      }),
      // new CompressionPlugin({
      //   test: /\.(js|css)$/,
      //   filename: '[path][query]',
      //   algorithm: 'gzip',
      //   deleteOriginalAssets: false
      // }),,
      new StatsWriterPlugin({ fields: ['hash'] }),
      new ReplaceHashInFileWebpackPlugin([{
        dir: paths.dist,
        files: ['service_worker.js'],
        rules: [{
          search: /\|HASH\|/g,
          replace: '[hash]'
        }]
      }]),
      // generate bundles for each language
      new LangPlugin(),
      new S3Plugin({
        s3Options: {
          endpoint: spacesEndpoint,
          accessKeyId: process.env.DO_SPACES_KEY,
          secretAccessKey: process.env.DO_SPACES_SECRET
        },
        s3UploadOptions: {
          Bucket: 'tdn.one',
          // Here we set the Content-Encoding header for all the gzipped files to 'gzip'
          ContentEncoding: (fileName) => {
            if (/\.gz/.test(fileName)) {
              return 'gzip'
            }
          },
          // Here we set the Content-Type header for the gzipped files to their appropriate values, so the browser can interpret them properly
          ContentType: (fileName) => {
            if (/\.css/.test(fileName)) {
              return 'text/css'
            }
            if (/\.js/.test(fileName)) {
              return 'text/javascript'
            }
          }
        },
        basePath: 'd/scripts', // This is the name the uploaded directory will be given
        directory: 'dist' // This is the directory you want to upload
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
    output: {
      filename: '[name].js',
      chunkFilename: '[name]_bundle_[hash].js',
      publicPath: `${config.SCRIPTS_CDN_URL}/`
    },
    stats: { children: false }
  }, baseWebpackConfig)
}
