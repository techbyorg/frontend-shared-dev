const presets = [
  ['@babel/preset-env', {
    useBuiltIns: false
  }]
]

const plugins = [
  '@babel/plugin-transform-runtime',
  '@babel/plugin-proposal-optional-chaining',
  '@babel/plugin-proposal-class-properties'
]

module.exports = { presets, plugins }
