/* main.js - start the game once the page has loaded. */
(function (M) {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    try {
      M.ui.init(document.getElementById('app'));
    } catch (err) {
      document.getElementById('app').innerHTML = '<section class="card"><h2>Something went wrong</h2><pre>' +
        String(err && err.stack || err).replace(/</g, '&lt;') + '</pre></section>';
      throw err;
    }
  });
})(globalThis.Mayor = globalThis.Mayor || {});
