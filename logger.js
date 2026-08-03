class Logger {
  info(msg) {
    console.log(msg);
  }

  error(msg, err) {
    console.error(msg, err);
  }

  log(type, msg) {
    console.log(`[${(type || 'info').toUpperCase()}] ${msg}`);
  }
}

module.exports = Logger;
