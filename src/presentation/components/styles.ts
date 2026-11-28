// Shared look of the admin screens, from the dashboard's Aura tokens: a card, a data table inside it, and
// the pill buttons. One place, so every screen matches.
export const card = 'rounded-[18px] border border-white/70 bg-aura-surface shadow-dash'
export const tableWrap = `${card} overflow-x-auto`
export const table = 'w-full min-w-[48rem] border-collapse text-start text-sm'
export const th = 'px-3 py-3 text-start text-xs font-semibold uppercase tracking-wide text-aura-muted'
export const tr = 'border-t border-aura-border transition-colors hover:bg-aura-hover'
export const td = 'px-3 py-3 align-middle'
export const tdMessage = 'px-4 py-8 text-center text-aura-muted'
export const input =
  'w-full rounded-lg border border-aura-border bg-transparent px-3 py-2 text-sm text-aura-text outline-none ring-1 ring-transparent placeholder:text-aura-muted/50 focus:border-aura-primary/40 focus:ring-aura-primary/25'
export const btnPrimary =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-aura-primary px-4 py-2 text-sm font-semibold text-white shadow-login-btn transition-opacity hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none'
export const btnOutline =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-aura-border bg-aura-surface px-3 py-1.5 text-sm font-medium text-aura-text transition-colors hover:bg-aura-hover disabled:cursor-not-allowed disabled:opacity-50'
export const btnDanger =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50'
