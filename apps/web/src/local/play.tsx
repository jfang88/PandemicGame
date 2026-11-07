import { useEffect, useRef, useState } from 'react';
import { COLORS, type Role } from '../../../../packages/engine/src/types';
import type { ActionCommand } from '../../../../packages/engine/src/actions';
import { Board, locations } from './board';
import type { GameView } from './transport';

const roleHelp: Record<Role, string> = {
  medic: 'Treat removes all cubes of the chosen disease at your location.',
  scientist: 'Discover a cure with four matching cards.',
  builder: 'Build a research center without discarding a location card.',
  courier: 'Give any location card to a player at your location.',
};

const actions = {
  MOVE: ['Move', 'Travel to an adjacent location.'],
  DIRECT_FLIGHT: ['Direct flight', 'Discard the destination card.'],
  CHARTER_FLIGHT: ['Charter flight', 'Discard the card for your current location.'],
  SHUTTLE: ['Shuttle', 'Travel between research centers.'],
  TREAT: ['Treat disease', 'Remove one cube, or all cubes of that disease if cured or playing Medic.'],
  BUILD_CENTER: ['Build center', 'Discard the current location card unless playing Builder.'],
  GIVE_CARD: ['Give card', 'Give a location card to a player at your location.'],
  DISCOVER_CURE: ['Discover cure', 'At a research center, discard the matching cards shown.'],
  PASS: ['Pass', 'Spend one action without moving or using cards.'],
  DISCARD: ['Discard', 'Return to seven cards without spending an action.'],
} as const;

export function playerName(seat: number) {
  return `Player ${seat + 1}`;
}

function cardLabel(card: string) {
  return locations.get(card.slice(2))!.name;
}

function choiceLabel(command: ActionCommand, game: GameView) {
  switch (command.type) {
    case 'MOVE': case 'DIRECT_FLIGHT': case 'CHARTER_FLIGHT': case 'SHUTTLE':
      return locations.get(command.payload.destination)!.name;
    case 'TREAT':
      return command.payload.color;
    case 'GIVE_CARD':
      return `${cardLabel(command.payload.cardId)} to ${playerName(game.players.find(player => player.userId === command.payload.recipientUserId)!.seat)}`;
    case 'DISCOVER_CURE':
      return `${command.payload.color} · ${command.payload.cardIds.map(cardLabel).join(', ')}`;
    case 'DISCARD':
      return command.payload.cardIds.map(cardLabel).join(', ');
    case 'PASS': case 'BUILD_CENTER':
      return actions[command.type][0];
  }
}

function ActionControls({ game, choices, submit }: {
  game: GameView;
  choices: readonly ActionCommand[];
  submit(command: ActionCommand): void;
}) {
  const [selectedType, setSelectedType] = useState<ActionCommand['type']>('MOVE');
  const [selectedChoice, setSelectedChoice] = useState('');
  const actionSelect = useRef<HTMLSelectElement>(null);
  const types = Object.keys(actions).filter(type => choices.some(choice => choice.type === type)) as ActionCommand['type'][];
  const type = types.includes(selectedType) ? selectedType : types[0];
  useEffect(() => {
    if (type && type !== selectedType) actionSelect.current?.focus();
  }, [selectedType, type]);

  if (!type) return null;

  const options = choices.filter(choice => choice.type === type);
  const labels = options.map(choice => choiceLabel(choice, game));
  const index = Math.max(0, labels.indexOf(selectedChoice));

  return <div className="action-controls">
    <label className="field">Action
      <select ref={actionSelect} value={type} onChange={event => {
        setSelectedType(event.target.value as ActionCommand['type']);
        setSelectedChoice('');
      }}>
        {types.map(type => <option key={type} value={type}>{actions[type][0]}</option>)}
      </select>
    </label>
    <p>{actions[type][1]} Every listed action costs one action.</p>
    {type !== 'PASS' && type !== 'BUILD_CENTER' && <label className="field">Choice
      <select value={labels[index]} onChange={event => setSelectedChoice(event.target.value)}>
        {labels.map(label => <option key={label}>{label}</option>)}
      </select>
    </label>}
    <button type="button" onClick={() => submit(options[index]!)}>{actions[type][0]}</button>
  </div>;
}

function DiscardDialog({ game, choices, submit }: {
  game: GameView;
  choices: readonly ActionCommand[];
  submit(command: ActionCommand): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const element = dialog.current!;
    if (!element.contains(document.activeElement)) element.querySelector('button')?.focus();
  }, [choices]);

  const owner = game.players.find(player => player.userId === game.discardOwner)!;

  return <dialog ref={dialog} aria-labelledby="discard-heading" onCancel={event => event.preventDefault()}>
    <h2 id="discard-heading">{playerName(owner.seat)} must discard</h2>
    <p>Choose a discard that leaves exactly seven cards. Play resumes automatically.</p>
    <div className="discard-options">
      {choices.map(choice => {
        const label = `Discard ${choiceLabel(choice, game)}`;
        return <button key={label} type="button" onClick={() => submit(choice)}>{label}</button>;
      })}
    </div>
  </dialog>;
}

function lossMessage(outcome: Extract<NonNullable<GameView['outcome']>, { kind: 'lost' }>) {
  switch (outcome.reason) {
    case 'PLAYER_DECK_EMPTY': return 'The player deck ran out during a required draw.';
    case 'OUTBREAK_LIMIT': return 'The eighth outbreak overwhelmed containment.';
    case 'CUBE_SUPPLY_EXHAUSTED': return `The ${outcome.color} cube supply ran out at ${outcome.locationId}.`;
  }
}

export function GameScreen({ game, choices, error, submit, onRestart }: {
  game: GameView;
  choices: readonly ActionCommand[];
  error: string;
  submit(command: ActionCommand): void;
  onRestart(): void;
}) {
  const status = useRef<HTMLHeadingElement>(null);
  const active = game.players.find(player => player.seat === game.activeSeat)!;

  useEffect(() => {
    if (game.phase !== 'DISCARD_REQUIRED') status.current?.focus();
  }, [game.phase, game.activeSeat]);

  return <main className="play-shell">
    <header className="game-heading">
      <div><p className="eyebrow">LOCAL HOT-SEAT GAME</p><h1>PandemicGame</h1></div>
      {game.outcome && <button type="button" onClick={onRestart}>New local game</button>}
    </header>
    <section className="status-banner" aria-labelledby="status-heading">
      <h2 id="status-heading" tabIndex={-1} ref={status}>
        {game.outcome ? game.outcome.kind === 'won' ? 'Containment achieved' : 'Containment failed'
          : game.phase === 'DISCARD_REQUIRED' ? 'Play paused for discard' : `${playerName(active.seat)}’s turn`}
      </h2>
      <p role="status">{game.outcome
        ? game.outcome.kind === 'won' ? 'All four diseases are cured.' : lossMessage(game.outcome)
        : game.phase === 'DISCARD_REQUIRED' ? `${playerName(active.seat)} is the active player.`
          : `Actions phase · ${game.actionsRemaining} ${game.actionsRemaining === 1 ? 'action' : 'actions'} left`}
      </p>
    </section>
    <div className="play-grid">
      <Board game={game} />
      <aside aria-label="Turn and threat controls">
        {game.phase === 'ACTIONS' && <section aria-labelledby="actions-heading">
          <h2 id="actions-heading">Legal actions</h2>
          <ActionControls key={game.activeSeat} game={game} choices={choices} submit={submit} />
        </section>}
        {error && <p role="alert">{error}</p>}
        <section aria-labelledby="threat-heading">
          <h2 id="threat-heading">Threat tracker</h2>
          <dl className="stats">
            <div><dt>Outbreaks</dt><dd>{game.outbreakCount} / 8</dd></div>
            <div><dt>Infection rate</dt><dd>{[2, 2, 2, 3, 3, 4, 4][game.rateIndex]} / turn</dd></div>
            <div><dt>Player cards</dt><dd>{game.playerCardsRemaining}</dd></div>
            <div><dt>Infection cards</dt><dd>{game.infectionCardsRemaining}</dd></div>
            <div><dt>Research centers</dt><dd>{game.centers.length} / 6</dd></div>
          </dl>
          <ul className="supply">{COLORS.map(color => <li key={color}>
            <span className={`swatch home-${color}`} aria-hidden="true" />{color} · {game.supply[color]} cubes
            {game.cured[color] ? ' · cured' : ' · uncured'}
          </li>)}</ul>
        </section>
      </aside>
    </div>
    <section aria-labelledby="hands-heading">
      <h2 id="hands-heading">Player roles and hands</h2>
      <div className="player-grid">
        {game.players.map(player => <article key={player.userId} className="player-panel" aria-label={playerName(player.seat)}>
          <h3>{playerName(player.seat)} · <span className="role">{player.role}</span></h3>
          <p>{locations.get(player.locationId)!.name} · {player.hand.length} / 7 cards</p>
          <p>{roleHelp[player.role]}</p>
          {player.hand.length > 0 && <ul className="cards" aria-label={`${playerName(player.seat)} cards`}>
            {player.hand.map(card => <li key={card}>{cardLabel(card)}</li>)}
          </ul>}
        </article>)}
      </div>
    </section>
    {game.discardOwner && <DiscardDialog key={game.discardOwner} game={game} choices={choices} submit={submit} />}
  </main>;
}
