const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/app.js',

  output: {
    filename: 'bundle.js',
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
      // serve o HTML e o diagram.bpmn como arquivos estáticos
      { directory: path.resolve(__dirname, 'src') },
      { directory: path.resolve(__dirname, 'diagrams') } // ✅ novo
    ],
    port: 8080,
    open: true
  }
};
