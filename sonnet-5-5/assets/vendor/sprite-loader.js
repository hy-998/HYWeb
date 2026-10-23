/**
 * Supplies the Clawd sprite set the page widgets play, without a server.
 *
 * The widgets ask lottie for each movement by URL. Fetching those URLs needs a
 * server, and the sprite they expect is lottie's own object — bound to the
 * container it was created for — so the faithful approach is to let lottie build
 * each sprite, but from embedded data instead of a network request.
 *
 * lottie.loadAnimation is therefore replaced with a lookup that swaps the URL
 * for the matching embedded animation. Everything else about the call, including
 * the container and the returned object, is unchanged; an unknown URL still
 * falls through to the real player.
 *
 * The movement-to-file mapping is read from the data the original page loads.
 */
(function () {
  'use strict';

  var SRC = window.__CLONE_SPRITES__ || { files: {}, paths: {} };

  function waitForLottie() {
    return new Promise(function (resolve, reject) {
      if (window.lottie && window.lottie.loadAnimation) return resolve(window.lottie);
      var tries = 0;
      var timer = setInterval(function () {
        if (window.lottie && window.lottie.loadAnimation) { clearInterval(timer); resolve(window.lottie); }
        else if (++tries > 600) { clearInterval(timer); reject(new Error('lottie player unavailable')); }
      }, 25);
    });
  }

  /** The embedded animation for a requested URL, matched by full path or file name. */
  function dataFor(path) {
    if (!path) return null;
    var name = SRC.paths[path];
    if (!name) {
      var file = String(path).split('/').pop();
      var keys = Object.keys(SRC.paths);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].split('/').pop() === file) { name = SRC.paths[keys[i]]; break; }
      }
    }
    return name ? SRC.files[name] : null;
  }

  var installed = null;

  function install() {
    if (installed) return installed;
    installed = waitForLottie().then(function (lottie) {
      var real = lottie.loadAnimation.bind(lottie);
      var built = {};

      lottie.loadAnimation = function (opts) {
        if (!opts) return real(opts);
        var data = dataFor(opts.path);
        if (!data) return real(opts);       // unknown movement: behave as before
        var call = {};
        for (var k in opts) call[k] = opts[k];
        call.animationData = data;
        call.path = undefined;
        var anim = real(call);
        built[opts.path] = anim;
        return anim;
      };

      window.__CLONE_SPRITES_READY__ = built;
      return built;
    });
    return installed;
  }

  window.__CLONE_SPRITES_LOAD__ = install;
})();
