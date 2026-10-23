/**
 * Runs claude.dev's own page-widget modules inside the clone.
 *
 * Two of the site's runtime features — the footer scene (starfield plus the
 * Clawd astronaut) and the "Related posts" perch robot — ship as lazy module
 * bundles. Rather than reimplement that code, both bundles are vendored verbatim
 * and this file supplies the small amount of module plumbing they expect:
 *
 *   factory(module) where
 *     module.i(id)  -> resolve a dependency
 *     module.s(list) -> publish exports as [name, type, value, name, type, ...]
 *
 * Dependencies are resolved in order: a module another bundle already published,
 * then the shim below. The shim only answers for helpers the clone intentionally
 * leaves out, and returns inert stubs so a missing helper degrades a single
 * widget instead of breaking the page.
 */
(function () {
  'use strict';

  /**
   * A bundle's module registry. Each vendored bundle gets its own: the two
   * bundles both define modules with the same ids (they share a few source
   * files), so a shared registry would let one block the other's modules.
   */
  function makeRegistry(shims) {
    var published = {};
    var running = {};

    function resolve(id) {
      if (published[id]) return published[id];
      if (running[id]) return {};           // circular import: hand back a stub
      if (shims && shims[id]) return (published[id] = shims[id]());
      return (published[id] = {});
    }

    function run(globalName, moduleIds) {
      var bundle = window[globalName];
      if (!bundle) return null;

      var pending = [];
      var previous = globalThis.TURBOPACK;
      globalThis.TURBOPACK = { push: function (entry) { pending.push(entry); return pending.length; }, A: resolve };
      try {
        bundle();
      } catch (err) {
        window.__CLONE_MODULE_ERROR__ = globalName + ': ' + String(err);
        globalThis.TURBOPACK = previous;
        return null;
      }
      globalThis.TURBOPACK = previous;

      // Instantiate the requested modules, in the order given, so that one
      // module's exports are in place before a later module asks for them.
      function instantiate(id) {
        if (running[id]) return;
        for (var i = 0; i < pending.length; i++) {
          var entry = pending[i];
          if (!Array.isArray(entry)) continue;
          for (var j = 1; j + 1 < entry.length; j += 2) {
            if (entry[j] !== id || typeof entry[j + 1] !== 'function') continue;
            running[id] = true;
            try {
              entry[j + 1]({
                i: resolve,
                s: function (list) {
                  var out = {};
                  for (var k = 0; k + 2 < list.length; k += 3) out[list[k]] = list[k + 2];
                  published[id] = out;
                },
              });
            } catch (err) {
              window.__CLONE_MODULE_ERROR__ = 'module ' + id + ': ' + String(err);
            }
          }
        }
      }

      moduleIds.forEach(instantiate);
      return published[moduleIds[moduleIds.length - 1]] || null;
    }

    return { resolve: resolve, run: run, published: published };
  }

  /** Inert stand-ins for helpers the clone does not vendor. */
  function widgetShim() {
    var noop = function () {};
    return {
      reducedMotion: typeof matchMedia === 'function'
        ? matchMedia('(prefers-reduced-motion: reduce)').matches
        : false,
      toast: noop, toastRegion: noop, copyText: function () { return Promise.resolve(false); },
      countUp: noop, arrowText: function (el, value) { return String(value); },
      applyTheme: noop, initDelights: noop, initReveals: noop, bindScrambleHovers: noop,
      go: function (href) { if (href) window.location.href = href; },
      THEMES: {}, delightKey: noop, initScrollMeter: noop, initScrollSpy: noop,
      initVeil: noop, scrambleText: noop, scrollProgressBar: noop,
      buildGazeMap: function () { return { frames: [], grid: [], cx: 0.5, feet: 1, fracW: 0.5 }; },
      clawdNavMark: noop,
    };
  }

  // The site's widget library, keyed by the id both bundles import it under.
  var SHIMS = { 37061: widgetShim };

  // Each bundle gets its own registry. The perch needs the scene module's
  // actor, so the scene's published exports are handed over as a shim.
  var sceneRegistry = makeRegistry(SHIMS);
  var scene = sceneRegistry.run('__CLONE_SCENE_CHUNK__', [97573]);
  if (scene) window.__CLONE_SCENE__ = scene;

  var perchShims = {};
  Object.keys(SHIMS).forEach(function (k) { perchShims[k] = SHIMS[k]; });
  if (scene) perchShims[97573] = function () { return scene; };

  // Modules are instantiated in import order: widgets, page helpers, then the
  // perch entry point that uses both.
  var perch = makeRegistry(perchShims).run('__CLONE_PERCH_CHUNK__', [37061, 40085, 80976]);
  if (perch) window.__CLONE_PERCH__ = perch;
})();
