import Modeler from 'bpmn-js/lib/Modeler';

// CSS essenciais (diagram-js + fonte BPMN)
// (o walkthrough recomenda incluir esses estilos do dist/assets)
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

async function fetchDiagram(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar diagrama: ${res.status}`);
  return res.text();
}

async function run() {
  const modeler = new Modeler({ container: '#canvas' });

  try {
    const xml = await fetchDiagram('diagram.bpmn');
    await modeler.importXML(xml);
    modeler.get('canvas').zoom('fit-viewport');
  } catch (err) {
    console.error('Erro ao abrir BPMN:', err);
  }
}

run();
