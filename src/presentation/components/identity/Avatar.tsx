// A person's avatar: their initials on one of five Aura tints, picked from the name so the same person
// always gets the same colour. User Profile holds no picture (LLD §15 #21), so the initials are the avatar.
const TINTS = [
  'bg-aura-primary-soft text-[color:var(--aura-primary-on-soft)]',
  'bg-aura-secondary-soft text-[color:var(--aura-secondary-on-soft)]',
  'bg-aura-tertiary-soft text-aura-text',
  'bg-aura-accent-coral-soft text-aura-text',
  'bg-aura-accent-amber-soft text-aura-text',
] as const

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

function tintOf(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[hash % TINTS.length]!
}

export default function Avatar({ name, size = 'md', className = '' }: { name: string; size?: 'md' | 'lg'; className?: string }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${tintOf(name)} ${size === 'lg' ? 'size-12 text-base' : 'size-9 text-xs'} ${className}`}>
      {initialsOf(name) || '?'}
    </span>
  )
}
