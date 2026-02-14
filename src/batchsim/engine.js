
import TinyQueue from 'tinyqueue';
import { sampleDist } from './distributions.js';

function simSafeDiv(a,b){ return b===0?0:(a/b); }

function elementType(el) { return el?.$type || ''; }
function isTask(t) { return t === 'bpmn:Task' || t.endsWith(':Task') || t === 'bpmn:UserTask' || t === 'bpmn:ServiceTask'; }
function isXor(t) { return t === 'bpmn:ExclusiveGateway'; }
function isStart(t) { return t === 'bpmn:StartEvent'; }
function isEnd(t) { return t === 'bpmn:EndEvent'; }
function hasTimerDef(el) { return (el.eventDefinitions || []).some(d => d.$type === 'bpmn:TimerEventDefinition'); }
function hasMessageDef(el) { return (el.eventDefinitions || []).some(d => d.$type === 'bpmn:MessageEventDefinition'); }

function pickWeightedFlow(outFlowIds, weightsByFlowId, rng) {
  const weights = outFlowIds.map(fid => Number(weightsByFlowId?.[fid] ?? 0));
  const sum = weights.reduce((a,b)=>a+b, 0);
  if (sum <= 0) return outFlowIds[Math.floor(rng() * outFlowIds.length)];
  let r = rng() * sum;
  for (let i=0;i<outFlowIds.length;i++) {
    r -= weights[i];
    if (r <= 0) return outFlowIds[i];
  }
  return outFlowIds[outFlowIds.length - 1];
}

export async function runBatch({ graph, cfg, rng }) {
  const replications = Math.max(1, Number(cfg.replications || 1));
  const seedBase = Number(cfg.seed ?? 123);

  const eventsRows = [];
  const summaryRows = [];
  const pathRows = [];
  const proofRows = [];
  const casesRows = [];
  const taskRows = [];

  for (let rep=1; rep<=replications; rep++) {
    const repRng = rng(seedBase + rep * 1009);
    const res = runOne({ graph, cfg, rep, rng: repRng });
    eventsRows.push(...res.events);
    summaryRows.push(res.summary);
    pathRows.push(...res.paths);
    if (res.proofRows) proofRows.push(...res.proofRows);
    if (res.casesRows) casesRows.push(...res.casesRows);
    if (res.taskSpans) taskRows.push(...res.taskSpans);
  }

  return { eventsRows, summaryRows, pathRows, proofRows, casesRows, taskRows };
}

function runOne({ graph, cfg, rep, rng }) {
  const maxSimTime = Number(cfg.maxSimTime ?? 1000);
  const maxEvents = Number(cfg.maxEvents ?? 200000);

  const startEventId = cfg.startEventId || graph.startEvents[0];
  if (!startEventId) throw new Error('No startEvent found; set cfg.startEventId.');

  const arrivalSpec = cfg.caseArrival || { type: 'fixed', value: 0 };

  // metrics
  let activeCases = 0;
  let lastTime = 0;
  let wipArea = 0;
  let completedCases = 0;

  const caseRegistry = new Map(); // caseId -> { startTime, endTime, completed }
  const proofRows = [];
  const taskSpans = [];
  const taskStartTime = new Map(); // tokenId -> { taskId, startAt }

  const flowTraversals = new Map();
  const xorTotals = new Map();

  const events = [];
  const q = new TinyQueue([], (a,b)=>a.t-b.t);

  let caseSeq = 0;
  let tokenSeq = 0;

  const taskInProgress = new Map(); // tokenId -> { taskId, doneAt, canceled }

  function updateWip(t) {
    const dt = t - lastTime;
    if (dt > 0) wipArea += activeCases * dt;
    proofRows.push({
      scenarioId: String(cfg.scenarioId || 'scenario'),
      replication: rep,
      time: Number(t.toFixed(6)),
      dt: Number(dt.toFixed(6)),
      activeCases,
      completedCases,
      wipAreaCum: Number(wipArea.toFixed(6)),
      throughputCum: Number((completedCases / Math.max(1e-9, t)).toFixed(6))
    });
    lastTime = t;
  }

  function log(row) {
    events.push({
      scenarioId: String(cfg.scenarioId || 'scenario'),
      replication: rep,
      simTime: Number(row.simTime.toFixed(6)),
      eventType: row.eventType,
      caseId: row.caseId,
      tokenId: row.tokenId,
      elementId: row.elementId || '',
      elementType: row.elementType || '',
      fromId: row.fromId || '',
      toId: row.toId || '',
      flowId: row.flowId || ''
    });
  }

  function schedule(t, payload) { q.push({ t, ...payload }); }
  function scheduleArrival(t) { schedule(t, { kind: 'ARRIVAL' }); }
  function scheduleEnter(t, token) { schedule(t, { kind: 'ENTER', token }); }
  function scheduleLeave(t, token, toId, flowId) { schedule(t, { kind: 'LEAVE', token, toId, flowId }); }

  scheduleArrival(0);

  function outgoing(nodeId) {
    return graph.outgoingById.get(nodeId) || [];
  }

  function onArrival(t) {
    updateWip(t);
    if (t > maxSimTime) return;

    const caseId = `C${rep}_${++caseSeq}`;
    const tokenId = `T${rep}_${++tokenSeq}`;
    activeCases += 1;
    caseRegistry.set(caseId, { startTime: t, endTime: null, completed: false });

    const token = { caseId, tokenId, nodeId: startEventId };

    log({ simTime: t, eventType: 'case_start', caseId, tokenId, elementId: startEventId, elementType: 'bpmn:StartEvent' });
    scheduleEnter(t, token);

    const ia = sampleDist(arrivalSpec, rng);
    if (Number.isFinite(ia) && ia >= 0) scheduleArrival(t + ia);
  }

  function onEnter(t, token) {
    updateWip(t);
    const el = graph.elementsById.get(token.nodeId);
    if (!el) {
      log({ simTime: t, eventType: 'token_error', caseId: token.caseId, tokenId: token.tokenId, elementId: token.nodeId });
      return;
    }
    const tpe = elementType(el);
    log({ simTime: t, eventType: 'enter', caseId: token.caseId, tokenId: token.tokenId, elementId: el.id, elementType: tpe });

    if (isStart(tpe)) {
      const outs = outgoing(el.id);
      const fid = outs[0];
      const flow = graph.flowsById.get(fid);
      scheduleLeave(t, token, flow.targetRef.id, fid);
      return;
    }

    if (isEnd(tpe)) {
      activeCases -= 1;
      completedCases += 1;
      const cr = caseRegistry.get(token.caseId);
      if (cr) { cr.endTime = t; cr.completed = true; caseRegistry.set(token.caseId, cr); }
      log({ simTime: t, eventType: 'case_end', caseId: token.caseId, tokenId: token.tokenId, elementId: el.id, elementType: tpe });
      return;
    }

    // Intermediate catch timer
    if (tpe === 'bpmn:IntermediateCatchEvent' && hasTimerDef(el)) {
      const delay = sampleDist(cfg.timerEvents?.[el.id] || { type:'fixed', value:1 }, rng);
      const outs = outgoing(el.id);
      const fid = outs[0];
      const flow = graph.flowsById.get(fid);
      scheduleLeave(t + delay, token, flow.targetRef.id, fid);
      return;
    }

    // Message catch
    if (tpe === 'bpmn:IntermediateCatchEvent' && hasMessageDef(el)) {
      const delay = sampleDist(cfg.messageDelays?.[el.id] || { type:'fixed', value:0 }, rng);
      const outs = outgoing(el.id);
      const fid = outs[0];
      const flow = graph.flowsById.get(fid);
      scheduleLeave(t + delay, token, flow.targetRef.id, fid);
      return;
    }

    // Message throw immediate
    if (tpe === 'bpmn:IntermediateThrowEvent' && hasMessageDef(el)) {
      const outs = outgoing(el.id);
      const fid = outs[0];
      const flow = graph.flowsById.get(fid);
      scheduleLeave(t, token, flow.targetRef.id, fid);
      return;
    }

    if (isTask(tpe)) {
      const dur = sampleDist(cfg.activityDurations?.[el.id] || { type:'fixed', value:1 }, rng);
      const doneAt = t + dur;
      taskInProgress.set(token.tokenId, { taskId: el.id, doneAt, canceled: false });
      taskStartTime.set(token.tokenId, { taskId: el.id, startAt: t });
      taskStartTime.set(token.tokenId, { taskId: el.id, startAt: t });

      // boundary timers cancelActivity
      const boundaries = graph.boundaryByAttached.get(el.id) || [];
      for (const b of boundaries) {
        if (!hasTimerDef(b)) continue;
        const cancelActivity = b.cancelActivity !== false;
        if (!cancelActivity) continue;

        const bDelay = sampleDist(cfg.boundaryTimers?.[b.id] || { type:'fixed', value:dur + 1 }, rng);
        schedule(t + bDelay, { kind: 'BOUNDARY', token, boundaryId: b.id, attachedTaskId: el.id });
      }

      schedule(doneAt, { kind: 'TASK_DONE', token, taskId: el.id });
      return;
    }

    if (isXor(tpe)) {
      const outs = outgoing(el.id);
      const policy = cfg.xorPolicies?.[el.id];
      let fid = outs[0];
      if (policy?.type === 'weighted') fid = pickWeightedFlow(outs, policy.weightsByFlowId, rng);
      else fid = outs[Math.floor(rng() * outs.length)];

      xorTotals.set(el.id, (xorTotals.get(el.id) || 0) + 1);
      const flow = graph.flowsById.get(fid);
      scheduleLeave(t, token, flow.targetRef.id, fid);
      return;
    }

    // fallback: first outgoing
    const outs = outgoing(el.id);
    if (!outs.length) return;
    const fid = outs[0];
    const flow = graph.flowsById.get(fid);
    scheduleLeave(t, token, flow.targetRef.id, fid);
  }

  function onLeave(t, token, toId, flowId) {
    updateWip(t);

    flowTraversals.set(flowId, (flowTraversals.get(flowId) || 0) + 1);

    const flow = graph.flowsById.get(flowId);
    const fromId = flow?.sourceRef?.id || token.nodeId;

    log({ simTime: t, eventType: 'leave', caseId: token.caseId, tokenId: token.tokenId, fromId, toId, flowId });

    token.nodeId = toId;
    scheduleEnter(t, token);
  }

  function onTaskDone(t, token, taskId) {
    updateWip(t);
    const st = taskInProgress.get(token.tokenId);
    if (!st || st.taskId !== taskId || st.canceled) return;

    log({ simTime: t, eventType: 'task_complete', caseId: token.caseId, tokenId: token.tokenId, elementId: taskId, elementType: 'task' });
    const ts = taskStartTime.get(token.tokenId);
    if (ts && ts.taskId === taskId) {
      taskSpans.push({
        scenarioId: String(cfg.scenarioId || 'scenario'),
        replication: rep,
        caseId: token.caseId,
        taskId,
        startTime: Number(ts.startAt.toFixed(6)),
        endTime: Number(t.toFixed(6)),
        duration: Number((t - ts.startAt).toFixed(6)),
        outcome: 'completed'
      });
      taskStartTime.delete(token.tokenId);
    }
    taskInProgress.delete(token.tokenId);

    const outs = outgoing(taskId);
    if (!outs.length) return;
    const fid = outs[0];
    const flow = graph.flowsById.get(fid);
    scheduleLeave(t, token, flow.targetRef.id, fid);
  }

  function onBoundary(t, token, boundaryId, attachedTaskId) {
    updateWip(t);
    const st = taskInProgress.get(token.tokenId);
    if (!st || st.taskId !== attachedTaskId || st.canceled) return;
    if (t >= st.doneAt) return; // task already finished

    st.canceled = true;
    taskInProgress.set(token.tokenId, st);

    log({ simTime: t, eventType: 'boundary_timer_fire', caseId: token.caseId, tokenId: token.tokenId, elementId: boundaryId, elementType: 'boundary_timer', fromId: attachedTaskId });
    const ts = taskStartTime.get(token.tokenId);
    if (ts && ts.taskId === attachedTaskId) {
      taskSpans.push({
        scenarioId: String(cfg.scenarioId || 'scenario'),
        replication: rep,
        caseId: token.caseId,
        taskId: attachedTaskId,
        startTime: Number(ts.startAt.toFixed(6)),
        endTime: Number(t.toFixed(6)),
        duration: Number((t - ts.startAt).toFixed(6)),
        outcome: 'canceled_by_boundary_timer',
        boundaryId
      });
      taskStartTime.delete(token.tokenId);
    }

    const outs = outgoing(boundaryId);
    if (!outs.length) return;
    const fid = outs[0];
    const flow = graph.flowsById.get(fid);
    scheduleLeave(t, token, flow.targetRef.id, fid);
  }

  let processed = 0;
  while (q.length && processed < maxEvents) {
    const ev = q.pop();
    const t = ev.t;

    if (t > maxSimTime && activeCases === 0) break;

    if (ev.kind === 'ARRIVAL') onArrival(t);
    else if (ev.kind === 'ENTER') onEnter(t, ev.token);
    else if (ev.kind === 'LEAVE') onLeave(t, ev.token, ev.toId, ev.flowId);
    else if (ev.kind === 'TASK_DONE') onTaskDone(t, ev.token, ev.taskId);
    else if (ev.kind === 'BOUNDARY') onBoundary(t, ev.token, ev.boundaryId, ev.attachedTaskId);

    processed++;
  }

  const simEndTime = Math.max(lastTime, 1e-9);
  const avgWip = wipArea / simEndTime;
  const throughput = completedCases / simEndTime;

  const summary = {
    scenarioId: String(cfg.scenarioId || 'scenario'),
    replication: rep,
    simEndTime: Number(simEndTime.toFixed(6)),
    completedCases,
    throughput: Number(throughput.toFixed(6)),
    avgWip: Number(avgWip.toFixed(6)),
    processedEvents: processed
  };

  const paths = [];
  for (const [gatewayId, total] of xorTotals.entries()) {
    const outs = outgoing(gatewayId);
    for (const fid of outs) {
      const c = flowTraversals.get(fid) || 0;
      paths.push({
        scenarioId: String(cfg.scenarioId || 'scenario'),
        replication: rep,
        gatewayId,
        flowId: fid,
        traversals: c,
        totalGatewayExits: total,
        pathProbability: total > 0 ? Number((c / total).toFixed(6)) : 0
      });
    }
  }

  const casesRows = [];
  for (const [caseId, cr] of caseRegistry.entries()) {
    if (cr.startTime == null) continue;
    const endTime = cr.endTime == null ? null : Number(cr.endTime.toFixed(6));
    const cycleTime = (cr.endTime == null) ? null : Number((cr.endTime - cr.startTime).toFixed(6));
    casesRows.push({
      scenarioId: String(cfg.scenarioId || 'scenario'),
      replication: rep,
      caseId,
      startTime: Number(cr.startTime.toFixed(6)),
      endTime,
      cycleTime,
      completed: cr.completed ? 1 : 0
    });
  }

  return { events, summary, paths, proofRows, casesRows, taskSpans };
}
