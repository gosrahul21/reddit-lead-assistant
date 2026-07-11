const {join} = require('path');

module.exports = {
  // Changes the cache location for Puppeteer so the browser is downloaded 
  // into the project directory and deployed correctly on Render.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
