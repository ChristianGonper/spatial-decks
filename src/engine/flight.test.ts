import assert from 'node:assert/strict';
import { it } from 'node:test';
import { cameraOnFlight, commonGroup, flightCameras } from './flight.ts';
import type { DeckIR, FrameIR, Rect } from './types.ts';

const frame = (id: string, children: string[] = []): FrameIR => ({ id, children, layout: 'hub', raw: { id }, markdown: '' });
const ir: Pick<DeckIR, 'root' | 'frames'> = {
  root: 'root', frames: { root: frame('root', ['a', 'b']), a: frame('a', ['nested']), nested: frame('nested'), b: frame('b') },
};
const rect = (x: number, width = 100): Rect => ({ x, y: 0, width, height: 100 });
const cards = { root: rect(100), a: rect(0), nested: rect(10), b: rect(400) };
const groups = { root: rect(0, 500), a: rect(0, 150), nested: rect(10), b: rect(400) };

it('vuelo entre ramas usa el ancestro común y reserva medio tiempo para cada tramo', () => {
  assert.equal(commonGroup(ir, 'nested', 'b'), 'root');
  assert.equal(commonGroup(ir, 'nested', 'a'), 'a');
  const cameras = flightCameras(ir, cards, groups, 'nested', { id: 'b', transition: 'via-group' }, { width: 1000, height: 800 });
  assert.equal(cameras.length, 3);
  assert.deepEqual(cameraOnFlight(cameras, 0.5), cameras[1]);
  assert.deepEqual(cameraOnFlight(cameras, 1), cameras[2]);
  assert.equal(flightCameras(ir, cards, groups, 'nested', { id: 'b' }, { width: 1000, height: 800 }).length, 2);
});
