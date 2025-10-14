/* smiles-renderer.js
 * A tiny UMD wrapper around RDKit.js to render <svg.smiles-svg data-smiles="...">
 * Exposes: SmilesRenderer.startRDKit(), SmilesRenderer.drawSMILES(el, opts), SmilesRenderer.setDefaults(opts)
 * Works without async/await at call sites by queuing jobs until RDKit is ready.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SmilesRenderer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -------- internal state --------
  let RDKIT = null;
  let READY = false;
  let LOADING = false;
  let queue = [];
  let defaults = {
    selector: 'svg.smiles-svg',
    attr: 'data-smiles',
    width: 200,
    height: 100,
    padding: 0,
    bondLineWidth: 1,
    fixedBondLength: 30,
    scaleBondWidth: false,
    kekulize: true,
    addStereoAnnotation: false,
    legend: '',
    replaceWithImg: false,
    rdkitSrc: 'https://unpkg.com/@rdkit/rdkit/dist/RDKit_minimal.js'
  };

  // -------- helpers --------
  function assign(target, src) {
    for (const k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    return target;
  }

  function ensureScript(src, onload) {
    const present = Array.prototype.some.call(document.scripts || [], function (s) {
      return (s.src || '').indexOf(src) !== -1;
    });
    if (present) { onload(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = onload;
    s.onerror = function (e) { console.error('Failed to load RDKit script:', e); };
    document.head.appendChild(s);
  }

  function initIfNeeded() {
    if (READY || LOADING) return;
    LOADING = true;

    var beginInit = function () {
      if (typeof initRDKitModule !== 'function') {
        console.error('RDKit script loaded but initRDKitModule not found.');
        LOADING = false;
        return;
      }
      initRDKitModule().then(function (m) {
        RDKIT = m;
        READY = true;
        LOADING = false;
        // flush queue
        var jobs = queue.splice(0, queue.length);
        for (var i = 0; i < jobs.length; i++) {
          try { renderNow(jobs[i].el, jobs[i].opts); } catch (e) { console.warn(e); }
        }
      }).catch(function (err) {
        LOADING = false;
        console.error('RDKit init failed:', err);
      });
    };

    if (typeof initRDKitModule === 'function') {
      beginInit();
    } else {
      ensureScript(defaults.rdkitSrc, beginInit);
    }
  }

  function serializeToImgURL(svgText) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  }

  // Core render (sync once RDKit is READY)
  function renderNow(root, opts) {
    let cfg = assign(assign({}, defaults), opts || {});
    let selector = cfg.selector + ':not([data-rendered="1"])';
    let nodes = (root.querySelectorAll ? root.querySelectorAll(selector) : []);
    if (!nodes.length) return;

    for (let i = 0; i < nodes.length; i++) {
      let holder = nodes[i];
      let raw = holder.getAttribute(cfg.attr) || '';
      let smi = raw.trim().split(' ')[0];
      holder.setAttribute('data-rendered', '1');
      if (!smi) continue;

      try {
        const mol = RDKIT.get_mol(smi);
        const details = {
          width: cfg.width,
          height: cfg.height,
          bondLineWidth: cfg.bondLineWidth,
          fixedBondLength: cfg.fixedBondLength,
          scaleBondWidth: cfg.scaleBondWidth,
          kekulize: cfg.kekulize,
          addStereoAnnotation: cfg.addStereoAnnotation,
          legend: cfg.legend
        };
        const svgText = mol.get_svg_with_highlights(JSON.stringify(details));
        mol.delete();

        if (cfg.replaceWithImg) {
          const img = document.createElement('img');
          img.width = cfg.width; img.height = cfg.height;
          img.className = holder.getAttribute('class') || '';
          img.setAttribute('data-rendered', '1');
          img.src = serializeToImgURL(svgText);
          holder.replaceWith(img);
        } else {
          const width = cfg.width || 200;
          const height = cfg.height || 100;
          holder.outerHTML = svgText.replace(
            /<svg /,
            `<svg data-rendered="1" class="smiles-svg" width="${width}" height="${height}" `
          );
        }
      } catch (e) {
        console.warn('SMILES render error:', smi, e);
      }
    }
  }

  // -------- public API --------
  function startRDKit() {
    initIfNeeded();
  }

  function drawSMILES(el, opts) {
    if (!el || !el.querySelectorAll) return;
    if (READY) {
      renderNow(el, opts);
    } else {
      queue.push({ el: el, opts: opts || null });
      initIfNeeded(); // lazy-start RDKit if not started yet
    }
  }

  function smilesSVG(smi, width=200, height=100, id='') {
    id = id || 'smiles_svg_' + Math.random().toString(36).slice(2,9);
    return `<svg id="${id}" class="smiles-svg" data-smiles="${smi || ''}"></svg>`;
  }

  function setDefaults(opts) {
    assign(defaults, opts || {});
  }

  // Auto-start on DOMContentLoaded if someone queued draws early (optional behavior)
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (queue.length && !READY && !LOADING) initIfNeeded();
    });
  }

  return {
    startRDKit : startRDKit,
    drawSMILES : drawSMILES,
    smilesSVG  : smilesSVG,
    setDefaults: setDefaults
  };
}));
