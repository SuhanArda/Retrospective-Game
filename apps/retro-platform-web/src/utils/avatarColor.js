// Slightly darkened brand-adjacent tones so white initials stay readable.
const AVATAR_COLORS = ['#e6752e', '#5b2a86', '#2f9e6e', '#5b6fd6', '#c2455c', '#a66a1f']

export function colorForName(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
