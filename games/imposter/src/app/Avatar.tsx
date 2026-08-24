interface AvatarProps {
  avatarIndex: number;
  name: string;
  active?: boolean;
  compact?: boolean;
}

const avatarImages = [
  '/assets/characters/character-01-explorer.png',
  '/assets/characters/character-02-lion.png',
  '/assets/characters/character-03-princess-v3.png',
  '/assets/characters/character-04-wizard-v3.png',
  '/assets/characters/character-05-dreamer.png',
  '/assets/characters/character-06-fox.png',
  '/assets/characters/character-07-fairy.png',
  '/assets/characters/character-08-elf.png',
  '/assets/characters/character-09-pirate.png',
  '/assets/characters/character-10-prince.png',
] as const;

export function CharacterPortrait({ avatarIndex, name }: Pick<AvatarProps, 'avatarIndex' | 'name'>) {
  const safeIndex = ((avatarIndex % avatarImages.length) + avatarImages.length) % avatarImages.length;

  return (
    <div className={`character-portrait character-portrait-${safeIndex + 1}`} role="img" aria-label={`${name} avatarı`}>
      <img src={avatarImages[safeIndex]} alt="" />
    </div>
  );
}

export function Avatar({ avatarIndex, name, active = false, compact = false }: AvatarProps) {
  return (
    <div className={`avatar ${active ? 'is-active' : ''} ${compact ? 'is-compact' : ''}`}>
      <CharacterPortrait avatarIndex={avatarIndex} name={name} />
      <span>{name}</span>
    </div>
  );
}
