// Electron antepone "Error invoking remote method 'x': Error: " al mensaje real.
export function mensaje(e) {
  return String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
