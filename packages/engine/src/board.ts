import canonical from '../../../spec/board.v1.json';
import { BOARD_VERSION, COLORS, type Board, type BoardLocation, type Color } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireBoard(condition: unknown): asserts condition {
  if (!condition) throw new TypeError('Invalid grid48-v1 board');
}
/** Validate untrusted board data and return an owned copy in canonical ID order. */
export function loadBoard(input: unknown = canonical): Board {
  requireBoard(isRecord(input));
  requireBoard(input.boardVersion === BOARD_VERSION && input.startLocation === 'A01');
  requireBoard(input.width === canonical.width && input.height === canonical.height);
  requireBoard(Array.isArray(input.locations) && input.locations.length === 48);
  const locations: BoardLocation[] = input.locations.map((raw: unknown) => {
    requireBoard(isRecord(raw));
    const expected = canonical.locations.find(location => location.id === raw.id);
    requireBoard(expected && raw.name === expected.name && raw.color === expected.color);
    requireBoard(raw.x === expected.x && raw.y === expected.y);
    requireBoard(Array.isArray(raw.neighbors) && raw.neighbors.every(id => typeof id === 'string'));
    const neighbors = [...raw.neighbors].sort() as string[];
    requireBoard(JSON.stringify(neighbors) === JSON.stringify(expected.neighbors));
    return { id: expected.id, name: expected.name, color: expected.color as Color,
      x: expected.x, y: expected.y, neighbors };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  requireBoard(new Set(locations.map(location => location.id)).size === 48);
  for (const color of COLORS) requireBoard(locations.filter(location => location.color === color).length === 12);
  return { boardVersion: BOARD_VERSION, startLocation: 'A01', width: canonical.width,
    height: canonical.height, locations };
}
