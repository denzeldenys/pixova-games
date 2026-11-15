import red from '../assets/avatars/red.webp';
import orange from '../assets/avatars/orange.webp';
import yellow from '../assets/avatars/yellow.webp';
import green from '../assets/avatars/green.webp';
import cyan from '../assets/avatars/cyan.webp';
import blue from '../assets/avatars/blue.webp';
import purple from '../assets/avatars/purple.webp';
import pink from '../assets/avatars/pink.webp';

/** The 8 shared player colours. Index = Player.color. Games may use these for their pieces. */
export const PALETTE = [
  { name: 'Red', hex: '#ff4d5e', avatar: red },
  { name: 'Orange', hex: '#ff9f1c', avatar: orange },
  { name: 'Yellow', hex: '#ffd60a', avatar: yellow },
  { name: 'Green', hex: '#7ae582', avatar: green },
  { name: 'Cyan', hex: '#22d3ee', avatar: cyan },
  { name: 'Blue', hex: '#4361ee', avatar: blue },
  { name: 'Purple', hex: '#b15cff', avatar: purple },
  { name: 'Pink', hex: '#ff5dc8', avatar: pink },
] as const;

export const colorOf = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
