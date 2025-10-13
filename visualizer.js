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
    RDKit: null,
    RDKitPromise: null,
  };

  const q = id => R.root.getElementById(id);
  const readConfigForm = () => {
    return {
      font: q('fontFamily')?.value || "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize: Number(q('fontSize')?.value || 12),
      fontCC: q('fontFamilyCC')?.value || "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSizeCC: Number(q('fontSizeCC')?.value || 10),

      render: {
        SMILES: !!q('renderSmiles')?.checked,
        c1_smiles: !!q('renderBB1')?.checked,
        c2_smiles: !!q('renderBB2')?.checked,
        c3_smiles: !!q('renderBB3')?.checked,
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
      setChk('renderBB1',  !!cfg.render.c1_smiles);
      setChk('renderBB2',  !!cfg.render.c2_smiles);
      setChk('renderBB3',  !!cfg.render.c3_smiles);
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
    btnHitsModal : q('btnHitsModal'),
    btnEqualAxis : q('btnEqualAxis'),
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
    hitsModal    : q('hitsModal'),
    hitsTable    : q('hitsTable'),
    numHits      : q('numHits'),
    topHitsModal : q('topHitsModal'),
    topHitsTable : q('topHitsTable')
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
    };
    const getSMILES = (row) => Object.entries(R.config.render) .filter(([k, v]) => v).map(([k]) => row?.[k] ?? '');
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
    function updateConnector(card) {
      const { clientX, clientY } = dataPointToClientXY(card.getAttribute('id'));
      const rect = card.getBoundingClientRect();
      const toX = rect.left + rect.width / 2;
      const toY = rect.bottom;
      card.line.setAttribute('x1', String(clientX));
      card.line.setAttribute('y1', String(clientY));
      card.line.setAttribute('x2', String(toX));
      card.line.setAttribute('y2', String(toY));
    }
    function dataPointToClientXY(id) {
      const gd = R.els.chartPanel;
      const data = gd._fullData || gd.data || [];
      const pe = gd.querySelector('.cartesianlayer .plot');
      const rect = gd.getBoundingClientRect();
      let clientX = null;
      let clientY = null;

      for (let i = 0; i < data.length; i++) {
        const tr = data[i];
        const ids = tr?.ids;
        if (!ids) continue;

        const j = ids.indexOf(id);
        if (j >= 0) {
          const x = tr.x[j];
          const y = tr.y[j];

          const xa = gd._fullLayout[(tr.xaxis || 'x') + 'axis'];
          const ya = gd._fullLayout[(tr.yaxis || 'y') + 'axis'];

          const xPx = xa._offset + xa.l2p(xa.d2l(x));
          const yPx = ya._offset + ya.l2p(ya.d2l(y));

          clientX = rect.left + xPx;
          clientY = rect.top + yPx;
          break
        }
      }
      return {clientX: clientX, clientY: clientY};
    }
    function attachConnector(card) {
      let ov = document.getElementById('plot-overlay');
      if (!ov) {
        ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ov.id = 'plot-overlay';
        Object.assign(ov.style, {
          position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
          pointerEvents: 'none', zIndex: 1049
        });
        document.body.appendChild(ov);
      }
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', '#afafaf');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-linecap', 'round');
      ov.appendChild(line);

      const id = card.getAttribute('id')
      // const { clientX, clientY } = dataPointToClientXY(id)
      card.line = line;
      updateConnector(card);
      card.addEventListener('dragmove', () => updateConnector(card));
    }
    function removeConnector(card) {
      if (card?.line) {
        card.line.remove();
        card.line = null;
      }
    }
    function removeCards(ids=null, cards=null) {
      let cs;
      if (ids) {
        cs = ids.map(id => q(id));
      } else {
        if (cards) {
          cs = cards
        } else {
          cs = document.querySelectorAll('.card');
        }
      }
      cs.forEach(card => {
        removeConnector(card);
        card.remove();
      })

    }
    function getVisibleHits() {
      const rows = t => (Array.isArray(t?.getData?.()) ? t.getData() : []);
      return [...rows(R.hitsTable).filter(r => r.library === R.library),
              ...rows(R.topHitsTable).filter(r => (r.library === R.library) && (r.visible))];
    }
    function viewCompounds(ids=null) {
      let visibles = new Set(getVisibleHits().map(r => r.key));
      if (ids) visibles = visibles.union(new Set(ids));
      for (const row of R.uniques) {
        if (visibles.has(row.key)) {
          assembleCompoundCard(row);
          row.visible = true;
          R.topHitsTable.updateOrAddRow(row.key, row);
        }
      }
      restylePoints(null, visibles);
    }
    function hideCompounds(ids=null) {
      ids = ids || [...document.querySelectorAll('.compound-card')].map(el => el.id) || [];
      removeCards(ids);
      R.topHitsTable.deleteRow(ids);
      restylePoints(null, ids, 'remove');
    }
    function restylePoints(rows=null, ids=null, mode='add') {
      const uids = ids || rows?.map(row => row.key);
      if (uids) {
        const want = new Set(uids);
        const data = R.els.chartPanel.data;
        for (let i = 0; i < data.length; i++) {
          const tr = data[i];
          const ids = tr?.ids;
          if (!ids) continue;

          const matches = [];
          for (let j = 0; j < ids.length; j++) if (want.has(ids[j])) matches.push(j);
          let selected = Array.isArray(tr.selectedpoints) ? tr.selectedpoints.slice() : [];

          if (mode === 'add') {
            selected = Array.from(new Set(selected.concat(matches)));
          } else if (mode === 'remove') {
            const rm = new Set(matches);
            selected = selected.filter(j => !rm.has(j));
          } else { // 'replace'
            selected = matches;
          }

          const update = {
            selectedpoints: [selected],
            "selected.marker.size": 30,
            "selected.marker.line.width": 2,
            "selected.marker.line.color": '#000',
            "unselected.marker.opacity": 0.4
          };
          Plotly.restyle(R.els.chartPanel, update, [i]);
        }
      }
    }
    const assembleCompoundCard = (row) => {
      const smiles = getSMILES(row);
      console.log(smiles)
      const trs = smiles.map(s => `<tr><td colspan="2">${SmilesRenderer.smilesSVG(s, R.config.structure.width, R.config.structure.height)}</td></tr>`);

      const text = assembleHoverText(row);
      const parts = text.split('<br>');

      let title = parts[0].replace('<b>', '<span>').replace('</b>', '</span>')
      title = title.replace(' [', '<button type="button" class="btn btn-outline-success rounded-pill btn-sm py-0 copies">').replace(']', '</button>')

      for (let i=1; i < parts.length; i++) {
        let [k, v] = parts[i].split(': ');
        trs.push(`<tr><td class="text-start">${k}</td><td class="text-end">${v}</td></tr>`);
      }

      const card = document.createElement('div');
      const width = R.config.structure.width + 10;
      card.setAttribute('id', row.key)
      card.className = 'card compound-card';
      card.style.position = 'fixed';
      card.style.width = `${width}px`;
      card.style.zIndex = '1050';
      card.style.pointerEvents = 'auto';

      const header = document.createElement('div');
      header.className = 'card-header d-flex justify-content-center align-items-center fw-bold gap-2';
      header.innerHTML = title;
      card.appendChild(header);

      const body = document.createElement('div')
      body.innerHTML = `<table class="w-100">${trs.join('')}</table>`;
      body.style.padding = '5px';
      card.appendChild(body);

      const footer = document.createElement('div');
      footer.className = 'card-footer bg-white d-flex align-items-center p-1';
      footer.innerHTML = '<i class="bi bi-bag me-3" data-action="bag" role="button" tabindex="0" title="Add to' +
        ' bag"></i> ' +
        '<i class="bi bi-copy text-success me-3" data-action="copy" role="button" tabindex="0" title="Copy"></i> ' +
        '<i class="bi bi-envelope text-primary" data-action="email" role="button" tabindex="0" title="E-mail"></i> ' +
        '<i class="bi bi-x-circle ms-auto text-danger" data-action="close" role="button" tabindex="0" title="Close"></i>';
      card.appendChild(footer);

      const rect = R.els.chartPanel.getBoundingClientRect();
      const start = rect.x;
      const stop = rect.width;
      const x = dataPointToClientXY(row.key)['clientX'];
      const left = x - (width / 2) -5;
      const right = x + (width / 2) + 5;
      if (left < start) {
        card.style.left = (start + 5) + 'px';
      } else {
        if (right > stop) {
          card.style.left = (stop - 5 - width) + 'px';
        } else {
          card.style.left = left + 'px';
        }
      }

      card.style.top = (rect.y + 30) + 'px';
      card.style.display = 'block';
      card.style.fontSize = '0.8rem';

      document.body.appendChild(card);
      makeDraggable(card, header);
      attachConnector(card)

      card.addEventListener('click', (e) => {
        const btn = e.target.closest('button.copies');
        if (!btn) return;
        const key = btn.dataset.key;
        window.alert('copies clicked:', key, btn.textContent.trim());
      });

      footer.addEventListener('click', (e) => {
        const icon = e.target.closest('[data-action]');
        if (!icon) return;
        handleFooterAction(icon.dataset.action, { card, footer });
      });

      // Centralized actions
      function handleFooterAction(action, ctx) {
        switch (action) {
          case 'bag':
            break;
          case 'copy': {
            // Example: copy first SMILES in this card (adjust selector as needed)
            const smiles = ctx.card.querySelector('.smiles-svg')?.dataset.smiles || '';
            if (smiles) navigator.clipboard?.writeText(smiles).catch(console.warn);
            break;
          }
          case 'email':
            // Example: open mailto (customize subject/body)
            const subject = encodeURIComponent('Compound info');
            const body = encodeURIComponent('See attached details.');
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
            break;
          case 'close':
            // removeCards(null, [ctx.card]);
            // ctx.card.remove();
            hideCompounds([ctx.card.getAttribute('id')])
            break;
        }
      }

      SmilesRenderer.drawSMILES(card);

      return card
    };
    const assembleCompoundName = (row, addCopyNumber=false, addButton=false) => {
      let compound = row.compound ? row.compound : `VC${row.index}`;
      if (row.copies > 1 && addCopyNumber) {
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
    const assembleCountScore = (row, tabulate=false) => {
      let text = [];
      text.push(assembleKV(`<b>${R.x.replace('zscore_', '')} (x)`, `${row[R.x.replace('zscore_', 'count_')]} (${row[R.x].toFixed(2)})</b>`, tabulate));
      text.push(assembleKV(`<b>${R.y.replace('zscore_', '')} (y)`, `${row[R.y.replace('zscore_', 'count_')]} (${row[R.y].toFixed(2)})</b>`, tabulate));
      const scores = R.scoreColumns.filter(c => (c !== R.x && c !== R.y));
      for (const c of scores) text.push(assembleKV(`${c.replace('zscore_', '')}`, `${row[c.replace('zscore_', 'count_')]} (${row[c].toFixed(2)})`, tabulate));
      if (row.history_hits) text.push(assembleKV('HH', `${(row.history_hits.match(/,/g) || []).length+1}`, tabulate));
      return text
    };
    const assembleHoverText = (row) => {
      let text = [`<b>${assembleCompoundName(row)}</b>`];
      text.push(...assembleCountScore(row));
      return text.join('<br>')
    };
    const alignModebarWithLegend = () => {
      const mb  = R.els.chartPanel.querySelector('.modebar');
      const leg = R.els.chartPanel.querySelector('.legend');
      if (!mb || !leg) return;

      const gbox = R.els.chartPanel.getBoundingClientRect();
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
            const html = SmilesRender.smilesSVG(cell.getValue(), R.config.structure.width, R.config.structure.height);
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
    const tabulize = (el, data, columns, modal) => {
      el.innerHTML = '';
      const table = new Tabulator(el, {
        data: data,
        columns: columns,
        index: 'key',
        layout: 'fitDataFill',
        height: '100%',
        nestedFieldSeparator: "->",
        columnDefaults: { hozAlign: "center",  vertAlign: "middle", headerHozAlign: "center" },
      });

      return table;
    };
    const updateHitsCount = (n) => {
      if (n > 0) {
        R.els.btnHitsModal.classList.remove('disabled');
        R.els.numHits.innerText = n;
      } else {
        R.els.btnHitsModal.classList.add('disabled');
        R.els.numHits.innerText = '';
      }
    }

    return { makeDraggable, assembleCompoundCard, assembleCompoundName,
             assembleKV, assembleCountScore, assembleHoverText, alignModebarWithLegend,
             assembleColumns, keyForRow, tabulize, updateHitsCount, viewCompounds, hideCompounds, updateConnector
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
    R.els.btnEqualAxis.classList.add('disabled');
  }

  function squareChartWithDiagonal() {
    const gd = R.els.chartPanel;
    // 1) Collect x/y from current traces
    const xs = [];
    const ys = [];
    (gd.data || []).forEach((t, i) => {
      if (t.visible === 'legendonly') return;
      if (!t.x || !t.y) return;
      const xarr = (Array.isArray(t.x) ? t.x : [t.x]).map(Number).filter(Number.isFinite);
      const yarr = (Array.isArray(t.y) ? t.y : [t.y]).map(Number).filter(Number.isFinite);
      xs.push(...xarr);
      ys.push(...yarr);
    });

    if (!xs.length || !ys.length) return; // nothing to do

    // 2) Common [lo, hi] + padding
    let lo = Math.min(Math.min(...xs), Math.min(...ys));
    let hi = Math.max(Math.max(...xs), Math.max(...ys));
    const span = Math.max(hi - lo, 1);         // avoid zero span
    const pad = span * 0.01;
    lo -= pad;
    hi += pad;

    // 3) Prepare/merge shapes: keep others, replace our "diagonal" if present
    const current = (gd.layout && gd.layout.shapes) ? gd.layout.shapes.slice() : [];
    const others = current.filter(s => s._tag !== 'diag_y_eq_x'); // custom tag to find ours
    const diagonal = {type: 'line', xref: 'x', yref: 'y', x0: lo, y0: lo, x1: hi, y1: hi,
      line: { dash: 'dot', width: 1, color: '#d7d7d7' }, layer: 'above',
      _tag: 'diag_y_eq_x' // harmless custom key to identify later
    };

    // 4) Apply ranges + shapes
    Plotly.relayout(gd, {
      'xaxis.range': [lo, hi],
      'yaxis.range': [lo, hi],
      shapes: [...others, diagonal]
    });
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
      return {
        ids: name.includes('sython') ? rows.map(r => r.key) : [],
        name: name,
        type: 'scattergl',
        mode: 'markers',
        marker: { color: rows.map(r => colorForAxis(r?.axis ?? 0)), size: size},
        x: rows.map(r => r?.[x]),
        y: rows.map(r => r?.[y]),
        text: name.includes('sython') ? rows.map(r => R.utilities.assembleHoverText(r)) : '',
        hoverinfo: 'text',
        hovertemplate: `%{text}<extra></extra>`,
        showlegend: name.includes('sython')
      };
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
      const xOffset = (xMax - xMin) * 0.05
      const yMin = ysAll.length ? Math.min(0, ...ysAll) : 0;
      const yMax = ysAll.length ? Math.max(0, ...ysAll) : 1;
      const yOffset = (yMax - yMin) * 0.05

      const axisDefault = {
        mirror: true, nticks: 3, zeroline: false, showgrid: false, linecolor: '#939393',
        linewidth: 1, ticks: 'outside', ticklen: 1, tickwidth: 1, automargin: true,
      };

      config.staticPlot = true;
      layout.margin.l = 90;
      layout.grid = {rows, columns: columns, pattern: 'independent', xgap: 0.03, ygap: 0.05, roworder: 'top to bottom'};
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
          showticklabels: !!showXticks, range: [xMin - xOffset, xMax + xOffset], ...axisDefault
        });
        layout[axisKey(trace.yaxis)] = Object.assign(layout[axisKey(trace.yaxis)] || {}, {
          showticklabels: !!showYticks, range: [yMin - yOffset, yMax + yOffset], ...axisDefault
        });

        // Add in-panel title: top-left of the facet
        layout.annotations.push({
          text: String(library), xref: `${trace.xaxis} domain`, yref: `${trace.yaxis} domain`,
          x: 0.5, y: 0.9, xanchor: 'center', yanchor: 'bottom', showarrow: false, bordercolor: '#fff',
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
      const axisDefault = {zeroline: false, showgrid: false, mirror: true, linecolor: '#939393', linewidth: 1, nticks: 5}
      layout.xaxis = {title: {text: `${x.replace('zscore_', '')} (z-score)`}, ...axisDefault};
      layout.yaxis = {title: {text: `${y.replace('zscore_', '')} (z-score)`}, ...axisDefault};
    }

    const plotter = (global.Plotly && (global.Plotly.react || global.Plotly.newPlot || global.Plotly.plot));
    plotter(holder, traces.filter(r => r), layout, config)

    R.utilities.alignModebarWithLegend(holder);
  }

  function buildHitsTable() {
    const deleteCol = {
      title: "", width: 46, hozAlign: "center", headerSort: false,
      titleFormatter: () => `<i class="bi bi-trash text-danger" aria-label="Delete row"></i>`,
      formatter: () => `<button type="button" class="btn btn-sm btn-outline-danger" 
                          title="Delete row" data-action="del">
                          <i class="bi bi-trash"></i>
                        </button>`,       // or Font Awesome: <i class="fa fa-trash"></i>
      cellClick: (e, cell) => {
        const btn = e.target.closest('button[data-action="del"]');
        if (!btn) return;
        e.preventDefault(); e.stopPropagation();
        cell.getRow().delete();
        R.utilities.updateHitsCount(R.hitsTable.getData().length);
        const data = cell.getRow().getData();
        data.hits = false;
        R.topHitsTable.updateData([data]);
      },
    };
    const columns = [deleteCol, ...R.utilities.assembleColumns()]
    R.hitsTable = R.utilities.tabulize(R.els.hitsTable, R.hits, columns, R.els.hitsModal);
  }

  function buildTopHitsTable() {
    const hits = R.hitsTable?.getData?.() ?? [];
    const keys = hits.map(hit => hit.key);
    const tops = Object.values(R.tops).flat().map(top => ({...top, hits: keys.includes(top.key)}));
    const visibleColumn = {
      title: "",
      field: "visible",
      width: 44,
      headerSort: false,
      titleFormatter: () => `<i class="bi bi-eye" aria-label="Toggle all"></i>`,

      formatter: (cell) => {
        const v = cell.getValue();
        return `<input type="checkbox" aria-label="visible row"${v ? " checked" : ""}>`;
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
    const hitsColumn = { title: "Hits", field: "hits", formatter:"tickCross", editor: 'tickCross',
      accessorClipboard: v => (v ? 1 : 0), accessorDownload:  v => (v ? 1 : 0),
      cellEdited: (cell) => {
        const data = cell.getRow().getData();
        const table = R.hitsTable;
        cell.getValue() ? table.updateOrAddRow(data.key, data) : table.deleteRow(data.key);
        R.utilities.updateHitsCount(table.getData().length);
      }
    }
    const columns = [visibleColumn, hitsColumn, ...R.utilities.assembleColumns()]
    R.topHitsTable = R.utilities.tabulize(R.els.topHitsTable, tops, columns, R.els.topHitsModal);
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

    R.tops = Object.create(null);
    for (const row of R.uniques) (R.tops[row.library] ??= []).push(row);
    for (const [k, v] of Object.entries(R.tops)) {
      R.tops[k] = v.filter(a => (a.axis === 6) && (norm(a?.[R.x]) >= 0.5))
        .sort((a, b) => norm(b?.[R.x]) - norm(a?.[R.x]))
        .slice(0, R.config.nTopHits)
        .map(a => ({...a, visible: true}));
    }
  }

  function bindEvents() {
    R.els.dz = Dropzone.forElement("#dropzone");
    R.els.dz.on('addedfile', (file) => { if (file) loadFile(file).catch(R.onError || console.error); });

    const bindDropdown = (menu, btn, label) => {
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

        if (R.library === 'All') {
          R.els.btnEqualAxis.classList.add('disabled');
        } else {
          R.els.btnEqualAxis.classList.remove('disabled');
          R.utilities.hideCompounds();
          R.utilities.viewCompounds();
        }
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

    const updateConnectors = () => {
      document.querySelectorAll('.card').forEach(card => {
        if (card._connector) R.utilities.updateConnector(card);
      });
    }
    R.els.chartPanel.on('plotly_relayout', () => {
      R.utilities.alignModebarWithLegend();
      updateConnectors();
    });
    window.addEventListener('resize', () => {
      R.utilities.alignModebarWithLegend();
      updateConnectors();
    });
    if (R.els.chartPanel.removeAllListeners) R.els.chartPanel.removeAllListeners('plotly_click');
    R.els.chartPanel.on('plotly_click', (data) => {
      const id = data.points[0].id;
      q(id) ? R.utilities.hideCompounds([id]) : R.utilities.viewCompounds([id])
    });

    R.els.btnEqualAxis.addEventListener('click', () => {
      squareChartWithDiagonal();
    })
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