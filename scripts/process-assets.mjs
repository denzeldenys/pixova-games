// Converts the raw Magnific downloads in asset-src/raw into optimised, committed app assets.
// Run with: node scripts/process-assets.mjs
import sharp from 'sharp';
import { copyFileSync, mkdirSync } from 'node:fs';

const RAW = 'asset-src/raw';
const NAVY = '#16122e';
const out = (p) => { mkdirSync(p.split('/').slice(0, -1).join('/'), { recursive: true }); return p; };

// Shared avatars / pieces (8 colours), trimmed and sized for phones
const colours = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
for (const c of colours) {
  await sharp(`${RAW}/piece-${c}.png`).trim().resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 82, alphaQuality: 90 }).toFile(out(`src/assets/avatars/${c}.webp`));
}
// Logo (transparent) for in-app branding
await sharp(`${RAW}/logo-cutout.png`).trim().resize(320, 320, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 85 }).toFile(out('src/assets/logo.webp'));

// Clash Race game assets live in the game's own folder
await sharp(`${RAW}/cover.png`).resize(640, 360, { fit: 'cover' }).webp({ quality: 78 }).toFile(out('src/games/clash-race/assets/cover.webp'));
await sharp(`${RAW}/track-bg.png`).resize(720, 1280, { fit: 'cover' }).webp({ quality: 70 }).toFile(out('src/games/clash-race/assets/track-bg.webp'));

// PWA icons from the logo on its dark background
const logoTrim = await sharp(`${RAW}/logo-cutout.png`).trim().toBuffer();
async function icon(size, pad, file) {
  const inner = Math.round(size * (1 - pad * 2));
  const fg = await sharp(logoTrim).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: fg, gravity: 'center' }]).png({ compressionLevel: 9 }).toFile(out(file));
}
await icon(192, 0.08, 'public/icons/icon-192.png');
await icon(512, 0.08, 'public/icons/icon-512.png');
await icon(512, 0.2, 'public/icons/maskable-512.png'); // safe zone: logo inside the central 60%
await icon(192, 0.2, 'public/icons/maskable-192.png');
await icon(180, 0.1, 'public/icons/apple-touch-icon.png');
await icon(64, 0.04, 'public/favicon.png');

// Audio: already compressed MP3 from Magnific (SFX ~17-49 KB, music < 800 KB)
const shared = { 'sfx-tap.mp3': 'src/assets/audio/tap.mp3', 'music-lobby.mp3': 'src/assets/audio/lobby.mp3' };
const game = ['lockin', 'tick', 'reveal', 'move', 'clash', 'knockback', 'checkpoint', 'win', 'lose'];
for (const [k, v] of Object.entries(shared)) copyFileSync(`${RAW}/${k}`, out(v));
for (const g of game) copyFileSync(`${RAW}/sfx-${g}.mp3`, out(`src/games/clash-race/assets/${g}.mp3`));
copyFileSync(`${RAW}/music-game.mp3`, out('src/games/clash-race/assets/music.mp3'));
console.log('assets done');
