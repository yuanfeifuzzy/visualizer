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
    cards: {}
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
    if (!cfg) return;

    const setVal = (id, v) => { const el = q(id); if (el != null && v != null && v !== '') el.value = v; };
    const setNum = (id, v) => { const el = q(id); if (el != null && Number.isFinite(v)) el.value = String(v); };
    const setChk = (id, v) => { const el = q(id); if (el != null && typeof v === 'boolean') el.checked = v; };

    // Typography (global + card if you have both)
    setVal('fontFamily',   cfg.font);
    setNum('fontSize',     cfg.fontSize);
    setVal('fontFamilyCC', cfg.fontCC);
    setNum('fontSizeCC', cfg.fontSizeCC);

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
    btnHitsModal  : q('btnHitsModal'),
    btnEqualAxis  : q('btnEqualAxis'),
    switchers     : q('switchers'),
    selectors     : q('selectors'),
    btnX          : q('btnX'),
    xSel          : q('xSel'),
    btnLibrary    : q('btnLibrary'),
    librarySel    : q('librarySel'),
    btnY          : q('btnY'),
    ySel          : q('ySel'),
    uploadPanel   : q('uploadPanel'),
    fileInput     : q('fileInput'),
    dz            : q('dropzone'),
    chartPanel    : q('chartPanel'),
    configModal   : q('configModal'),
    btnSaveConfig : q('btnSaveConfig'),
    encodingModal : q('encodingModal'),
    encodingTable : q('encodingTable'),
    encodingSMILES: q('encodingSMILES'),
    topHitsModal  : q('topHitsModal'),
    hitsModal     : q('hitsModal'),
    hitsTable     : q('hitsTable'),
    numHits       : q('numHits'),
    topHitsTable  : q('topHitsTable')
  }

  R.io = (() => {
    const isGzip = (u8) => u8 && u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b;
    const inferDelimiter = (name = "") => {
      if (/\.tsv(\.gz)?$/i.test(name)) return "\t";
      if (/\.csv(\.gz)?$/i.test(name)) return ",";
      return undefined;
    };
    const papaParse = (input, download=false) => new Promise((resolve, reject) => {
      const delimiter = inferDelimiter(input);
      Papa.parse(input, {
        delimiter,
        download: download,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        worker: true,
        complete: ({ data }) => {
          if (data && data.length) resolve(data.map((row, i) => ({ ...row, index: i, key: R.utilities.keyForRow(row) })));
          else reject(new Error("The text/file is empty or contains no valid data."));
        },
        error: reject
      });
    });

    const load = async (input, { onComplete } = {}) => {
      try {
        let rows;
        let download = false;
        if (typeof input === "string") {
          if (/\.gz$/i.test(input)) {
            const res = await fetch(input, { mode: "cors" });
            if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

            const u8 = new Uint8Array(await res.arrayBuffer());
            if (!isGzip(u8)) throw new Error("URL ends with .gz but payload is not gzip.");
            input = window.pako.ungzip(u8, { to: "string" }); // assumes UTF-8
          } else {
            download = true;
          }
          rows = await papaParse(input, download)
        }
        // File/Blob
        else if (input instanceof Blob) {
          const u8 = new Uint8Array(await input.arrayBuffer());
          if (isGzip(u8)) {
            input = pakoRef.ungzip(u8, { to: "string" });
          }
          rows = await papaParseFile(input);
        } else {
          throw new Error("load expects a URL string or a File/Blob.");
        }
        onComplete?.(rows);
      } catch (err) {
        throw err;
      }
    };
    return { load };
  })();

  R.utilities = (() => {
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
    const keyForRow = (row) => {
      if (Object.prototype.hasOwnProperty.call(row, 'compound') && row.compound != null && row.compound !== '') {
        return String(row.compound);
      }
        return [String(row.library ?? ''), ...R.smilesColumns.map(c => String(row?.[c] ?? ''))].join('|');
    };
    const getSMILES = (row) => Object.entries(R.config.render).filter(([k, v]) => v).map(([k]) => row?.[k] ?? '');
    function ClientXY(id) {
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
      return {x1: clientX, y1: clientY};
    }
    const Draggable = (el, handle) => {
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
      let x1, y1, x2, y2, left, top;
      const rect = card.getBoundingClientRect();
      if (card?.state) {
        ({left, top} = card.state);
      } else {
        left = rect.left;
        top = rect.top;
      }
      ({ x1, y1 } = ClientXY(card.getAttribute('id')));
      x2 = rect.left + rect.width / 2;
      y2 = rect.bottom;

      card.line.setAttribute('x1', x1);
      card.line.setAttribute('y1', y1);
      card.line.setAttribute('x2', x2);
      card.line.setAttribute('y2', y2);
      card.state = {left: left, top: top, x1: x1, y1: y1, x2: x2, y2: y2}
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
      
      card.line = line;
      requestAnimationFrame(() => { updateConnector(card); });
      card.addEventListener('dragmove', () => updateConnector(card));
      return card;
    }
    function removeConnector(card) {
      if (card?.line) {
        card.line.remove();
        card.line = null;
      }
    }
    function getVisibleHits() {
      const rows = t => (Array.isArray(t?.getData?.()) ? t.getData() : []);
      return [...rows(R.hitsTable).filter(r => r.library === R.library),
              ...rows(R.topHitsTable).filter(r => (r.library === R.library) && (r.visible))];
    }
    function viewCompounds(ids = null) {
      let visibles = new Set(getVisibleHits().map(r => r.key));
      if (ids) visibles = visibles.union(new Set(ids));
      const rows = R.uniques.filter(row => visibles.has(row.key));

      for (const row of rows) {
        row.visible = true;
        R.topHitsTable.updateOrAddRow(row.key, row);
      }

      // Highlight points and wait until Plotly is actually re-drawn
      const gd = R.els.chartPanel;
      const after = new Promise(res => gd.once ? gd.once('plotly_afterplot', res) : res());
      restylePoints(null, Array.from(visibles), 'replace');

      // Build/append cards only after plot is stable
      after.then(() => {
        const cards = [];
        for (const row of rows) {
          const key = row.key;
          let card = R.cards[key];
          if (!card) {
            card = assembleCompoundCard(R.uniques.filter(r => r.key === key)[0]);
            R.cards[key] = card
          } else {
            card.classList.remove('d-none');
          }
          cards.push(card);
          R.cards[key] = card;
        }

        // Ensure connectors are correct after the DOM paints
        for (const card of cards) {
          card.line ? updateConnector(card) : attachConnector(card);
        }
      });

      ids = Object.keys(R.cards).filter(key => !visibles.has(key));
      hideCompounds(ids);
    }
    function hideCompounds(ids = null) {
      ids = ids || Object.keys(R.cards);
      for (const id of ids) {
        const card = R.cards[id];
        removeConnector(card);
        card.classList.add('d-none');
      }
      restylePoints(null, ids, 'remove');
    }
    function restylePoints(rows=null, ids=null, mode='add') {
      const uids = ids || rows?.map(row => row.key);
      if (uids) {
        const want = new Set(uids);
        const data = R.els.chartPanel.data;
        const updaters = []
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
            "unselected.marker.opacity": 0.5
          };
          updaters.push(Plotly.restyle(R.els.chartPanel, update, [i]));
        }
        return Promise.all(updaters);
      }
      return Promise.resolve();
    }
    const assembleCompoundCard = (row, visible=true) => {
      const smiles = getSMILES(row);
      const trs = smiles.map(s => `<tr><td colspan="2">${SmilesRenderer.smilesSVG(s, R.config.structure.width, R.config.structure.height)}</td></tr>`);
      const text = assembleHoverText(row);
      const parts = text.split('<br>');
      const title = assembleCompoundName(row, true, true)
      for (let i=1; i < parts.length; i++) {
        let [k, v] = parts[i].split(': ');
        trs.push(`<tr><td class="text-start">${k}</td><td class="text-end">${v}</td></tr>`);
      }

      const key = row.key;
      let card = document.createElement('div');
      const width = R.config.structure.width + 10;
      card.setAttribute('id', key)
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
      footer.innerHTML = `<i class="bi bi-bag me-3" data-action="bag" data-key=${key} role="button" tabindex="0" title="Add to candidate"></i> ` +
        `<i class="bi bi-copy text-success me-3" data-action="copy" data-key=${key} role="button" tabindex="0" title="Copy"></i> ` +
        `<i class="bi bi-envelope text-primary" data-action="email" data-key=${key} role="button" tabindex="0" title="E-mail"></i> ` +
        `<i class="bi bi-x-circle ms-auto text-danger" data-action="close" data-key=${key} role="button" tabindex="0" title="Close"></i>`;
      card.appendChild(footer);

      card.style.display = 'block';
      card.style.fontSize = '0.8rem';
      card.style.visibility = visible ? 'visible' : 'hidden';

      const panel = R.els.chartPanel.getBoundingClientRect();
      const { x1, y1 } = ClientXY(row.key);
      const start = panel.left + 5 + 60;
      const stop  = panel.right - 5 - 5;
      let left = x1 - (width / 2);
      if (left < start) {
        left = start;
      } else {
        if ((x1 + (width / 2) > stop)) left = stop - width;
      }

      card.style.left = String(Math.round(left)) + 'px';
      card.style.top  = String(Math.round(panel.top + 30)) + 'px';

      document.body.appendChild(card);
      R.cards[row.key] = card;

      SmilesRenderer.drawSMILES(card);
      card = attachConnector(card)
      updateConnector(card);
      requestAnimationFrame(function(){ updateConnector(card); });
      Draggable(card, header);

      // card.addEventListener('click', (e) => {
      //   const btn = e.target.closest('button.copies');
      //   if (!btn) return;
      //   const key = btn.dataset.key;
      //   window.alert('copies clicked:', key, btn.textContent.trim());
      // });
      //
      // footer.addEventListener('click', (e) => {
      //   const icon = e.target.closest('[data-action]');
      //   if (!icon) return;
      //   handleFooterAction(icon.dataset.action, { card, footer });
      // });
      //
      // function handleFooterAction(action, ctx) {
      //   switch (action) {
      //     case 'bag':
      //       break;
      //     case 'copy': {
      //       const smiles = ctx.card.querySelector('.smiles-svg')?.dataset.smiles || '';
      //       if (smiles) navigator.clipboard?.writeText(smiles).catch(console.warn);
      //       break;
      //     }
      //     case 'email':
      //       const subject = encodeURIComponent('Compound info');
      //       const body = encodeURIComponent('See attached details.');
      //       window.location.href = `mailto:?subject=${subject}&body=${body}`;
      //       break;
      //     case 'close':
      //       hideCompounds([ctx.card.getAttribute('id')])
      //       break;
      //   }
      // }

      return card
    };
    const assembleCompoundName = (row, addCopyNumber=false, addButton=false) => {
      let compound = row.compound ? row.compound : `VC${row.index}`;
      if (row.copies >= 1 && addCopyNumber) {
        if (addButton) {
          const button = ' <button type="button" class="btn btn-outline-success rounded-pill btn-sm py-0" ' +
                                `data-action="open-encoding" data-key="${row.key}">${row.copies}</button>`;
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
      const hh = row.history_hits ? (row.history_hits.match(/,/g) || []).length + 1 : 0
      text.push(assembleKV('HH', `${hh}`, tabulate));
      return text
    };
    const assembleHoverText = (row) => {
      let text = [`<b>${assembleCompoundName(row, true)}</b>`];
      text.push(...assembleCountScore(row));
      return text.join('<br>')
    };
    const assemblePlainText = (row) => {
      let smiles = Object.entries(R.config.render).map(([k, v]) => `${k}: ${row?.[k] ?? ''}`);
      let ss = [`Compound: ${assembleCompoundName(row)}`, ...smiles]
      const parts = assembleHoverText(row).split('<br>');
      const tags = ['<b>', '</b>', ' (x)', ' (y)'];
      for (let i=1; i < parts.length; i++) {
        let s = parts[i];
        for (const tag of tags) {
          s = s.replace(tag, '');
        }
        ss.push(s)
      }
      return ss.join('\n')
    }
    const alignModebarWithLegend = () => {
      const mb  = R.els.chartPanel.querySelector('.modebar');
      const leg = R.els.chartPanel.querySelector('.legend');
      if (!mb || !leg) return;

      const gbox = R.els.chartPanel.getBoundingClientRect();
      const lbox = leg.getBoundingClientRect();
      const top  = Math.max(0, Math.round(lbox.top - gbox.top));
      mb.style.top = top + 'px';
    };
    const buildColumns = () => {
      const smiles = {title: 'SMILES', columns: [], hozAlign: 'center'}
      for (const c of R.smilesColumns) {
        smiles.columns.push({
          title: c.includes('_') ? c.split('_')[0].replace('c', 'BB') : c,
          field: c,
          width: R.config.structure.width,
          formatter: (cell) => {
            const html = SmilesRenderer.smilesSVG(cell.getValue(), R.config.structure.width, R.config.structure.height);
            requestAnimationFrame(() => SmilesRenderer.drawSMILES(cell.getElement()));
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
    const tabulize = (el, data, columns, layout='fitDataFill') => {
      el.innerHTML = '';
      return  new Tabulator(el, {
        data: data,
        columns: columns,
        index: 'key',
        layout: layout,
        height: '100%',
        nestedFieldSeparator: "->",
        columnDefaults: { hozAlign: "center",  vertAlign: "middle", headerHozAlign: "center" },
      });
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

    return { findColumns, assembleCompoundCard, assembleCompoundName, getSMILES, assemblePlainText,
             assembleKV, assembleCountScore, assembleHoverText, alignModebarWithLegend,
             buildColumns, keyForRow, tabulize, updateHitsCount, viewCompounds, hideCompounds
           };
  })();

  function buildSelector() {
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

  function squareChart() {
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

  function handleChartEvent(gd) {
    if (R.library !== 'All') {
      R.utilities.alignModebarWithLegend();

      gd.removeAllListeners?.('plotly_click');
      gd.on('plotly_click', ev => {
        const id = ev.points[0].id;
        (id in R.cards) ? R.utilities.hideCompounds([id]) : R.utilities.viewCompounds([id]);
      });
    }
  }

  function renderChart() {
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

    Plotly.react(R.els.chartPanel, traces.filter(r => r), layout, config)
      .then(handleChartEvent)
      .catch(err => console.error('Failed to make chart: ', err));
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
        const row = cell.getRow();
        // const key = row.id;
        row.delete();
        R.utilities.updateHitsCount(R.hitsTable.getData().length);
        const data = cell.getRow().getData();
        data.hits = false;
        R.topHitsTable.updateData([data]);
        // const icons = document.querySelector(`[data-key="${key}"]`);
        // icons.forEach(icon => {
        //   icon.classList.remove('bi-bag-fill');
        //   icon.classList.remove('text-danger');
        //   icon.classList.add('bi-bag');
        // })
      },
    };
    const columns = [deleteCol, ...R.utilities.buildColumns()]
    R.hitsTable = R.utilities.tabulize(R.els.hitsTable, R.hits, columns);
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
    const columns = [visibleColumn, hitsColumn, ...R.utilities.buildColumns()]
    R.topHitsTable = R.utilities.tabulize(R.els.topHitsTable, tops, columns);
  }

  function analyzeData() {
    const groups = new Map();               // key -> indices[]
    const groupSizeByKey = new Map();       // key -> count
    const bestByKey = new Map();            // key -> { idx, score }

    const norm = v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : -Infinity; // treat missing/NaN as worst
    };

    R.rows.forEach((row) => {
      const k = String(row?.key ?? "");
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(row.index);

      groupSizeByKey.set(k, (groupSizeByKey.get(k) ?? 0) + 1);

      const s = norm(row?.[R.x]);
      const prev = bestByKey.get(k);
      if (!prev || s > prev.score /* tie: keep first seen */) {
        bestByKey.set(k, { idx: row.index, score: s });
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
      R.tops[k] = v.filter(a => (a.axis === 6) && (norm(a?.[R.x]) >= 0.3))
        .sort((a, b) => norm(b?.[R.x]) - norm(a?.[R.x]))
        .slice(0, R.config.nTopHits)
        .map(a => ({...a, visible: true}));
    }
  }

  function bindEvents() {
    R.els.dz = Dropzone.forElement("#dropzone");
    R.els.dz.on('addedfile', (file) => { if (file) R.io.load(file, { onComplete: initializePage }).catch(R.onError || console.error); });

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

        try { bootstrap.Dropdown.getOrCreateInstance(btn).hide(); } catch (_) {}

        analyzeData();
        renderChart();
        R.library === 'All' ? R.utilities.hideCompounds() : R.utilities.viewCompounds();
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

    handleChartEvent(R.els.chartPanel);

    R.els.btnEqualAxis.addEventListener('click', () => {
      squareChart();
    })

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      const key = btn.getAttribute('data-key');
      let row = R.rows.filter(r => r.key === key)[0];
      console.log(row);

      switch (action) {
        case 'open-encoding': {
          let smiles = R.utilities.getSMILES(row);
          smiles.push(smiles.shift());
          const cards = smiles.map(s => `<div class="col"><div class="card p-2">
            ${SmilesRenderer.smilesSVG(s, R.config.structure.width, R.config.structure.height)}</div></div>`);
          R.els.encodingSMILES.innerHTML = cards.join('\n');
          SmilesRenderer.drawSMILES(R.els.encodingSMILES);

          const ids = R.duplicates[key];
          const rows = R.rows.filter(r => ids.includes(r.index));
          const excludes = ['SMILES', 'Library', 'Axis', 'Encodings']
          const columns = R.utilities.buildColumns().filter(x => !excludes.includes(x.title));
          R.utilities.tabulize(R.els.encodingTable, rows, columns, 'fitDataTable');
          const modal = bootstrap.Modal.getOrCreateInstance(R.els.encodingModal, {
            backdrop: true,
            keyboard: true,
            focus: true
          });
          modal.show();
          break;
        }
        case 'bag': {
          if (btn.classList.contains('bi-bag-fill')) {
            row.visible = false;
            R.hitsTable.deleteRow(key);
            R.utilities.updateHitsCount(R.hitsTable.getData().length);
            btn.classList.remove('bi-bag-fill');
            btn.classList.remove('text-danger');
            btn.classList.add('bi-bag');
          } else {
            row.visible = true;
            R.hitsTable.updateOrAddRow(key, row);
            R.utilities.updateHitsCount(R.hitsTable.getData().length);
            btn.classList.remove('bi-bag');
            btn.classList.add('bi-bag-fill');
            btn.classList.add('text-danger');
          }
          break;
        }
        case 'copy': {
          const text = R.utilities.assemblePlainText(row);
          navigator.clipboard?.writeText(text).catch(console.warn);
          break;
        }
        case 'email':
          const text = R.utilities.assemblePlainText(row);
          const subject = encodeURIComponent('Compound info');
          const body = encodeURIComponent(text);
          window.location.href = `mailto:?subject=${subject}&body=${body}`;
          break;
        case 'close':
          R.utilities.hideCompounds([key])
          break;
      }

    });
  }

  function initializePage(rows) {
    const columns = Object.keys(rows[0]);
    R.columns = columns;
    R.countColumns = R.utilities.findColumns(columns, 'count_')
    R.scoreColumns = R.utilities.findColumns(columns, 'zscore_')
    R.smilesColumns = R.utilities.findColumns(columns, '', '_smiles')
    R.libraries = [...new Set((rows ?? []).map(r => r.library))];
    R.rows = rows.map(row => (row.key = R.utilities.keyForRow(row), row));

    buildSelector();
    analyzeData();

    buildHitsTable();
    buildTopHitsTable();

    renderChart();
    bindEvents();
  }

  global.Visualizer = {
    async init(input=null) {
      GlobalConfig();

      if (input) {
        R.io.load(input, { onComplete: initializePage }).catch(console.error);
      } else {
        R.els.uploadPanel.classList.remove('d-none')
      }
    },
  };
})(window);