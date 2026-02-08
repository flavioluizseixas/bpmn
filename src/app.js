import Modeler from 'bpmn-js/lib/Modeler';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

import './themes/bizagi-theme.css';

import TokenSimulationModule from 'bpmn-js-token-simulation';
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css';

const DEFAULT_DIAGRAM_URL = '/pizza-collaboration.bpmn';
const LOCAL_STORAGE_KEY = 'bpmn.autosave.xml';

/* =====================================================
   Helpers
   ===================================================== */

async function fetchDiagram(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar diagrama: ${res.status} (${url})`);
  return res.text();
}

function downloadText(filename, text, mime = 'application/xml') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isLabel(el) {
  return Boolean(el && el.labelTarget);
}

function isConnection(el) {
  return Array.isArray(el && el.waypoints);
}

function hasEventDefinition(el, typeName) {
  const bo = el && el.businessObject;
  const defs = bo && bo.eventDefinitions;
  return Array.isArray(defs) && defs.some((d) => d && d.$type === typeName);
}

/* =====================================================
   Marker mapping (Bizagi-like)
   ===================================================== */

function markerFor(el) {
  const t = el.type;

  if (t === 'bpmn:StartEvent') return 'bizagi-start-event';
  if (t === 'bpmn:EndEvent') return 'bizagi-end-event';

  if (t === 'bpmn:BoundaryEvent') {
    if (hasEventDefinition(el, 'bpmn:MessageEventDefinition')) return 'bizagi-message-catch';
    return 'bizagi-intermediate-catch';
  }

  if (t === 'bpmn:IntermediateCatchEvent') {
    if (hasEventDefinition(el, 'bpmn:MessageEventDefinition')) return 'bizagi-message-catch';
    return 'bizagi-intermediate-catch';
  }

  if (t === 'bpmn:IntermediateThrowEvent') {
    if (hasEventDefinition(el, 'bpmn:MessageEventDefinition')) return 'bizagi-message-throw';
    return 'bizagi-intermediate-throw';
  }

  if (
    t === 'bpmn:ExclusiveGateway' ||
    t === 'bpmn:ParallelGateway' ||
    t === 'bpmn:InclusiveGateway' ||
    t === 'bpmn:EventBasedGateway' ||
    t === 'bpmn:ComplexGateway'
  ) return 'bizagi-gateway';

  if (t === 'bpmn:SubProcess' || t === 'bpmn:Transaction' || t === 'bpmn:AdHocSubProcess') {
    return 'bizagi-subprocess';
  }

  if (t && t.startsWith('bpmn:') && t.endsWith('Task')) return 'bizagi-task';

  if (t === 'bpmn:Participant' || t === 'bpmn:Lane') return 'bizagi-participant';

  return null;
}

const KNOWN_MARKERS = [
  'bizagi-task',
  'bizagi-subprocess',
  'bizagi-gateway',
  'bizagi-start-event',
  'bizagi-end-event',
  'bizagi-intermediate-catch',
  'bizagi-intermediate-throw',
  'bizagi-message-catch',
  'bizagi-message-throw',
  'bizagi-participant'
];

/**
 * Apply marker with retry (avoids losing markers on replace)
 */
function setBizagiMarker(modeler, el, attempt = 0) {
  if (!el || isLabel(el) || isConnection(el)) return;

  const canvas = modeler.get('canvas');
  const gfx = canvas.getGraphics(el.id);

  // retry if gfx not yet created (replace/change element)
  if (!gfx) {
    if (attempt < 2) setTimeout(() => setBizagiMarker(modeler, el, attempt + 1), 0);
    return;
  }

  for (const m of KNOWN_MARKERS) canvas.removeMarker(el.id, m);

  const m = markerFor(el);
  if (m) canvas.addMarker(el.id, m);
}

function applyBizagiMarkersToAll(modeler) {
  const elementRegistry = modeler.get('elementRegistry');
  elementRegistry.forEach((el) => setBizagiMarker(modeler, el));
}

function enableAutoMarkers(modeler) {
  const eventBus = modeler.get('eventBus');

  eventBus.on('shape.added', (e) => setBizagiMarker(modeler, e.element));
  eventBus.on('shape.replaced', (e) => setBizagiMarker(modeler, e.newShape || e.element));
  eventBus.on('elements.changed', (e) => (e.elements || []).forEach((el) => setBizagiMarker(modeler, el)));

  eventBus.on('import.done', () => applyBizagiMarkersToAll(modeler));
}

/* =====================================================
   Toolbar CSS injected via JS (guarantees styling)
   ===================================================== */

function injectToolbarCssOnce() {
  if (document.getElementById('bz-toolbar-style')) return;

  const style = document.createElement('style');
  style.id = 'bz-toolbar-style';
  style.textContent = `
    .bz-toolbar {
      position: fixed !important;
      left: 14px !important;
      bottom: 14px !important;
      z-index: 99999 !important;

      width: 330px !important;
      max-width: calc(100vw - 28px) !important;

      border: 1px solid rgba(15, 23, 42, 0.16) !important;
      border-radius: 14px !important;
      background: rgba(255,255,255,0.92) !important;
      backdrop-filter: blur(8px) !important;
      box-shadow: 0 18px 46px rgba(0,0,0,0.20) !important;
      overflow: hidden !important;

      font-family: Arial, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
      color: #0f172a !important;
    }

    .bz-toolbar__header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 10px 10px 8px 12px !important;
      border-bottom: 1px solid rgba(15, 23, 42, 0.10) !important;
    }

    .bz-toolbar__title {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      letter-spacing: 0.2px !important;
    }

    .bz-pill {
      font-size: 10px !important;
      font-weight: 900 !important;
      padding: 3px 7px !important;
      border-radius: 999px !important;
      background: rgba(11,102,195,0.14) !important;
      border: 1px solid rgba(11,102,195,0.22) !important;
      color: #0b3b72 !important;
    }

    .bz-iconbtn {
      width: 30px !important;
      height: 30px !important;
      border-radius: 10px !important;
      border: 1px solid rgba(15, 23, 42, 0.14) !important;
      background: rgba(255,255,255,0.9) !important;
      cursor: pointer !important;
    }
    .bz-iconbtn:hover { background: rgba(2,6,23,0.06) !important; }

    .bz-toolbar__body { padding: 10px 12px 12px 12px !important; }

    .bz-grid {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    }

    .bz-row {
      display: flex !important;
      gap: 8px !important;
      margin-top: 10px !important;
    }

    .bz-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;

      border: 1px solid rgba(15, 23, 42, 0.14) !important;
      background: rgba(255,255,255,0.92) !important;
      padding: 9px 10px !important;
      border-radius: 12px !important;

      cursor: pointer !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      color: #0f172a !important;

      transition: transform 0.06s ease, background 0.12s ease !important;
    }

    .bz-btn:hover { background: rgba(2,6,23,0.06) !important; }
    .bz-btn:active { transform: translateY(1px) !important; }

    .bz-btn--primary { border-color: rgba(11,102,195,0.25) !important; }
    .bz-btn--danger  { border-color: rgba(198,40,40,0.25) !important; }

    .bz-btn--wide { width: 100% !important; }

    .bz-hint {
      margin-top: 10px !important;
      font-size: 12px !important;
      color: #64748b !important;
      line-height: 1.35 !important;
    }

    .bz-kbd {
      display: inline-block !important;
      font-size: 10px !important;
      font-weight: 900 !important;
      padding: 2px 6px !important;
      border-radius: 7px !important;
      background: rgba(148,163,184,0.18) !important;
      border: 1px solid rgba(148,163,184,0.35) !important;
      color: #334155 !important;
    }

    .bz-toolbar.is-collapsed .bz-toolbar__body { display: none !important; }
  `;
  document.head.appendChild(style);
}

/* =====================================================
   Floating toolbar (HTML + binding)
   ===================================================== */

function createFloatingToolbar() {
  injectToolbarCssOnce();

  const root = document.createElement('div');
  // ✅ start collapsed by default
  root.className = 'bz-toolbar is-collapsed';

  root.innerHTML = `
    <div class="bz-toolbar__header">
      <div class="bz-toolbar__title">
        <span>⚙️ BPMN</span>
        <span class="bz-pill">Bizagi-like</span>
      </div>
      <!-- ✅ start in collapsed icon -->
      <button id="bz-collapse" class="bz-iconbtn" title="Minimizar / expandir">▸</button>
    </div>

    <div class="bz-toolbar__body">
      <div class="bz-grid">
        <label class="bz-btn bz-btn--primary bz-btn--wide" style="justify-content:center;">
          📂 Abrir
          <input id="bz-file-input" type="file" accept=".bpmn,.xml" style="display:none;" />
        </label>

        <button id="bz-save-bpmn" class="bz-btn bz-btn--primary bz-btn--wide" title="Salvar BPMN (Ctrl/Cmd+S)">
          💾 Salvar BPMN
        </button>

        <button id="bz-save-svg" class="bz-btn bz-btn--wide" title="Exportar SVG">
          🖼️ Exportar SVG
        </button>

        <button id="bz-save-local" class="bz-btn bz-btn--wide" title="Salvar no navegador">
          ☁️ Salvar Local
        </button>
      </div>

      <div class="bz-row">
        <button id="bz-restore-local" class="bz-btn bz-btn--wide" title="Restaurar do navegador">
          ↩️ Restaurar
        </button>
        <button id="bz-clear-local" class="bz-btn bz-btn--danger bz-btn--wide" title="Remover backup local">
          🧹 Limpar
        </button>
        <button id="bz-reset-default" class="bz-btn bz-btn--wide" title="Voltar ao diagrama inicial">
          ♻️ Novo
        </button>
      </div>

      <div class="bz-hint">
        Atalhos:
        <span class="bz-kbd">Ctrl/Cmd</span> + <span class="bz-kbd">S</span> salvar •
        <span class="bz-kbd">Ctrl/Cmd</span> + <span class="bz-kbd">O</span> abrir
      </div>
    </div>
  `;

  document.body.appendChild(root);
  return root;
}

async function resetToDefault(modeler) {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    const xml = await fetchDiagram(DEFAULT_DIAGRAM_URL);
    await modeler.importXML(xml);
    applyBizagiMarkersToAll(modeler);
    modeler.get('canvas').zoom('fit-viewport');
  } catch (err) {
    console.error('Falha ao resetar para default:', err);
    alert('Falha ao resetar. Veja o console.');
  }
}

function bindFloatingToolbar(modeler) {
  const toolbar = createFloatingToolbar();

  const fileInput = toolbar.querySelector('#bz-file-input');
  const btnSaveBpmn = toolbar.querySelector('#bz-save-bpmn');
  const btnSaveSvg = toolbar.querySelector('#bz-save-svg');
  const btnSaveLocal = toolbar.querySelector('#bz-save-local');
  const btnRestoreLocal = toolbar.querySelector('#bz-restore-local');
  const btnClearLocal = toolbar.querySelector('#bz-clear-local');
  const btnResetDefault = toolbar.querySelector('#bz-reset-default');
  const btnCollapse = toolbar.querySelector('#bz-collapse');

  btnCollapse?.addEventListener('click', () => {
    toolbar.classList.toggle('is-collapsed');
    btnCollapse.textContent = toolbar.classList.contains('is-collapsed') ? '▸' : '▾';
  });

  fileInput?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
      const xml = await file.text();
      await modeler.importXML(xml);
      applyBizagiMarkersToAll(modeler);
      modeler.get('canvas').zoom('fit-viewport');

      // após abrir, salva como estado atual
      const { xml: current } = await modeler.saveXML({ format: true });
      localStorage.setItem(LOCAL_STORAGE_KEY, current);
    } catch (err) {
      console.error('Falha ao importar BPMN:', err);
      alert('Falha ao importar BPMN. Veja o console.');
    } finally {
      fileInput.value = '';
    }
  });

  btnSaveBpmn?.addEventListener('click', async () => {
    try {
      const { xml } = await modeler.saveXML({ format: true });
      downloadText('diagram.bpmn', xml, 'application/xml');
    } catch (err) {
      console.error('Falha ao salvar BPMN:', err);
      alert('Falha ao salvar BPMN. Veja o console.');
    }
  });

  btnSaveSvg?.addEventListener('click', async () => {
    try {
      const { svg } = await modeler.saveSVG();
      downloadText('diagram.svg', svg, 'image/svg+xml');
    } catch (err) {
      console.error('Falha ao exportar SVG:', err);
      alert('Falha ao exportar SVG. Veja o console.');
    }
  });

  btnSaveLocal?.addEventListener('click', async () => {
    try {
      const { xml } = await modeler.saveXML({ format: true });
      localStorage.setItem(LOCAL_STORAGE_KEY, xml);
      alert('Salvo no navegador (localStorage).');
    } catch (err) {
      console.error('Falha ao salvar local:', err);
      alert('Falha ao salvar local. Veja o console.');
    }
  });

  btnRestoreLocal?.addEventListener('click', async () => {
    const xml = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!xml) return alert('Não existe backup salvo no navegador.');

    try {
      await modeler.importXML(xml);
      applyBizagiMarkersToAll(modeler);
      modeler.get('canvas').zoom('fit-viewport');
      alert('Restaurado do navegador (localStorage).');
    } catch (err) {
      console.error('Falha ao restaurar local:', err);
      alert('Falha ao restaurar local. Veja o console.');
    }
  });

  btnClearLocal?.addEventListener('click', () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    alert('Backup local removido.');
  });

  btnResetDefault?.addEventListener('click', () => resetToDefault(modeler));

  // Keyboard shortcuts
  window.addEventListener('keydown', async (e) => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      const { xml } = await modeler.saveXML({ format: true });
      downloadText('diagram.bpmn', xml, 'application/xml');
    }

    if (e.key.toLowerCase() === 'o') {
      e.preventDefault();
      fileInput?.click();
    }
  });
}

function fitAndOffsetCanvas(modeler, offsetX = 50) {
  const canvas = modeler.get('canvas');

  // 1) encaixa no viewport
  canvas.zoom('fit-viewport');

  // 2) desloca para a direita (evita sobrepor toolbar)
  canvas.scroll({ dx: offsetX, dy: 0 });
}

/* =====================================================
   Main
   ===================================================== */

async function run() {
  const modeler = new Modeler({
    container: '#canvas',
    additionalModules: [TokenSimulationModule]
  });

  enableAutoMarkers(modeler);
  bindFloatingToolbar(modeler);

  // ✅ AUTOSAVE a cada modificação (evita perder no refresh)
  const eventBus = modeler.get('eventBus');
  eventBus.on('commandStack.changed', async () => {
    try {
      const { xml } = await modeler.saveXML({ format: true });
      localStorage.setItem(LOCAL_STORAGE_KEY, xml);
    } catch (e) {
      console.warn('Autosave falhou:', e);
    }
  });

  try {
    // ✅ 1) tenta abrir do localStorage primeiro
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (saved) {
      await modeler.importXML(saved);
    } else {
      // ✅ 2) se não existir backup, abre o default
      const xml = await fetchDiagram(DEFAULT_DIAGRAM_URL);
      await modeler.importXML(xml);
    }

    applyBizagiMarkersToAll(modeler);
    fitAndOffsetCanvas(modeler);
  } catch (err) {
    console.error('Erro ao abrir BPMN:', err);
  }
}

run();
