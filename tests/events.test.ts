import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/events';

describe('EventBus', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off = bus.on('zone:entered', (e) => seen.push(e.zone));
    bus.emit('zone:entered', { zone: 'forest' });
    off();
    bus.emit('zone:entered', { zone: 'canyon' });
    expect(seen).toEqual(['forest']);
  });

  it('lets a handler unsubscribe itself during emit', () => {
    const bus = new EventBus();
    let calls = 0;
    const off = bus.on('player:dodged', () => {
      calls++;
      off();
    });
    bus.on('player:dodged', () => calls++);
    bus.emit('player:dodged', { at: { x: 0, y: 0 } });
    bus.emit('player:dodged', { at: { x: 0, y: 0 } });
    expect(calls).toBe(3);
  });
});
