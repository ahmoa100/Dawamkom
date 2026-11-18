export function runtimePolicy(env = process.env) {
  const mode = env.DAWAMAK_RUNTIME_MODE || 'live';
  if (!['live', 'preview', 'standby', 'maintenance'].includes(mode)) throw new Error('Invalid Dawamkom runtime mode.');
  if (mode === 'preview' && env.DAWAMAK_STORAGE_BUCKET && env.DAWAMAK_STORAGE_KEY !== 'migration/preview-state.json')
    throw new Error('Preview mode requires the isolated migration/preview-state.json object.');
  return {
    mode,
    writes: mode === 'live' || mode === 'preview',
    delivery: mode === 'live',
    background: mode === 'live',
    permits(method, path) {
      if (path === '/health' || path === '/api/version') return ['GET', 'HEAD'].includes(method);
      if (mode === 'maintenance') return false;
      return mode !== 'standby' || ['GET', 'HEAD'].includes(method);
    },
  };
}
export const runtime = runtimePolicy();
export function assertRuntimeWrite() {
  if (!runtime.writes) throw Object.assign(new Error('Dawamkom is temporarily read-only.'), {code:'READ_ONLY'});
}
