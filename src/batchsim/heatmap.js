
export function clearHeatmap(canvas, elementRegistry) {
  const ids = elementRegistry.getAll().map(e => e.id);
  for (const id of ids) {
    canvas.removeMarker(id, 'sim-hot-1');
    canvas.removeMarker(id, 'sim-hot-2');
    canvas.removeMarker(id, 'sim-hot-3');
    canvas.removeMarker(id, 'sim-hot-4');

    canvas.removeMarker(id, 'sim-flow-1');
    canvas.removeMarker(id, 'sim-flow-2');
    canvas.removeMarker(id, 'sim-flow-3');
    canvas.removeMarker(id, 'sim-flow-4');
  }
}

function bin(v) {
  if (v <= 0) return 0;
  if (v < 0.25) return 1;
  if (v < 0.50) return 2;
  if (v < 0.75) return 3;
  return 4;
}

/**
 * Apply heatmap markers based on per-element and per-flow counts.
 * - elementsCounts: Map(elementId -> count)
 * - flowCounts: Map(flowId -> count)
 */
export function applyHeatmap({ canvas, elementRegistry, elementsCounts, flowCounts }) {
  const elMax = Math.max(1, ...Array.from(elementsCounts.values()));
  const flMax = Math.max(1, ...Array.from(flowCounts.values()));

  for (const el of elementRegistry.getAll()) {
    const id = el.id;
    const count = elementsCounts.get(id) || 0;
    const norm = count / elMax;
    const b = bin(norm);
    if (b > 0) canvas.addMarker(id, `sim-hot-${b}`);

    const fcount = flowCounts.get(id) || 0;
    const fnorm = fcount / flMax;
    const fb = bin(fnorm);
    if (fb > 0) canvas.addMarker(id, `sim-flow-${fb}`);
  }
}
