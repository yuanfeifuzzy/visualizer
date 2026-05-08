const SmilesManager = (() => {
    const DEFAULT_WIDTH = 240;
    const DEFAULT_HEIGHT = 120;

    const DRAW_OPTIONS = {
        padding: 0,
        compactDrawing: true,
        bondThickness: 1.25,
        bondLength: 12.5,
        shortBondLength: 0.85,
        bondSpacing: 2.8,
        fontSizeLarge: 6,
        fontSizeSmall: 3,
        overlapSensitivity: 0.42,
        themes: {
            darkerLight: {
                C: '#1a1a1a',
                O: '#b91c1c',
                N: '#1e40af',
                F: '#15803d',
                CL: '#0f766e',
                BR: '#9a3412',
                I: '#6b21a8',
                P: '#92400e',
                S: '#a16207',
                B: '#92400e',
                SI: '#92400e',
                H: '#1a1a1a',
                BACKGROUND: 'transparent'
            }
        }
    };

    function fitSvg(svg, width, height, fine=false) {
        requestAnimationFrame(() => {
            const bbox = fine ? (svg.querySelector('g[mask]') || svg).getBBox() : svg.getBBox();
            if (!bbox.width || !bbox.height) return;
            const pad = fine ? Math.max(bbox.width, bbox.height) * 0.05 : 15;
            svg.setAttribute('width', width);
            svg.setAttribute('height', height);
            svg.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`);
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.style.display = 'block';
        });
    }

    function renderElement(el) {
        const smiles = el.dataset.smiles?.trim();
        if (!smiles) return;

        if (el.dataset.smilesRendered === '1') return;
        el.innerHTML = '';

        const width = parseInt(el.dataset.width ?? DEFAULT_WIDTH, 10);
        const height = parseInt(el.dataset.height ?? DEFAULT_HEIGHT, 10);
        const fine = ['true', '1', 'yes'].includes(el.dataset.fine?.toLowerCase());

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', width.toString());
        svg.setAttribute('height', height.toString());
        svg.classList.add('smiles-svg');
        el.appendChild(svg);

        const drawer = new SmilesDrawer.SvgDrawer({ ...DRAW_OPTIONS, width: width, height: height});
        SmilesDrawer.parse(smiles, tree => {
                drawer.draw(tree, svg, 'darkerLight', false);
                fitSvg(svg, width, height, fine);
                el.dataset.smilesRendered = '1';
            },
            err => {
                console.error(err);
                el.innerHTML = `<div class="text-red-600 text-xs">Invalid SMILES</div>`;
            }
        );
    }

    function renderSMILES(container = document) {
        container.querySelectorAll('[data-smiles]').forEach(renderElement);
    }

    function showModal(smiles) {
        const modal = document.getElementById('smiles_modal');
        const container = document.getElementById('modal-smiles-container');

        container.innerHTML = `<div data-smiles="${smiles}" data-width="500" data-height="500" class="flex items-center justify-center"></div>`;
        modal.showModal();
        renderSMILES(container);
    }

    function initObserver() {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;

                    if (node.matches?.('[data-smiles]')) {
                        renderElement(node);
                    }

                    node.querySelectorAll?.('[data-smiles]').forEach(renderElement);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    return {
        renderSMILES,
        showModal,

        init() {
            renderSMILES();
            initObserver();
        }
    };
})();

window.SmilesManager = SmilesManager;

document.addEventListener('DOMContentLoaded', () => {
    SmilesManager.init();
});