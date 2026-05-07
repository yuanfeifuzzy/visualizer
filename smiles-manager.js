const SmilesManager = (() => {
    const DEFAULT_WIDTH = 200;
    const DEFAULT_HEIGHT = 125;

    const DRAW_OPTIONS = {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        padding: 0,
        compactDrawing: true,
        bondThickness: 1.25,
        bondLength: 12.5,
        shortBondLength: 0.85,
        bondSpacing: 2.8,
        fontSizeLarge: 6,
        fontSizeSmall: 3.8,
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

    function trimSvg(svg, width, height) {
        const bbox = svg.getBBox();

        svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);

        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.style.display = 'block';
    }

    function fitSvg(svg, width, height) {
        const bbox = svg.getBBox();

        // add a small margin
        const pad = 15;

        const vbX = bbox.x - pad;
        const vbY = bbox.y - pad;
        const vbW = bbox.width + pad * 2;
        const vbH = bbox.height + pad * 2;

        // DO NOT resize svg dimensions
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);

        // use natural molecule bounds only
        svg.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);

        // center without aggressive scaling
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

        svg.style.display = "block";
    }

    function createSvg(width, height) {
        const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg'
        );

        svg.setAttribute('width', width);
        svg.setAttribute('height', height);

        svg.classList.add('smiles-svg');

        return svg;
    }

    function renderElement(el) {
        const smiles = el.dataset.smiles;
        if (!smiles) return;

        if (el.dataset.smilesRendered === '1') return;

        el.innerHTML = '';

        const svg = createSvg(DEFAULT_WIDTH, DEFAULT_HEIGHT);
        el.appendChild(svg);

        const drawer = new SmilesDrawer.SvgDrawer(DRAW_OPTIONS);

        SmilesDrawer.parse(
            smiles,
            tree => {
                drawer.draw(tree, svg, 'darkerLight', false);

                requestAnimationFrame(() => {
                    fitSvg(svg, DEFAULT_WIDTH, DEFAULT_HEIGHT);
                });

                el.dataset.smilesRendered = '1';
            },
            err => {
                console.error(err);
                el.innerHTML = `<div class="text-red-600 text-xs">Invalid SMILES</div>`;
            }
        );
    }

    function renderAll(container = document) {
        container
            .querySelectorAll('[data-smiles]')
            .forEach(renderElement);
    }

    function showModal(smiles) {
        const modal = document.getElementById('smiles_modal');
        const container = document.getElementById('modal-smiles-container');

        container.innerHTML = `<div data-smiles="${smiles}" data-width="500" data-height="500" class="flex items-center justify-center"></div>`;
        modal.showModal();
        renderAll(container);
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
        renderAll,
        showModal,

        init() {
            renderAll();
            initObserver();
        }
    };
})();

window.SmilesManager = SmilesManager;

document.addEventListener('DOMContentLoaded', () => {
    SmilesManager.init();
});