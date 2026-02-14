
export function buildGraph(definitions) {
  const processes = definitions.rootElements?.filter(e => e.$type === 'bpmn:Process') || [];
  const process = processes[0];
  if (!process) throw new Error('No bpmn:Process found in definitions.');

  const elementsById = new Map();
  const outgoingById = new Map();
  const flowsById = new Map();
  const boundaryByAttached = new Map(); // taskId -> [boundaryEvent]

  function collect(container) {
    const flowElements = container.flowElements || [];
    for (const el of flowElements) {
      if (!el?.id) continue;
      elementsById.set(el.id, el);

      if (el.$type === 'bpmn:SequenceFlow') {
        flowsById.set(el.id, el);
      }

      if (el.$type === 'bpmn:BoundaryEvent' && el.attachedToRef?.id) {
        const taskId = el.attachedToRef.id;
        const arr = boundaryByAttached.get(taskId) || [];
        arr.push(el);
        boundaryByAttached.set(taskId, arr);
      }

      if (el.$type === 'bpmn:SubProcess') {
        collect(el);
      }
    }
  }

  collect(process);

  for (const [flowId, flow] of flowsById.entries()) {
    const src = flow.sourceRef?.id;
    if (!src) continue;
    const out = outgoingById.get(src) || [];
    out.push(flowId);
    outgoingById.set(src, out);
  }

  const startEvents = [];
  for (const el of elementsById.values()) {
    if (el.$type === 'bpmn:StartEvent') startEvents.push(el.id);
  }

  return {
    processId: process.id,
    elementsById,
    outgoingById,
    flowsById,
    boundaryByAttached,
    startEvents
  };
}
