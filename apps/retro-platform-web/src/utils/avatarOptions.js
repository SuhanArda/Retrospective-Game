// Bahadır's Gemini-generated pixel-art portraits, dropped into
// public/avatars/{id}.png. One excluded on purpose: the Gemini output
// included a "superkahraman-erkek-2" render that was an unmistakable
// Batman — recognizable IP, same reason an earlier Demon Slayer sheet was
// rejected for Rus Ruleti — so that file was left out of public/avatars/
// entirely (it's sitting unused in public/avatars/new-avatars/).
export const AVATAR_IMAGE_EXT = 'png'

export const AVATAR_OPTIONS = [
  { id: 'viking', label: 'Viking' },
  { id: 'angel', label: 'Melek' },
  { id: 'devil', label: 'Şeytan' },
  { id: 'princess', label: 'Prenses' },
  { id: 'wizard', label: 'Büyücü' },
  { id: 'elf', label: 'Elf' },
  { id: 'pirate', label: 'Korsan' },
  { id: 'knight', label: 'Şövalye' },
  { id: 'mermaid', label: 'Deniz Kızı' },
  { id: 'fairy', label: 'Peri' },
  { id: 'vampire', label: 'Vampir' },
  { id: 'werewolf', label: 'Kurtadam' },
  { id: 'ninja', label: 'Ninja' },
  { id: 'ninja-2', label: 'Ninja' },
  { id: 'kunoichi', label: 'Kadın Ninja' },
  { id: 'archer', label: 'Okçu' },
  { id: 'superhero', label: 'Süper Kahraman' },
  { id: 'superheroine', label: 'Süper Kahraman' },
  { id: 'superheroine-2', label: 'Süper Kahraman' },
]

const AVATAR_IDS = new Set(AVATAR_OPTIONS.map((option) => option.id))

export function isKnownAvatarId(avatarId) {
  return typeof avatarId === 'string' && AVATAR_IDS.has(avatarId)
}

export function avatarImageSrc(avatarId) {
  return `/avatars/${avatarId}.${AVATAR_IMAGE_EXT}`
}
