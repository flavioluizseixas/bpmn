import Modeler from 'bpmn-js/lib/Modeler';

// CSS essenciais do bpmn-js
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

// ✅ Token Simulation (módulo + CSS)
import TokenSimulationModule from 'bpmn-js-token-simulation';
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css';

async function fetchDiagram(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar diagrama: ${res.status}`);
  return res.text();
}

async function run() {
  const modeler = new Modeler({
    container: '#canvas',

    // ✅ registra o plugin
    additionalModules: [
      TokenSimulationModule
    ]
  });

  try {
    const xml = await fetchDiagram('/pizza-collaboration.bpmn');
    await modeler.importXML(xml);

    modeler.get('canvas').zoom('fit-viewport');

    // (opcional) dica: o plugin adiciona UI própria;
    // você habilita via botão/controle que aparece no modeler.
  } catch (err) {
    console.error('Erro ao abrir BPMN:', err);
  }
}

run();
