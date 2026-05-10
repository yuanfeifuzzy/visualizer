/**
 * A unified SmilesRender combines RDKit and SmilesDrawer capabilities, inject CSS,
 * Droid Sans fonts, JavaScripts, auto discovery, and handles responsive SMILES rendering.
 */

const Render = (() => {
    let RDKIT = null;
    let IS_RDKIT_READY = false;
    let IS_RDKIT_LOADING = false;
    let rdkitQueue = [];
    let observer = null;

    const CONFIG = {
        width: 200,
        height: 200,
        engine: 'rdkit',
        rdkitSrc: 'https://unpkg.com/@rdkit/rdkit/dist/RDKit_minimal.js',
        drawerSrc: 'https://unpkg.com/smiles-drawer@2.3.0/dist/smiles-drawer.min.js',
        fontSrc: 'https://fonts.googleapis.com/css?family=Droid+Sans:400,700',
        drawingDetails: {
            bondLineWidth: 1.5,
            fixedBondLength: 15,
            fixedFontSize: 10,
            padding: 0,
        }
    };

    /**
     * Injects the necessary CSS and Google Fonts
     */
    function injectStyles(includeFonts = false) {
        // Inject Base CSS
        if (!document.getElementById('smiles-manager-styles')) {
            const style = document.createElement('style');
            style.id = 'smiles-manager-styles';
            style.textContent = `
                .smiles-container { 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    overflow: hidden;
                    max-width: 100%;
                }
                .smiles-svg { 
                    max-width: 100%; 
                    height: auto; 
                    display: block; 
                }
                [data-smiles]:not([data-smiles-rendered="1"]) {
                    min-height: 100px;
                    background: rgba(0,0,0,0.02);
                    border-radius: 8px;
                }
            `;
            document.head.appendChild(style);
        }

        // Inject Droid Sans for SmilesDrawer
        if (includeFonts && !document.getElementById('smiles-font-link')) {
            const link = document.createElement('link');
            link.id = 'smiles-font-link';
            link.href = CONFIG.fontSrc;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
    }

    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            if (document.getElementById(id)) return resolve();
            const script = document.createElement('script');
            script.src = src; script.id = id; script.async = true;
            script.onload = resolve; script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function initRDKit(callback) {
        if (IS_RDKIT_READY) return callback();
        rdkitQueue.push(callback);
        if (IS_RDKIT_LOADING) return;
        IS_RDKIT_LOADING = true;
        loadScript(CONFIG.rdkitSrc, 'rdkit-script').then(() => {
            if (typeof initRDKitModule !== 'function') return;
            initRDKitModule().then(m => {
                RDKIT = m; IS_RDKIT_READY = true; IS_RDKIT_LOADING = false;
                while (rdkitQueue.length) rdkitQueue.shift()();
            });
        });
    }

    function renderElement(el) {
        if (!el.dataset.smiles || el.dataset.smilesRendered === '1') return;

        const engine = el.dataset.engine || CONFIG.engine;
        const parent = el.parentElement;
        const parentRect = parent.getBoundingClientRect();

        if (parentRect.width === 0) {
            const resizeObserver = new ResizeObserver(() => {
                if (parent.getBoundingClientRect().width > 0) {
                    renderElement(el); // Try again now that we have width
                    resizeObserver.disconnect();
                }
            });
            resizeObserver.observe(parent);
            return;
        }
        console.log(`parent width: ${parentRect.width}`);

        let width = parseInt(el.dataset.width || (parentRect.width > 0 ? parentRect.width : CONFIG.width));
        let height = parseInt(el.dataset.height || CONFIG.height);

        el.classList.add('smiles-container');

        if (engine === 'rdkit') {
            initRDKit(() => {
                try {
                    const mol = RDKIT.get_mol(el.dataset.smiles.trim());
                    const renderOpts = { width, height, ...CONFIG.drawingDetails };
                    const svgText = mol.get_svg_with_highlights(JSON.stringify(renderOpts));
                    console.log(width, height)
                    el.innerHTML = svgText.replace('<svg', '<svg class="smiles-svg"');
                    mol.delete();
                    el.dataset.smilesRendered = '1';
                } catch (e) {
                    console.log(`RDKit Render Error: ${e}`)
                    el.innerHTML = `<small style="color:red">RDKit Render Error</small>`;
                }
            });
        } else {
            // Ensure font is injected when using smiles-drawer
            injectStyles(true);
            loadScript(CONFIG.drawerSrc, 'smiles-drawer-script').then(() => {
                el.innerHTML = `<svg width="${width}" height="${height}" class="smiles-svg"></svg>`;
                const svg = el.querySelector('svg');
                const drawer = new SmilesDrawer.SvgDrawer({ ...CONFIG.drawingDetails, width, height });
                SmilesDrawer.parse(el.dataset.smiles.trim(), tree => {
                    drawer.draw(tree, svg, 'light', false);
                    el.dataset.smilesRendered = '1';
                });
            });
        }
    }

    return {
        initSmilesRender(width = 200, height = 200, engine = 'rdkit', options = {}) {
            CONFIG.width = width;
            CONFIG.height = height;
            CONFIG.engine = engine;
            Object.assign(CONFIG.drawingDetails, options);

            // Always inject base CSS; font is injected lazily if engine is smiles-drawer
            injectStyles(engine === 'smiles-drawer');

            document.querySelectorAll('[data-smiles-rendered="1"]').forEach(el => {
                el.removeAttribute('data-smiles-rendered');
                el.innerHTML = '';
            });

            document.querySelectorAll('[data-smiles]').forEach(renderElement);

            if (!observer) {
                observer = new MutationObserver(mutations => {
                    mutations.forEach(m => m.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        if (node.hasAttribute('data-smiles')) renderElement(node);
                        node.querySelectorAll('[data-smiles]').forEach(renderElement);
                    }));
                });
                observer.observe(document.body, { childList: true, subtree: true });
            }
        }
    };
})();

window.SmilesRender = Render;

document.addEventListener('DOMContentLoaded', () => {
    Render.initSmilesRender();
});