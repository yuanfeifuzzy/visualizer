(function (global) {
  'use strict';

  /*!
   * Project: Enrichment Profile Visualizer
   * Author: FEI YUAN <fei.yuan@bcm.edu>
   * License: MIT
   * (c) 2025 FEI YUAN
   */

  let R = {
    root: document,
    els: null,
    io: null,
    config: null,
    rows: [],
    columns: [],
    libraries: [],
    countColumns: [],
    scoreColumns: [],
    smilesColumns: [],
    hits: [],
    tops: [],
    uniques: [],
    duplicates: {},
    x: null,
    y: null,
    library: null,
    hitsTable: null,
    topHitsTable: null,
  };

  const q = id => R.root.getElementById(id);
  const readConfigForm = () => {
    return {
      font: q('fontFamily')?.value || "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize: Number(q('fontSize')?.value || 12),
      fontCC: q('fontFamilyCC')?.value || "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSizeCC: Number(q('fontSizeCC')?.value || 10),

      render: {
        c1_smiles: !!q('renderBB1')?.checked,
        c2_smiles: !!q('renderBB2')?.checked,
        c3_smiles: !!q('renderBB3')?.checked,
        SMILES: !!q('renderSmiles')?.checked,
      },

      structure: {
        width:  Number(q('structWidth')?.value || 240),
        height: Number(q('structHeight')?.value || 100),
      },

      nTopHits: Number(q('nTopHits')?.value || 5),

      colors: {
        mono: q('colorMono')?.value || '#0d6efd',
        di:   q('colorDi')?.value   || '#6f42c1',
        tri:  q('colorTri')?.value  || '#d63384',
      },
    };
  }
  const populateConfigForm = (cfg) => {
    if (!cfg) return; // nothing to populate

    const setVal = (id, v) => { const el = q(id); if (el != null && v != null) el.value = v; };
    const setNum = (id, v) => { const el = q(id); if (el != null && Number.isFinite(v)) el.value = String(v); };
    const setChk = (id, v) => { const el = q(id); if (el != null && typeof v === 'boolean') el.checked = v; };

    // Typography (global + card if you have both)
    setVal('fontFamily',   cfg.font);
    setNum('fontSize',     cfg.fontSize);
    if (cfg.fontCC !== undefined)  setVal('fontFamilyCC', cfg.fontCC);
    if (cfg.fontSizeCC !== undefined) setNum('fontSizeCC', cfg.fontSizeCC);

    // Rendering toggles
    if (cfg.render) {
      setChk('renderBB1',  !!cfg.render.BB1);
      setChk('renderBB2',  !!cfg.render.BB2);
      setChk('renderBB3',  !!cfg.render.BB3);
      setChk('renderSmiles', !!cfg.render.SMILES);
    }

    // Structure size
    if (cfg.structure) {
      setNum('structWidth',  cfg.structure.width);
      setNum('structHeight', cfg.structure.height);
    }

    if (cfg.nTopHits) {
      setNum('nTopHits', cfg.nTopHits);
    }

    // Colors
    if (cfg.colors) {
      setVal('colorMono', cfg.colors.mono);
      setVal('colorDi',   cfg.colors.di);
      setVal('colorTri',  cfg.colors.tri);
    }
  }
  const GlobalConfig = () => {
    const cfg = readConfigForm();
    R.config = cfg;

    document.body.style.fontFamily = cfg.font;
    document.body.style.fontSize   = `${cfg.fontSize}px`;
  }

  R.els = {
    switchers    : q('switchers'),
    selectors    : q('selectors'),
    xSel         : q('xSel'),
    btnX         : q('btnX'),
    ySel         : q('ySel'),
    btnY         : q('btnY'),
    librarySel   : q('librarySel'),
    btnLibrary   : q('btnLibrary'),
    chartPanel   : q('chartPanel'),
    uploadPanel  : q('uploadPanel'),
    fileInput    : q('fileInput'),
    dz           : q('dropzone'),
    btnSaveConfig: q('btnSaveConfig'),
    configModal  : q('configModal'),
    encodingModal: q('encodingModal'),
    hitsModal : q('hitsModal'),
    hitsTable : q('hitsTable'),
    topHitsModal : q('topHitsModal'),
    topHitsTable : q('topHitsTable'),
  }

  R.io = (() => {
    /** @param {Uint8Array} u8 */
    const isGzip = (u8) => u8 && u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;

    /** @param {string} [name] */
    const inferDelimiter = (name = "") => {
      if (/\.tsv(\.gz)?$/i.test(name)) return "\t";
      if (/\.csv(\.gz)?$/i.test(name)) return ",";
      return undefined; // let Papa auto-detect
    };

    const papaParseText = (text, delimiter, PapaRef = window.Papa) =>
      new Promise((resolve, reject) => {
        PapaRef.parse(text, {
          delimiter,
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          worker: true,
          complete: ({ data }) => {
            if (data && data.length) resolve(data.map((row, i) => ({ ...row, index: i })));
            else reject(new Error("The file is empty or contains no valid data."));
          },
          error: reject
        });
      });

    const papaParseFile = (file, delimiter, PapaRef = window.Papa) =>
      new Promise((resolve, reject) => {
        PapaRef.parse(file, {
          delimiter,
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          worker: true,
          complete: ({ data }) => {
            if (data && data.length) resolve(data.map((row, i) => ({ ...row, index: i })));
            else reject(new Error("The file is empty or contains no valid data."));
          },
          error: reject
        });
      });

    /** Public: load a URL or File/Blob and parse (handles .gz via pako) */
    const loadFile = async (fileOrUrl, { onComplete } = {}) => {
      try {
        let parsedData;

        // URL string
        if (typeof fileOrUrl === "string") {
          const url = fileOrUrl;
          const delim = inferDelimiter(url);
          if (/\.gz$/i.test(url)) {
            const res = await fetch(url, { mode: "cors" });
            if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
            const u8 = new Uint8Array(await res.arrayBuffer());
            if (!isGzip(u8)) throw new Error("URL ends with .gz but payload is not gzip.");
            const text = window.pako.ungzip(u8, { to: "string" }); // assumes UTF-8
            parsedData = await papaParseText(text, delim, window.Papa);
          } else {
            parsedData = await new Promise((resolve, reject) => {
              window.Papa.parse(url, {
                download: true,
                delimiter: delim,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                worker: true,
                complete: ({ data }) => {
                  if (data && data.length) resolve(data.map((row, i) => ({ ...row, index: i })));
                  else reject(new Error("The file is empty or contains no valid data."));
                },
                error: reject
              });
            });
          }
        }
        // File/Blob
        else if (fileOrUrl instanceof Blob) {
          const file = fileOrUrl;
          const delim = inferDelimiter(file.name);
          const u8 = new Uint8Array(await file.arrayBuffer());
          if (isGzip(u8)) {
            const text = pakoRef.ungzip(u8, { to: "string" });
            parsedData = await papaParseText(text, delim, PapaRef);
          } else {
            parsedData = await papaParseFile(file, delim, PapaRef);
          }
        } else {
          throw new Error("load expects a URL string or a File/Blob.");
        }
        onComplete?.(parsedData);
      } catch (err) {
        console.error(err);
        throw err;
      }
    };

    /** Public: accept already-materialized rows */
    const loadData = (rows) => {
      if (!Array.isArray(rows)) throw new Error("data must be an array of objects");
      typeof window.afterDataLoaded === 'function' && window.afterDataLoaded(rows);
      return rows;
    };

    // public API
    return { loadFile, loadData };
  })();
  R.utilities = (() => {
    const keyForRow = (row) => {
      if (Object.prototype.hasOwnProperty.call(row, 'compound') && row.compound != null && row.compound !== '') {
        return String(row.compound);
      }
        return [String(row.library ?? ''), ...R.smilesColumns.map(c => String(row?.[c] ?? ''))].join('|');
    }
    const smilesSVG = (smi, width, height) => {
      const id = 'svg_'+Math.random().toString(36).slice(2,9);
      return `<svg id="${id}" class="smiles-svg" viewBox="0 0 ${width} ${height}" data-smiles="${smi || ''}"></svg>`;
    };
    const drawSMILES = (el) => {
      initRDKitModule().then((RDKit) => {
        el.querySelectorAll('.smiles-svg').forEach((holder) => {
          const smiles = holder.dataset.smiles.split(' ')[0];
          if (!smiles) return
          const vw = R.config.structure.width || 240;
          const vh = R.config.structure.width || 100;

          const mol = RDKit.get_mol(smiles);

          const details = {
            // thickness and size controls:
            bondLineWidth: 1.25,      // stroke thickness (user units)
            fixedBondLength: 30,     // base bond length; larger -> bigger drawing
            scaleBondWidth: false,   // keep line thickness constant when scaling

            // optional niceties:
            padding: 0.0,           // extra whitespace around the drawing
            kekulize: true,
            addStereoAnnotation: false,
            legend: ""
          };

          const svgStr = mol.get_svg_with_highlights(JSON.stringify(details));
          mol.delete();

          // Replace placeholder with RDKit’s SVG and enforce desired display size
          const svg = new DOMParser().parseFromString(svgStr, 'image/svg+xml').documentElement;
          if (holder.id) svg.id = holder.id;
          svg.setAttribute('class', (holder.getAttribute('class') || '') + ' rdkit-svg');
          svg.setAttribute('width', vw);
          svg.setAttribute('height', vh);
          holder.replaceWith(svg);
        });
      });
      };
    const makeDraggable = (el, handle) => {
      let startX, startY, startLeft, startTop;

      const onDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        handle.setPointerCapture?.(e.pointerId);
        const r = el.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startLeft = r.left;  startTop  = r.top;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
        e.preventDefault();
      };

      const onMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let left = startLeft + dx, top = startTop + dy;
        el.style.left = left + 'px';
        el.style.top  = top  + 'px';
        // notify listeners
        el.dispatchEvent(new CustomEvent('dragmove', { detail: { left, top } }));
      };

      const onUp = (e) => {
        handle.releasePointerCapture?.(e.pointerId);
        window.removeEventListener('pointermove', onMove);
      };

      handle.addEventListener('pointerdown', onDown);
      handle.style.cursor = 'grab';
      el.style.touchAction = 'none';
    };
    const assembleCompoundCard = (text, smiles) => {
      let smilesWidth = R.config.structure.width;
      let smilesHeight = R.config.structure.height;
      let cardWidth = smilesWidth + 10;

      const parts = text.split('<br>');
      const trs = [];

      let title = parts[0].replace('<b>', '<span>').replace('</b>', '</span>')
      title = title.replace(' [', '<button type="button" class="btn btn-outline-success rounded-pill btn-sm py-0 copies">').replace(']', '</button>')

      Object.values(smiles).forEach(value => {
        trs.push(`<tr><td colspan="2">${smilesSVG(value, smilesWidth, smilesHeight)}</td></tr>`);
      })
      for (let i=1; i < parts.length; i++) {
        let [k, v] = parts[i].split(': ');
        trs.push(`<tr><td class="text-start">${k}</td><td class="text-end">${v}</td></tr>`);
      }

      const card = document.createElement('div');
      card.className = 'card';
      card.style.position = 'fixed';
      card.style.width = `${cardWidth}px`;
      card.style.zIndex = '1050';
      card.style.pointerEvents = 'auto';

      const cardHead = document.createElement('div');
      cardHead.className = 'card-header d-flex justify-content-center align-items-center fw-bold gap-2';
      cardHead.innerHTML = title;
      card.appendChild(cardHead);

      const cardBody = document.createElement('div')
      cardBody.innerHTML = `<table class="w-100">${trs.join('')}</table>`;
      cardBody.style.padding = '5px';
      card.appendChild(cardBody);

      const cardFooter = document.createElement('div');
      cardFooter.className = 'card-footer bg-white d-flex align-items-center p-1';
      cardFooter.innerHTML = '<i class="bi bi-bag me-3" data-action="bag" role="button" tabindex="0" title="Add to bag"></i> ' +
        '<i class="bi bi-copy text-success me-3" data-action="copy" role="button" tabindex="0" title="Copy"></i> ' +
        '<i class="bi bi-envelope text-primary" data-action="email" role="button" tabindex="0" title="E-mail"></i> ' +
        '<i class="bi bi-x-circle ms-auto text-danger" data-action="close" role="button" tabindex="0" title="Close"></i>';
      card.appendChild(cardFooter);

      const rect = R.els.chartPanel.getBoundingClientRect();
      card.style.left = (rect.x + rect.width / 2 - cardWidth / 2) + 'px';
      card.style.top = (rect.y + 50) + 'px';
      card.style.display = 'block';

      document.body.appendChild(card);
      R.utilities.makeDraggable(card, cardHead);

      card.addEventListener('click', (e) => {
        const btn = e.target.closest('button.copies');
        if (!btn) return;
        const key = btn.dataset.key;
        window.alert('copies clicked:', key, btn.textContent.trim());
      });

      // Single handler for clicks & keyboard
      cardFooter.addEventListener('click', (e) => {
        const icon = e.target.closest('[data-action]');
        if (!icon) return;
        handleFooterAction(icon.dataset.action, { card, cardFooter });
      });

      cardFooter.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const icon = e.target.closest('[data-action]');
        if (!icon) return;
        e.preventDefault(); // prevent page scroll on Space
        handleFooterAction(icon.dataset.action, { card, cardFooter });
      });

      // Centralized actions
      function handleFooterAction(action, ctx) {
        switch (action) {
          case 'bag':
            console.log('bag clicked');
            break;
          case 'copy': {
            // Example: copy first SMILES in this card (adjust selector as needed)
            const smiles = ctx.card.querySelector('.smiles-svg')?.dataset.smiles || '';
            if (smiles) navigator.clipboard?.writeText(smiles).catch(console.warn);
            console.log('copied', smiles);
            break;
          }
          case 'email':
            // Example: open mailto (customize subject/body)
            const subject = encodeURIComponent('Compound info');
            const body = encodeURIComponent('See attached details.');
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
            break;
          case 'close':
            // removeConnector(card)
            ctx.card.remove();
            break;
        }
      }

      return card
    };
    const assembleCompoundName = (row, addCopyNumber=false, addButton=false) => {
      let compound = row.compound ? row.compound : `VC${row.index}`;
      if ('copies' in row && row.copies > 1 && addCopyNumber) {
        if (addButton) {
          const key = `${row.library}|` + R.smilesColumns.map(s => row[s]).join('|')
          const button = ' <button type="button" class="btn btn-outline-success rounded-pill btn-sm py-0" ' +
                                'data-action="open-encoding" data-encoding-key="${key}">${row.copies}</button>';
          compound += button
        } else {
          compound += ` [${row.copies}]`
        }
      }
      return compound
    };
    const assembleKV = (k, v, tabulate=false) => { return tabulate ? `<tr><td>${k}</td><td>${v}</td></tr>` : `${k}: ${v}`};
    const assembleCountScore = (row, x, y, tabulate=false) => {
      let text = [];
      text.push(assembleKV(`<b>${x.replace('zscore_', '')} (x)`, `${row[x.replace('zscore_', 'count_')]} (${row[x].toFixed(2)})</b>`, tabulate));
      text.push(assembleKV(`<b>${y.replace('zscore_', '')} (y)`, `${row[y.replace('zscore_', 'count_')]} (${row[y].toFixed(2)})</b>`, tabulate));
      const scores = R.scoreColumns.filter(c => (c !== x && c !== y));
      for (const c of scores) text.push(assembleKV(`${c.replace('zscore_', '')}`, `${row[c.replace('zscore_', 'count_')]} (${row[c].toFixed(2)})`, tabulate));
      if (row.history_hits) text.push(assembleKV('HH', `${(row.history_hits.match(/,/g) || []).length}`, tabulate));
      return text
    };
    const assembleHoverText = (row, x, y) => {
      let text = [`<b>${assembleCompoundName(row)}</b>`];
      text.push(...assembleCountScore(row, x, y));
      return text.join('<br>')
    };
    const alignModebarWithLegend = (gd) => {
      const mb  = gd.querySelector('.modebar');
      const leg = gd.querySelector('.legend');
      if (!mb || !leg) return;

      const gbox = gd.getBoundingClientRect();
      const lbox = leg.getBoundingClientRect();
      const top  = Math.max(0, Math.round(lbox.top - gbox.top));
      mb.style.top = top + 'px';
    };
    const assembleColumns = () => {
      const smiles = {title: 'SMILES', columns: [], hozAlign: 'center'}
      for (const c of R.smilesColumns) {
        smiles.columns.push({
          title: c.includes('_') ? c.split('_')[0].replace('c', 'BB') : c,
          field: c,
          width: R.config.structure.width,
          formatter: (cell) => {
            const html = R.utilities.smilesSVG(cell.getValue(), R.config.structure.width, R.config.structure.height);
            requestAnimationFrame(() => R.utilities.drawSMILES(cell.getElement()));
            return html
          }
        });
      }
      const counts = {title: 'Count', columns: []};
      for (const c of R.countColumns) {counts.columns.push({title: c.replace('count_', ''), field: c})}
      const scores = {title: 'z-score', columns: []};
      for (const c of R.scoreColumns) {scores.columns.push({title: c.replace('zscore_', ''), field: c})}
      const columns = [
        {title: 'Library', field: 'library', frozen: true},
        {title: 'Axis', field: 'axis', frozen: true},
        smiles,
        {title: 'Encodings', field: 'copies'},
        counts, scores
      ]

      if (R.columns.includes('history_hits')) {
        columns.push({title: 'HH', field: 'history_hits', sorter: 'number', formatter: (cell) => cell.getValue() ? cell.getValue().split(',').length : 0})
      }
      return columns
    };
    const stableRedraw = (table) => {
      if (!table) return;
      table.redraw(true);                                // now
      requestAnimationFrame(() => table.redraw(true));   // next frame
      setTimeout(() => table.redraw(true), 350);         // after fade transition (~300ms)
    };
    const tabulize = (el, data, columns, modal) => {
      el.innerHTML = '';
      const table = new Tabulator(el, {
        data: data,
        columns: columns,
        layout: 'fitDataFill',
        height: '100%',
        nestedFieldSeparator: "->",
        columnDefaults: { hozAlign: "center",  vertAlign: "middle", headerHozAlign: "center" },
      });

      return table;
    }

    return { smilesSVG, drawSMILES, makeDraggable, assembleCompoundCard, assembleCompoundName,
             assembleKV, assembleCountScore, assembleHoverText, alignModebarWithLegend,
             assembleColumns, stableRedraw, keyForRow, tabulize
           };
  })();

  function populateSelector() {
    const buildOptions = (selector, options, tag, selected, btn) => {
      if (!selector) return;
      selector.innerHTML = '';
      options.forEach(option => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = `${tag}: ${option}`;
        link.setAttribute('data-value', option);
        link.setAttribute('class', option === selected ? 'dropdown-item active' : 'dropdown-item');
        li.appendChild(link);
        selector.appendChild(li);
      })
      btn.textContent = `${tag}: ${selected}`;
      R[tag.toLowerCase()] = selected;
    };

    let x;
    let y;
    const scoreColumns = R.scoreColumns;

    if (scoreColumns.includes('zscore_NTC')) {
      x = scoreColumns.find(element => element !== 'zscore_NTC');
      y = 'zscore_NTC';
    } else {
      x = scoreColumns[0];
      y = scoreColumns[1];
    }

    buildOptions(R.els.xSel, scoreColumns, 'X', x, R.els.btnX);
    buildOptions(R.els.ySel, scoreColumns, 'Y', y, R.els.btnY)
    buildOptions(R.els.librarySel, ['All', ...R.libraries], 'Library', 'All', R.els.btnLibrary)
    R.els.selectors.classList.remove('d-none')
  }

  function renderChart() {
    const holder = R.els.chartPanel;

    const x = R.x || R.els.btnX?.textContent.split(': ')[1];
    const y = R.y || R.els.btnY?.textContent.split(': ')[1];
    const library = R.library || R.els.btnLibrary?.textContent.split(': ')[1];
    const cfg = R.config;

    const colorForAxis = (ax) => {
      if ([0, 1, 2].includes(ax)) return cfg.colors.mono;
      if ([3, 4, 5].includes(ax)) return cfg.colors.di;
      return cfg.colors.tri;
    };
    const makeTrace = (name, rows, size=20) => {
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const data = {
        name,
        type: 'scattergl',
        mode: 'markers',
        marker: { color: rows.map(r => colorForAxis(r?.axis ?? 0)), size: size},
        x: rows.map(r => r?.[x]),
        y: rows.map(r => r?.[y]),
        customdata: rows.map(r => {
          return {SMILES: r.SMILES ?? '', c1_smiles: r.c1_smiles ?? '', c2_smiles: r.c2_smiles ?? '',
                  c3_smiles: r.c3_smiles ?? '', key: r.key};
        }),
        text: name.includes('sython') ? rows.map(r => R.utilities.assembleHoverText(r, x, y)) : '',
        hoverinfo: 'text',
        hovertemplate: `%{text}<extra></extra>`,
        showlegend: name.includes('sython')
      };
      return data
    };

    let layout = {
      margin: {l: 60, r: 5, t: 5, b: 70},
      hovermode: 'closest',
      legend: {orientation: 'h', x: 0, xanchor: 'left', y: 1, yanchor: 'top'},
      font: { family: cfg.font, size: cfg.fontSize }
    };
    let config = {responsive: true, displayModeBar: true, displaylogo: false}
    let traces = [];

    if (library === 'All') {
      const libraries = R.libraries.filter(v => v && v !== 'All');
      const n = libraries.length;
      const columns = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / columns);
      const lastRowCount = n - (rows - 1) * columns;

      const xsAll = R.uniques.map(r => r[x]);
      const ysAll = R.uniques.map(r => r[y]);

      const xMin = xsAll.length ? Math.min(0, ...xsAll) : 0;
      const xMax = xsAll.length ? Math.max(0, ...xsAll) : 1;
      const yMin = ysAll.length ? Math.min(0, ...ysAll) : 0;
      const yMax = ysAll.length ? Math.max(0, ...ysAll) : 1;

      const axisDefault = {
        // mirror: true,
        nticks: 3,
        zeroline: false,
        showgrid: false,
        linecolor: '#939393',
        linewidth: 1,
        ticks: 'outside',
        ticklen: 1,
        tickwidth: 1,
        automargin: true,
      };

      config.staticPlot = true;
      layout.margin.l = 90;
      layout.margin.t = 20;
      layout.grid = {rows, columns: columns, pattern: 'independent', xgap: 0.1, ygap: 0.2, roworder: 'top to bottom'};
      layout.annotations = [];

      for (let i = 0; i < n; i++) {
        const library = libraries[i];
        const subset = R.uniques.filter(r => r.library === library);
        const maximum = Math.max(...subset.map(r => Number(r[x])));
        const axisKey = k => k.replace(/^([xy])(.*)$/, '$1axis$2');
        const trace = makeTrace(library, subset, 10);

        // Map to subplot axis pair: 1st subplot uses 'x','y'; others use 'x2','y2',...
        const ax = i + 1;
        trace.xaxis = (ax === 1) ? 'x' : `x${ax}`;
        trace.yaxis = (ax === 1) ? 'y' : `y${ax}`;
        traces.push(trace);

        // facet coordinates
        const rIdx = Math.floor(i / columns);   // 0..rows-1
        const cIdx = i % columns;               // 0..cols-1

        // Tick label visibility rules
        const isLastRow = (rIdx === rows - 1);
        const isSecondLastRow = (rIdx === rows - 2);
        const lastRowIncomplete = (lastRowCount > 0 && lastRowCount < columns);
        const showXticks = isLastRow || (lastRowIncomplete && isSecondLastRow && (cIdx >= lastRowCount));
        const showYticks = (cIdx === 0);

        layout[axisKey(trace.xaxis)] = Object.assign(layout[axisKey(trace.xaxis)] || {}, {
          showticklabels: !!showXticks, range: [xMin * 0.9, xMax * 1.1], ...axisDefault
        });
        layout[axisKey(trace.yaxis)] = Object.assign(layout[axisKey(trace.yaxis)] || {}, {
          showticklabels: !!showYticks, range: [yMin * 0.9, yMax * 1.1], ...axisDefault
        });

        // Add in-panel title: top-left of the facet
        layout.annotations.push({
          text: String(library), xref: `${trace.xaxis} domain`, yref: `${trace.yaxis} domain`,
          x: 0.5, y: 1.0, xanchor: 'center', yanchor: 'bottom', showarrow: false, bordercolor: '#fff',
          font: {size: R.config.fontSize, family: R.config.fontFamily, color: maximum >= 1 ? '#ff0000' : '#000000'}
        });
      }

      // Single global axis labels (centered), per your face-grid preference
      layout.annotations.push(
        {
          text: `${x.replace('zscore_', '')} (z-score)`,
          xref: 'paper', yref: 'paper',
          x: 0.5, y: -0.08, showarrow: false, font: {size: R.config.fontSize}
        },
        {
          text: `${y.replace('zscore_', '')} (z-score)`,
          xref: 'paper', yref: 'paper',
          x: -0.05, y: 0.5, textangle: -90, showarrow: false, font: {size: R.config.fontSize}
        }
      );
    } else {
      const rows = R.uniques.filter(r => (r.library ?? 'Unknown') === library);
      traces.push(makeTrace('Mono-sython', rows.filter(r => ([0, 1, 2].includes(r.axis)))))
      traces.push(makeTrace('Di-sython', rows.filter(r => ([3, 4, 5].includes(r.axis)))))
      traces.push(makeTrace('Tri-sython', rows.filter(r => (r.axis === 6))))
      layout.xaxis = {title: {text: `${x.replace('zscore_', '')} (z-score)`}, zeroline: true, showgrid: false};
      layout.yaxis = {title: {text: `${y.replace('zscore_', '')} (z-score)`}, zeroline: true, showgrid: false};
    }

    const plotter = (global.Plotly && (global.Plotly.react || global.Plotly.newPlot || global.Plotly.plot));
    plotter(holder, traces.filter(r => r), layout, config)

    R.utilities.alignModebarWithLegend(holder);
  }

  function buildHitsTable() {
    R.hitsTable = R.utilities.tabulize(R.els.hitsTable, R.hits, R.utilities.assembleColumns(), R.els.hitsModal);
  }

  function buildTopHitsTable() {
    const hits = R.hitsTable.getData();
    let tops = []
    if (hits.length > 0) {
      const keys = hits.map(h => h.key);
      tops = R.tops.map(t => (t.hits = keys.includes(t.key), t))
    } else {
      tops = R.tops.map(t => (t.hits = false, t))
    }

    const visibleCheck = {
      title: "",
      field: "selected",
      width: 44,
      headerSort: false,
      titleFormatter: () => `<i class="bi bi-eye" aria-label="Toggle all"></i>`,

      // Render a real checkbox in each cell
      formatter: (cell) => {
        const v = cell.getValue();
        return `<input type="checkbox" aria-label="select row"${v ? " checked" : ""}>`;
      },

      // Toggle the underlying data when the cell is clicked
      cellClick: (e, cell) => {
        // Only toggle when clicking the checkbox (not column resize area etc.)
        if ((e.target instanceof HTMLElement) && e.target.tagName === "INPUT") {
          cell.setValue(e.target.checked, true);   // true = mutate data
        } else {
          // click anywhere in the cell toggles the checkbox
          cell.setValue(!toBool(cell.getValue()), true);
          const input = cell.getElement().querySelector('input[type="checkbox"]');
          if (input) input.checked = toBool(cell.getValue());
        }
      },

      // Header click: toggle all on/off
      headerClick: (e, column) => {
        const table = column.getTable();
        const def = column.getDefinition();
        const turnOn = !def._allChecked;           // simple flip-flop flag
        def._allChecked = turnOn;

        // Efficient bulk update
        table.getRows().forEach(row => row.update({ selected: turnOn }));
      },
  };
    const hitsYesNo = { title: "Hits", field: "hits",
      formatter:"tickCross", formatterParams:{ allowEmpty:true, allowTruthy:true,
        tickElement:"<i class='fa fa-check'></i>", crossElement:"<i class='fa fa-times'></i>",}};
    const columns = [visibleCheck, hitsYesNo, ...R.utilities.assembleColumns()]
    R.topHitsTable = R.utilities.tabulize(R.els.topHitsTable, tops, columns, R.els.topHitsModal);
    return R.topHitsTable
  }

  function processData() {
    const groups = new Map();               // key -> indices[]
    const groupSizeByKey = new Map();       // key -> count
    const bestByKey = new Map();            // key -> { idx, score }

    const norm = v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : -Infinity; // treat missing/NaN as worst
    };

    R.rows.forEach((row, i) => {
      const k = String(row?.key ?? "");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);

      groupSizeByKey.set(k, (groupSizeByKey.get(k) ?? 0) + 1);

      const s = norm(row?.[R.x]);
      const prev = bestByKey.get(k);
      if (!prev || s > prev.score /* tie: keep first seen */) {
        bestByKey.set(k, { idx: i, score: s });
      }
    });

    R.uniques = [];
    for (const [k, info] of bestByKey.entries()) {
      const copies = groupSizeByKey.get(k) ?? 0;
      R.uniques.push({ ...R.rows[info.idx], copies });
    }

    R.duplicates = Object.fromEntries(
      [...groups.entries()]
        .filter(([, idxs]) => idxs.length >= 2)
        .map(([k, idxs]) => [k, idxs.slice()])
    );

    const libraries = new Map();
    for (const obj of R.uniques) {
      const lib = String(obj?.library ?? "");
      if (!libraries.has(lib)) libraries.set(lib, []);
      libraries.get(lib).push(obj);
    }

    R.tops = [...libraries.values()].flatMap(arr => arr.slice().sort((a, b) => norm(b?.[R.x]) - norm(a?.[R.x])).slice(0, R.config.nTopHits));
  }

  function bindEvents() {
    if (R.bound) return;
    R.els.dz = Dropzone.forElement("#dropzone");
    R.els.dz.on('addedfile', (file) => { if (file) loadFile(file).catch(R.onError || console.error); });

    const bindDropdown = (menu, btn, label) => {
      // Event delegation so it works even if items are added later
      menu.addEventListener('click', (e) => {
        const link = e.target.closest('a.dropdown-item');
        if (!link) return;
        e.preventDefault();

        const value = link.dataset.value || link.textContent.trim().split(': ')[1];
        btn.textContent = `${label}: ${value}`;
        btn.dataset.value = value;

        menu.querySelectorAll('.dropdown-item.active').forEach(a => a.classList.remove('active'));
        link.classList.add('active');

        R[label.toLowerCase()] = value;

        try {
          const dd = bootstrap.Dropdown.getOrCreateInstance(btn);
          dd.hide();
        } catch (_) { /* safe no-op if bootstrap not present */ }

        processData();
        renderChart();
        // const gd = R.els.chartPanel;
        //
        // const selections = R.topHitsTable.getData().filter(d => d.library === R.library);
        // const keys = selections.map(d => d.key)
        // gd.data.forEach((trace, traceID) => {
        //   let indices = [];
        //   for (let i=0; i < trace.customdata.length; i++) {
        //     const key = trace.customdata[i]['key'];
        //     if (keys.includes(key)) indices.push(i)
        //   }
        //   Plotly.restyle(gd,
        //     { selectedpoints: [indices],
        //       "selected.marker.size": 30,
        //       "selected.marker.line.width": 2,
        //       "selected.marker.line.color": '#000',
        //       "unselected.marker.opacity": 0.4,
        //     },
        //     [traceID]);
        // })
      });
    }
    bindDropdown(R.els.xSel, R.els.btnX, 'X')
    bindDropdown(R.els.librarySel, R.els.btnLibrary, 'Library')
    bindDropdown(R.els.ySel, R.els.btnY, 'Y')

    R.els.btnSaveConfig?.addEventListener('click', () => {
      const cfg = readConfigForm();
      bootstrap.Modal.getInstance(R.els.configModal)?.hide();
      GlobalConfig(cfg);
      renderChart();
    });

    R.els.configModal.addEventListener('show.bs.modal', () => {
      if (R.config) populateConfigForm(R.config);
      bootstrap.Modal.getInstance(R.els.configModal)?.show();
    });

    const plotlyBind = () => {
      const holder = R.els.chartPanel;
      holder.on('plotly_relayout', () => R.utilities.alignModebarWithLegend(holder));
      window.addEventListener('resize', () => R.utilities.alignModebarWithLegend(holder));

      if (holder.removeAllListeners) holder.removeAllListeners('plotly_click');

      holder.on('plotly_click', function (data) {
        const pt = data.points && data.points[0];
        const text = pt.text ?? '';
        if (!pt) return;

        const smiles = pt.data.customdata[pt.pointNumber];
        const card = R.utilities.assembleCompoundCard(text, smiles);

        R.utilities.drawSMILES(card);
        // attachConnector(card, data.event.clientX, data.event.clientY);
        // selectPoint(holder, pt.curveNumber, pt.pointNumber, {base: 15, big: 30, multi: true});
      })
    }
    plotlyBind();
  }

  function preparePage(rows) {
    const findColumns = (columns, prefix = '', suffix = '', case_sensitive = false) => {
      const normPrefix = case_sensitive ? prefix : prefix.toLowerCase();
      const normSuffix = case_sensitive ? suffix : suffix.toLowerCase();

      const cs = [];
      for (const column of columns) {
        const normColumn = case_sensitive ? column : column.toLowerCase();

        const okPrefix = prefix ? normColumn.startsWith(normPrefix) : true;
        const okSuffix = suffix ? normColumn.endsWith(normSuffix) : true;

        if (okPrefix && okSuffix) {
          cs.push(column);
        }
      }

      if (cs.length === 0) {
        throw Error(`No column was found with prefix "${prefix}" and suffix "${suffix}"`);
      }
      return cs;
    }
    const columns = Object.keys(rows[0]);

    R.columns = columns;
    R.countColumns = findColumns(columns, 'count_')
    R.scoreColumns = findColumns(columns, 'zscore_')
    R.smilesColumns = findColumns(columns, '', '_smiles')
    R.libraries = [...new Set((rows ?? []).map(r => r.library))];
    R.rows = rows.map(row => (row.key = R.utilities.keyForRow(row), row));

    populateSelector();
    processData();

    buildHitsTable();
    buildTopHitsTable();
    renderChart();
    bindEvents();
  }

  // ---------- Public API ----------
  global.Visualizer = {
    async init(opts = {}) {
      R.root = opts.root || document;
      GlobalConfig();

      if (opts.data) {
        R.io.loadData(opts.data, { onComplete: preparePage }).catch(console.error);
      } else if (opts.url) {
        await R.io.loadFile(opts.url, { onComplete: preparePage }).catch(console.error);
      } else {
        R.els.uploadPanel.classList.remove('d-none')
      }
    },
  };
})(window);