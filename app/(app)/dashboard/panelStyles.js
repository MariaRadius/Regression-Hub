// Shared surface treatment for dashboard panels so every card on the page reads
// as one coherent family (same subtle top-down gradient + elevation). Imported by
// both the RSC page shell and the client insights panels.

export const DASHBOARD_PANEL_SX = Object.freeze({
  overflow: 'hidden',
  background:
    'linear-gradient(180deg, rgba(249,250,251,0.9) 0%, rgba(255,255,255,1) 26%)',
  boxShadow: 1,
});

export const DASHBOARD_PANEL_BODY_SX = Object.freeze({
  p: 2.5,
  borderRadius: 3,
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.88) 100%)',
});
