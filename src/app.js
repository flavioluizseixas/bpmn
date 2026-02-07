import Modeler from 'bpmn-js/lib/Modeler';

// CSS essenciais do bpmn-js
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

// Tema Bizagi-like (Option 3)
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

function markerFor(el) {
  const t = el.type;

  // Events
  if (
    t === 'bpmn:StartEvent' ||
    t === 'bpmn:EndEvent' ||
    t === 'bpmn:IntermediateThrowEvent' ||
    t === 'bpmn:IntermediateCatchEvent' ||
    t === 'bpmn:BoundaryEvent'
  ) return 'bizagi-event';

  // Gateways
  if (
    t === 'bpmn:ExclusiveGateway' ||
    t === 'bpmn:ParallelGateway' ||
    t === 'bpmn:InclusiveGateway' ||
    t === 'bpmn:EventBasedGateway' ||
    t === 'bpmn:ComplexGateway'
  ) return 'bizagi-gateway';

  // Subprocess
  if (
    t === 'bpmn:SubProcess' ||
    t === 'bpmn:Transaction' ||
    t === 'bpmn:AdHocSubProcess'
  ) return 'bizagi-subprocess';

  // Tasks
  if (t && t.startsWith('bpmn:') && t.endsWith('Task')) return 'bizagi-task';

  // Pools/Lanes
  if (t === 'bpmn:Participant' || t === 'bpmn:Lane') return 'bizagi-participant';

  return null;
}

function setBizagiMarker(canvas, el) {
  if (!el || isLabel(el) || isConnection(el)) return;

  // remove markers conhecidos para evitar “acúmulo” em replace
  const known = [
    'bizagi-task',
    'bizagi-event',
    'bizagi-gateway',
    'bizagi-subprocess',
    'bizagi-participant'
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

function enableAutoMarkers(modeler) {
  const eventBus = modeler.get('eventBus');
  const canvas = modeler.get('canvas');

  eventBus.on('shape.added', (e) => setBizagiMarker(canvas, e.element));
  eventBus.on('shape.replaced', (e) => setBizagiMarker(canvas, e.newShape || e.element));

  // segurança extra quando vários mudam ao mesmo tempo (paste, etc.)
  eventBus.on('elements.changed', (e) => (e.elements || []).forEach((el) => setBizagiMarker(canvas, el)));
}

async function run() {
  const modeler = new Modeler({
    container: '#canvas',
    additionalModules: [TokenSimulationModule]
  });

  enableAutoMarkers(modeler);

  try {
    const xml = await fetchDiagram('/pizza-collaboration.bpmn');
    await modeler.importXML(xml);

    // ✅ aplica as classes/marcadores que o CSS espera
    applyBizagiMarkersToAll(modeler);

    modeler.get('canvas').zoom('fit-viewport');
  } catch (err) {
    console.error('Erro ao abrir BPMN:', err);
  }
}

run();
