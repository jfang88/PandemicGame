import { useState } from 'react';
import { COLORS, type Color } from '../../../../packages/engine/src/types';
import board from '../../../../spec/board.v1.json';
import type { GameView } from './transport';

export const locations = new Map(board.locations.map(location => [location.id, location]));
const edges = board.locations.flatMap(from => from.neighbors.filter(id => id > from.id)
  .map(id => [from, locations.get(id)!] as const));
const symbols: Record<Color, string> = { blue: 'B', yellow: 'Y', red: 'R', black: 'K' };

export function Board({ game }: { game: GameView }) {
  const [selected, setSelected] = useState(board.startLocation);
  const location = locations.get(selected)!;
  const occupants = game.players.filter(player => player.locationId === selected);

  return <section className="board-panel" aria-labelledby="board-heading">
    <h2 id="board-heading">Containment grid</h2>
    <p className="legend">B Blue · Y Yellow · R Red · K Black · + Center · P Player</p>
    <div className="board-scroll">
      <svg viewBox={`20 15 ${board.width - 40} ${board.height - 55}`}
        role="img" aria-labelledby="grid-title" aria-describedby="grid-description" className="game-board">
        <title id="grid-title">48-location containment grid</title>
        <desc id="grid-description">An orthogonal grid showing centers, player positions and disease cube counts. Use Inspect location for full text details.</desc>
        {edges.map(([from, to]) => <line key={`${from.id}-${to.id}`}
          x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="grid-link" />)}
        {board.locations.map(({ id, x, y, color }) => {
          const pawns = game.players.filter(player => player.locationId === id);
          const threat = COLORS.filter(color => game.cubes[id]![color] > 0)
            .map(color => `${symbols[color]}${game.cubes[id]![color]}`).join(' ');
          return <g key={id} transform={`translate(${x} ${y})`} onClick={() => setSelected(id)}
            className={`map-location ${selected === id ? 'selected' : ''}`}>
            <rect x="-43" y="-31" width="86" height="62" rx="8" className={`home-${color}`} />
            <text y="-11">{id}{game.centers.includes(id) && ' +'}</text>
            <text y="7" className="threat-count">{threat}</text>
            <text y="24" className="pawn-count">{pawns.length > 0 && `P${pawns.map(player => player.seat + 1).join('·')}`}</text>
          </g>;
        })}
      </svg>
    </div>
    <label className="field">Inspect location
      <select value={selected} onChange={event => setSelected(event.target.value)}>
        {board.locations.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
    <p className="location-details" aria-live="polite">
      {location.name} · {game.centers.includes(selected) ? 'Research center' : 'No research center'} ·
      {' '}{occupants.length ? occupants.map(player => `Player ${player.seat + 1}`).join(', ') : 'No players'} ·
      {' '}{COLORS.map(color => `${game.cubes[selected]![color]} ${color}`).join(', ')} cubes
    </p>
  </section>;
}
