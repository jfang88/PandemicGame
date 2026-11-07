import { useEffect, useRef, useState } from 'react';
import { ROLES, type Role } from '../../../../packages/engine/src/types';
import type { ActionCommand } from '../../../../packages/engine/src/actions';
import { GameScreen, playerName } from './play';
import { startLocalGame, type LocalGameTransport } from './transport';

export function LocalGame({ transport, onRestart }: { transport: LocalGameTransport; onRestart(): void }) {
  const [{ game, choices }, setView] = useState(() => transport.read());
  const [error, setError] = useState('');

  function submit(command: ActionCommand) {
    const result = transport.submit(command);
    if (!result.ok) {
      setError(`The action was rejected (${result.error}). Choose another action.`);
      return;
    }
    setError('');
    setView(transport.read());
  }

  return <GameScreen game={game} choices={choices} error={error} submit={submit} onRestart={onRestart} />;
}

export function LocalPlay() {
  const [roles, setRoles] = useState<readonly Role[]>(ROLES);
  const [count, setCount] = useState(2);
  const [transport, setTransport] = useState<LocalGameTransport | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (transport === null) heading.current?.focus();
  }, [transport]);

  if (transport) return <LocalGame transport={transport} onRestart={() => setTransport(null)} />;
  const selectedRoles = roles.slice(0, count);
  const unique = new Set(selectedRoles).size === count;
  return <main className="setup-shell">
    <p className="eyebrow">PANDEMICGAME · LOCAL PLAY</p>
    <h1 ref={heading} tabIndex={-1}>Start a local game</h1>
    <p>Share one screen and take turns containing four diseases. All player hands are visible.</p>
    <form onSubmit={event => {
      event.preventDefault();
      if (unique) setTransport(startLocalGame(selectedRoles));
    }}>
      <label className="field">Players
        <select value={count} onChange={event => setCount(Number(event.target.value))}>
          {[2, 3, 4].map(count => <option key={count}>{count}</option>)}
        </select>
      </label>
      {selectedRoles.map((role, seat) => <label className="field" key={seat}>{playerName(seat)} role
        <select value={role} onChange={event => setRoles(roles.map((role, index) =>
          seat === index ? event.target.value as Role : role))}>
          {ROLES.map(role => <option key={role}>{role}</option>)}
        </select>
      </label>)}
      {!unique && <p role="status">Choose a different role for each player.</p>}
      <button type="submit" disabled={!unique}>Start game</button>
    </form>
  </main>;
}
