import { useState } from 'react'
import { avatarImageSrc, isKnownAvatarId } from '../utils/avatarOptions.js'

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function Avatar({ name, color, avatarId, size = 34 }) {
  // Falls back to the initials circle whenever there's no picked avatar yet,
  // or its image fails to load (missing file, offline) — never a broken icon.
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = isKnownAvatarId(avatarId) && !imageFailed

  // The name-color only makes sense as a background behind initials text —
  // once a real portrait is showing, its own transparent margin should read
  // as a clean neutral circle, not whatever color this person's name hashed
  // to (that was showing through as a jarring purple/orange disc).
  return (
    <span
      className={`avatar${showImage ? ' avatar-has-image' : ''}`}
      style={{ background: showImage ? undefined : color, width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {showImage ? (
        <img
          src={avatarImageSrc(avatarId)}
          alt=""
          width={size}
          height={size}
          className="avatar-image"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials(name || '?')
      )}
    </span>
  )
}

export default Avatar
