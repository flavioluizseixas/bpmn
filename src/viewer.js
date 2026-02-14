
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

import './themes/bizagi-theme.css';
import './themes/bizagi-viewer.css';
import './batchsim/batch-sim.css';

import BpmnModdle from 'bpmn-moddle';

import { downloadText, toCsv, mulberry32 } from './batchsim/utils.js';
import { buildGraph } from './batchsim/graph.js';
import { runBatch } from './batchsim/engine.js';
import { applyHeatmap, clearHeatmap } from './batchsim/heatmap.js';

const DEFAULT_DIAGRAM_URL = '/pizza-collaboration.bpmn';

async function fetchDiagram(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar diagrama: ${res.status} (${url})`);
  return res.text();
}

function makeToolbar() {
  const el = document.createElement('div');
  el.className = 'sim-toolbar';
  el.innerHTML = `
    <h3>Viewer + Batch Simulation</h3>

    <div class="row">
      <button id="btn-load-bpmn">Load BPMN</button>
      <button id="btn-clear-heat">Limpar heatmap</button>
    </div>

    <div class="row">
      <button id="btn-run" class="primary">Run (JSON)</button>
      <button id="btn-export">Export CSV</button>
    </div>

    <div class="small">
      • Esta página é somente visualização (sem edição).<br/>
      • URL: <code>/viewer.html</code> (modelador permanece em <code>/index.html</code>).
    </div>

    <div class="status" id="status">Pronto.</div>

    <input id="file-bpmn" type="file" accept=".bpmn,.xml" style="display:none" />
    <input id="file-sim" type="file" accept="application/json" style="display:none" />
  `;
  return el;
}

function setStatus(el, txt) {
  el.querySelector('#status').textContent = txt;
}

let currentXml = null;
let last = { eventsRows: [], summaryRows: [], pathRows: [], proofRows: [], casesRows: [], taskRows: [] };

(async () => {
  const canvasEl = document.getElementById('canvas');

  const viewer = new NavigatedViewer({
    container: canvasEl,
    });

  const toolbar = makeToolbar();
  document.body.appendChild(toolbar);

  const statusEl = toolbar;

  // 1) tenta carregar automaticamente o BPMN salvo pelo modelador (localStorage)
  const LS_KEY = 'bpmn.autosave.xml';
  const savedXml = localStorage.getItem(LS_KEY);
  if (savedXml && savedXml.trim().startsWith('<?xml')) {
    try {
      currentXml = savedXml;
      await viewer.importXML(currentXml);
      viewer.get('canvas').zoom('fit-viewport');
      setStatus(statusEl, `BPMN carregado do localStorage (${LS_KEY}).`);
    } catch (e) {
      console.warn('Falha ao importar BPMN do localStorage, caindo para o default.', e);
      currentXml = null;
    }
  }


  // 2) se não há nada salvo, carrega o diagrama padrão
  if (!currentXml) {
    try {
      currentXml = await fetchDiagram(DEFAULT_DIAGRAM_URL);
      await viewer.importXML(currentXml);
      viewer.get('canvas').zoom('fit-viewport');
      setStatus(statusEl, `BPMN carregado: ${DEFAULT_DIAGRAM_URL}`);
    } catch (e) {
      console.error(e);
      setStatus(statusEl, 'Não foi possível carregar o BPMN padrão. Use Load BPMN.');
    }
  }

  const fileBpmn = toolbar.querySelector('#file-bpmn');
  toolbar.querySelector('#btn-load-bpmn').addEventListener('click', () => fileBpmn.click());

  fileBpmn.addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      currentXml = await f.text();
      const { warnings } = await viewer.importXML(currentXml);
      viewer.get('canvas').zoom('fit-viewport');
      setStatus(statusEl, `Viewer carregou: ${f.name}\nWarnings: ${warnings?.length || 0}`);
    } catch (e) {
      console.error(e);
      setStatus(statusEl, 'Erro ao importar BPMN. Veja o console.');
    } finally {
      fileBpmn.value = '';
    }
  });

  // heatmap clear
  toolbar.querySelector('#btn-clear-heat').addEventListener('click', () => {
    const canvas = viewer.get('canvas');
    const elementRegistry = viewer.get('elementRegistry');
    clearHeatmap(canvas, elementRegistry);
    setStatus(statusEl, 'Heatmap limpo.');
  });

  // run simulation
  const fileSim = toolbar.querySelector('#file-sim');
  toolbar.querySelector('#btn-run').addEventListener('click', () => fileSim.click());

  toolbar.querySelector('#btn-export').addEventListener('click', () => {
    if (!last.summaryRows.length) {
      setStatus(statusEl, 'Nada para exportar ainda. Rode uma simulação.');
      return;
    }
    const prefix = last.summaryRows[0]?.scenarioId || 'simulation';
    downloadText(`events_${prefix}.csv`, toCsv(last.eventsRows), 'text/csv');
    downloadText(`summary_${prefix}.csv`, toCsv(last.summaryRows), 'text/csv');
    downloadText(`paths_${prefix}.csv`, toCsv(last.pathRows), 'text/csv');
    setStatus(statusEl, 'CSVs exportados.');
  });

  fileSim.addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;

    if (!currentXml) {
      setStatus(statusEl, 'Carregue um BPMN antes de simular.');
      fileSim.value = '';
      return;
    }

    try {
      const cfg = JSON.parse(await f.text());
      setStatus(statusEl, `Rodando batch: replications=${cfg.replications || 1} ...`);

      // parse BPMN with moddle
      const moddle = new BpmnModdle();
      const { rootElement: definitions } = await moddle.fromXML(currentXml);
      const graph = buildGraph(definitions);

      const rngFactory = (seed) => mulberry32(seed);
      last = await runBatch({ graph, cfg, rng: rngFactory });

      // compute counts for heatmap from events
      const elementCounts = new Map();
      const flowCounts = new Map();

      for (const row of last.eventsRows) {
        if (row.eventType === 'enter' && row.elementId) {
          elementCounts.set(row.elementId, (elementCounts.get(row.elementId) || 0) + 1);
        }
        if (row.eventType === 'leave' && row.flowId) {
          flowCounts.set(row.flowId, (flowCounts.get(row.flowId) || 0) + 1);
        }
      }

      const canvas = viewer.get('canvas');
      const elementRegistry = viewer.get('elementRegistry');

      clearHeatmap(canvas, elementRegistry);
      applyHeatmap({ canvas, elementRegistry, elementsCounts: elementCounts, flowCounts });

      // show quick stats
      const avgTp = last.summaryRows.reduce((a,b)=>a+b.throughput,0) / Math.max(1, last.summaryRows.length);
      const avgWip = last.summaryRows.reduce((a,b)=>a+b.avgWip,0) / Math.max(1, last.summaryRows.length);

      setStatus(statusEl,
        `Concluído.\n` +
        `Replicações: ${last.summaryRows.length}\n` +
        `Throughput médio: ${avgTp.toFixed(4)}\n` +
        `WIP médio: ${avgWip.toFixed(4)}\n` +
        `Heatmap aplicado no diagrama.`
      );

    } catch (e) {
      console.error(e);
      setStatus(statusEl, 'Falha na simulação. Veja o console.');
    } finally {
      fileSim.value = '';
    }
  });

})();