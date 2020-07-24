const path = require('path');
const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals');

const entries = {};

Object.keys(slsw.lib.entries).forEach(
  key => (entries[key] = ['./source-map-install.js', slsw.lib.entries[key]])
);


const args = require('minimist')(process.argv.slice(2));
console.log(args.mode);

// var nodeModules = {};
// fs.readdirSync('node_modules')
//   .filter(function (x) {
//     return ['.bin'].indexOf(x) === -1;
//   })
//   .forEach(function (mod) {
//     nodeModules[mod] = 'commonjs ' + mod;
//   });
//console.log(slsw.lib.webpack.isLocal);

module.exports = {
  mode: args.mode,
  entry: entries,
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx'],
  },
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  target: 'node',
  plugins: [
    //new webpack.IgnorePlugin(/^pg-native$/),
    //new webpack.IgnorePlugin(/^pg.js.*/),
    //new webpack.IgnorePlugin(/^redis-parser$/)
  ],
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      { test: /\.tsx?$/, loader: 'ts-loader' },
    ]
    // loaders: [{
    //   test: /\.js$/,
    //   loaders: ['babel-loader'],
    //   include: __dirname,
    //   exclude: /node_modules/,
    // }]
  },
  externals: [nodeExternals()] // in order to ignore all modules in node_modules folde
};
