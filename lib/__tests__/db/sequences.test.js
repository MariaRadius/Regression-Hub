import { describe, expect, it } from 'vitest';
import { formatTestKey, mintTestKey } from '../../db/sequences.js';

function makeDb() {
  const store = new Map();
  return {
    collection: () => ({
      findOneAndUpdate: async (filter, update) => {
        const id = filter._id;
        const cur = store.get(id)?.nextSerial ?? 0;
        const next = cur + update.$inc.nextSerial;
        store.set(id, { nextSerial: next });
        return { nextSerial: next };
      },
    }),
  };
}

describe('formatTestKey', () => {
  it('pads serial to 4 digits', () => {
    expect(formatTestKey('SAP', 1)).toBe('SAP-0001');
    expect(formatTestKey('SAP', 42)).toBe('SAP-0042');
    expect(formatTestKey('SAP', 1000)).toBe('SAP-1000');
  });
  it('throws when initial is falsy', () => {
    expect(() => formatTestKey('', 1)).toThrow('application initial');
  });
});

describe('mintTestKey', () => {
  it('returns APP-0001 on first call', async () => {
    expect(await mintTestKey(makeDb(), 'app-1', 'APP')).toBe('APP-0001');
  });
  it('increments on successive calls to the same app', async () => {
    const db = makeDb();
    await mintTestKey(db, 'app-1', 'APP');
    expect(await mintTestKey(db, 'app-1', 'APP')).toBe('APP-0002');
  });
  it('sequences are independent per applicationId', async () => {
    const db = makeDb();
    expect(await mintTestKey(db, 'app-1', 'AAA')).toBe('AAA-0001');
    expect(await mintTestKey(db, 'app-2', 'BBB')).toBe('BBB-0001');
  });
  it('throws when initial is falsy', async () => {
    await expect(mintTestKey(makeDb(), 'app-1', '')).rejects.toThrow(
      'application initial',
    );
  });
});
