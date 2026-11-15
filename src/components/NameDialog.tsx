import { useState } from 'react';
import type { Profile } from '../core/profile';
import { PALETTE } from '../core/palette';

export default function NameDialog({ initial, onSave, onCancel }: {
  initial: Profile | null;
  onSave: (name: string, color: number) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? Math.floor(Math.random() * PALETTE.length));
  const ok = name.trim().length > 0;
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => { e.preventDefault(); if (ok) onSave(name, color); }}
      >
        <img className="modal-avatar bob" src={PALETTE[color].avatar} alt="" />
        <h2>{initial ? 'Edit profile' : 'What should we call you?'}</h2>
        <input
          className="input"
          autoFocus
          maxLength={16}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Display name"
        />
        <div className="color-row" role="radiogroup" aria-label="Avatar colour">
          {PALETTE.map((p, i) => (
            <button
              type="button"
              key={p.name}
              className={`color-dot ${i === color ? 'on' : ''}`}
              style={{ background: p.hex }}
              aria-label={p.name}
              aria-checked={i === color}
              role="radio"
              onClick={() => setColor(i)}
            />
          ))}
        </div>
        <button className="btn btn-primary btn-block" disabled={!ok}>Let's play!</button>
        {onCancel && <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>}
      </form>
    </div>
  );
}
