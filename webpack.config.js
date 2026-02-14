const path = require('path');

module.exports = {
  mode: 'development',

  // ✅ mantém o modelador intacto em /index.html (bundle.js)
  // ✅ adiciona um segundo entry para o viewer + batch-sim em /viewer.html (viewer.js)
  entry: {
    bundle: './src/app.js',
    viewer: './src/viewer.js'
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },

  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      }
    ]
  },

  devServer: {
    static: [
      { directory: path.resolve(__dirname, 'src') },
      { directory: path.resolve(__dirname, 'diagrams') }
    ],
    port: 8080,
    open: true
  }
};
