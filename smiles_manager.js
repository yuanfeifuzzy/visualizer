const SmilesManager = (function() {
    /**
     * Finds all elements with data-smiles attribute and renders them
     * @param {HTMLElement} container smiles_width smiles_height - The element to search within (defaults to document)
     */
    const renderAll = (container = document) => {
        const dpr = window.devicePixelRatio || 1; // Usually 2 on Retina/High-DPI
        // const dpr = 1; // Usually 2 on Retina/High-DPI
        const elements = container.querySelectorAll('[data-smiles]');
        elements.forEach(el => {
            const smiles = el.getAttribute('data-smiles');
            if (!smiles) return;

            let height = el.parentElement.offsetHeight || 75;
            let width = el.parentElement.offsetWidth || height * 2

            let canvas = el.querySelector('canvas.smiles-canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'smiles-canvas';
                el.innerHTML = '';
                el.appendChild(canvas);
            }

            const options = {
                width: width * dpr,
                height: height * dpr,
                padding: 10 * dpr,
                bondThickness: 1,
                fontSizeLarge: 6,
                fontSizeSmall: 4,
                overlapSensitivity: 0.3,
                bondSpacing: 3.0,
                compactDrawing: true,
                themes: {
                    darkerLight: {
                        C: '#1a1a1a',
                        O: '#b91c1c', // Deep Red
                        N: '#1e40af', // Deep Blue
                        F: '#15803d', // Deep Green
                        CL: '#0f766e', // Deep Teal
                        BR: '#9a3412', // Deep Orange/Brown
                        I: '#6b21a8', // Deep Purple
                        P: '#92400e', // Deep Amber
                        S: '#a16207', // Deep Yellow/Gold
                        B: '#92400e',
                        SI: '#92400e',
                        H: '#1a1a1a',
                        BACKGROUND: 'transparent'
                    }
                }
            };
            const smidraw = new SmilesDrawer.Drawer(options);

            SmilesDrawer.parse(smiles, (tree) => {
                smidraw.draw(tree, canvas, 'darkerLight', false);
                canvas.style.width = width + 'px';
                canvas.style.height = height + 'px';
            }, (err) => {
                el.innerText = `Invalid SMILES<br>${smiles}`;
            });
        });
    };

    const showModal = (smiles) => {
        const modal = document.getElementById('smiles_modal');
        const container = document.getElementById('modal-smiles-container');

        // 1. Clear previous content
        container.innerHTML = `<div data-smiles="${smiles}" class="w-full h-full"></div>`;

        // 2. Open the modal
        modal.showModal();

        // 3. Render the large version
        // We pass the container to renderAll so it only processes the modal
        SmilesManager.renderAll(container);
    };

    /**
     * Initialize a MutationObserver to watch for new HTMX content or dynamic elements
     */
    const initObserver = () => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    renderAll();
                }
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    return {
        renderAll,
        showModal,
        init: () => {
            renderAll();
            initObserver();
        }
    };
})();

window.SmilesManager = SmilesManager;

document.addEventListener('DOMContentLoaded', () => SmilesManager.init());