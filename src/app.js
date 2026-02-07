import Modeler from 'bpmn-js/lib/Modeler';

// CSS essenciais do bpmn-js
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

// Tema Bizagi-like (Marker + CSS)
import './themes/bizagi-theme.css';

// Token Simulation (módulo + CSS)
import TokenSimulationModule from 'bpmn-js-token-simulation';
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css';

async function fetchDiagram(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar diagrama: ${res.status} (${url})`);
  return res.text();
}

function isLabel(el) {
  return Boolean(el.labelTarget);
}

function isConnection(el) {
  return Array.isArray(el.waypoints);
}

/**
 * Mapeia tipo BPMN -> marker CSS Bizagi-like
 */
function markerFor(el) {
  const t = el.type;

  // Start / End
  if (t === 'bpmn:StartEvent') return 'bizagi-start-event';
  if (t === 'bpmn:EndEvent') return 'bizagi-end-event';

  // Intermediate catch vs throw
  if (t === 'bpmn:IntermediateCatchEvent') return 'bizagi-intermediate-catch';
  if (t === 'bpmn:IntermediateThrowEvent') return 'bizagi-intermediate-throw';

  // Boundary (geralmente catch)
  if (t === 'bpmn:BoundaryEvent') return 'bizagi-intermediate-catch';

  // Gateways
  if (
    t === 'bpmn:ExclusiveGateway' ||
    t === 'bpmn:ParallelGateway' ||
    t === 'bpmn:InclusiveGateway' ||
    t === 'bpmn:EventBasedGateway' ||
    t === 'bpmn:ComplexGateway'
  ) return 'bizagi-gateway';

  // Subprocessos
  if (
    t === 'bpmn:SubProcess' ||
    t === 'bpmn:Transaction' ||
    t === 'bpmn:AdHocSubProcess'
  ) return 'bizagi-subprocess';

  // Tasks (UserTask, ServiceTask, etc.)
  if (t && t.startsWith('bpmn:') && t.endsWith('Task')) return 'bizagi-task';

  // Pools/Lanes
  if (t === 'bpmn:Participant' || t === 'bpmn:Lane') return 'bizagi-participant';

  return null;
}

/**
 * Remove markers conhecidos e aplica o correto.
 */
function setBizagiMarker(canvas, el) {
  if (!el || isLabel(el) || isConnection(el)) return;

  const known = [
    'bizagi-task',
    'bizagi-subprocess',
    'bizagi-gateway',
    'bizagi-start-event',
    'bizagi-end-event',
    'bizagi-intermediate-catch',
    'bizagi-intermediate-throw',
    'bizagi-participant',
    // estados opcionais
    'bizagi-warn',
    'bizagi-ok'
  ];

  known.forEach((m) => canvas.removeMarker(el.id, m));

  const m = markerFor(el);
  if (m) canvas.addMarker(el.id, m);
}

function applyBizagiMarkersToAll(modeler) {
  const canvas = modeler.get('canvas');
  const elementRegistry = modeler.get('elementRegistry');

  elementRegistry.forEach((el) => setBizagiMarker(canvas, el));
}

/**
 * Auto-aplica markers em create/paste/replace (estável).
 */
function enableAutoMarkers(modeler) {
  const eventBus = modeler.get('eventBus');
  const canvas = modeler.get('canvas');

  eventBus.on('shape.added', (e) => {
    setBizagiMarker(canvas, e.element);
  });

  eventBus.on('shape.replaced', (e) => {
    setBizagiMarker(canvas, e.newShape || e.element);
  });

  eventBus.on('elements.changed', (e) => {
    (e.elements || []).forEach((el) => setBizagiMarker(canvas, el));
  });
}

async function run() {
  const modeler = new Modeler({
    container: '#canvas',
    additionalModules: [TokenSimulationModule]
  });

  enableAutoMarkers(modeler);

  try {
    // Forma A: ./diagrams servido como estático na raiz => /pizza-collaboration.bpmn
    const xml = await fetchDiagram('/pizza-collaboration.bpmn');

    await modeler.importXML(xml);

    // aplica markers para o CSS atuar
    applyBizagiMarkersToAll(modeler);

    modeler.get('canvas').zoom('fit-viewport');
  } catch (err) {
    console.error('Erro ao abrir BPMN:', err);
  }
}

run();
