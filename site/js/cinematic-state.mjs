export const routes = {
  openai: {
    name: 'OpenAI',
    mode: 'Your API key',
    detail: 'Route this conversation through your OpenAI connection.',
  },
  anthropic: {
    name: 'Anthropic',
    mode: 'Your API key',
    detail: 'Choose your Anthropic connection. The project and conversation stay attached.',
  },
  google: {
    name: 'Google',
    mode: 'Your API key',
    detail: 'Continue through your Google connection with the same project context.',
  },
  ollama: {
    name: 'Ollama',
    mode: 'On your machine',
    detail: 'Use a supported local model through Ollama, without a provider API key.',
  },
  hive: {
    name: 'Hive',
    mode: 'Sequential refinement',
    detail: 'Draft, critique, refine: pass the response through successive model stages.',
  },
};
export function changeRoute(current, route) {
  return Object.hasOwn(routes, route) ? { ...current, route } : current;
}
export function transitionWorkflow(current, event) {
  if (event === 'reset') return 'ready';
  if (current === 'approval')
    return event === 'approve' ? 'complete' : event === 'decline' ? 'declined' : current;
  if (event !== 'next') return current;
  return (
    { ready: 'research', research: 'build', build: 'review', review: 'approval' }[current] ||
    current
  );
}
const plans = {
  spark: ['Spark', 0, 1000, false, false],
  orbit: ['Orbit', 10, 5500, true, false],
  nova: ['Nova', 50, 27500, true, true],
  singularity: ['Singularity', 100, 55000, true, true],
  supernova: ['Supernova', 200, 110000, true, true],
};
export function planSummary(id) {
  if (!Object.hasOwn(plans, id)) return null;
  const [name, addon, credits, sync, publishing] = plans[id];
  return {
    name,
    total: 20 + addon,
    addon,
    credits,
    minutes: sync ? credits / 100 : 0,
    sms: sync ? credits / 10 : 0,
    sync,
    publishing,
  };
}
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function clampMap({ x, y, zoom }) {
  return { x: clamp(x, -120, 120), y: clamp(y, -80, 80), zoom: clamp(zoom, 0.75, 1.5) };
}
export const workflowCopy = {
  ready: [
    'One brief. A whole team.',
    'Prepare a release checklist for Project Atlas. Read the brief, draft a plan, and review it before any action.',
  ],
  research: [
    'Researcher finds the context.',
    'Project brief and release criteria attached. The research lane identifies three requirements.',
  ],
  build: [
    'Builder turns context into a plan.',
    'A scoped checklist is drafted. Terminal lanes show the proposed work in the same workspace.',
  ],
  review: [
    'Reviewer checks the edges.',
    'The checklist is reviewed against the release criteria. A decision is ready for you.',
  ],
  approval: [
    'Your decision. Before the action.',
    'The team proposes saving the reviewed checklist. Approve this simulation to see the result, or decline to leave it unrun.',
  ],
  complete: [
    'The result returns to the thread.',
    'Simulation complete: the reviewed checklist and its sources are attached to Project Atlas. No real command was executed.',
  ],
  declined: [
    'Declined. Nothing runs.',
    'The simulated action was not taken. Your context and draft remain available. Reset to explore the route again.',
  ],
};
