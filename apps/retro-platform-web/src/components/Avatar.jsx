function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function Avatar({ name, color, size = 34 }) {
  return (
    <span
      className="avatar"
      style={{ background: color, width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name || '?')}
    </span>
  )
}

export default Avatar
