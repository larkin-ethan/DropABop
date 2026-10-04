import { describe, expect, it } from 'vitest';
import { keys, parseRoundId, prefixes } from './keys';

const ID = '5f0c9a3e-1b2d-4c5e-8f9a-0b1c2d3e4f5a';
const WEEK = '2026-10-05';
const UNSAFE_IDS = ['', 'a#b', 'a.b', 'a/b', 'a b', 'PARTY#x', 'x'.repeat(65), 'ä'];
const UNSAFE_DATES = ['', '2026-10-5', '2026/10/05', '2026-10-05#x', 'yesterday'];

describe('keys (docs/DATABASE.md)', () => {
  it('builds the documented keys', () => {
    expect(keys.userProfile(ID)).toEqual({ PK: `USER#${ID}`, SK: 'PROFILE' });
    expect(keys.userParty(ID, ID)).toEqual({ PK: `USER#${ID}`, SK: `PARTY#${ID}` });
    expect(keys.partyMeta(ID)).toEqual({ PK: `PARTY#${ID}`, SK: 'META' });
    expect(keys.member(ID, ID)).toEqual({ PK: `PARTY#${ID}`, SK: `MEMBER#${ID}` });
    expect(keys.round(ID, WEEK)).toEqual({ PK: `PARTY#${ID}`, SK: `ROUND#${WEEK}` });
    expect(keys.recommendation(ID, WEEK, ID)).toEqual({ PK: `PARTY#${ID}`, SK: `REC#${WEEK}#${ID}` });
    expect(keys.submittedMarker(ID, WEEK, ID, '2026-10-07')).toEqual({
      PK: `PARTY#${ID}`,
      SK: `SUBMITTED#${WEEK}#${ID}#2026-10-07`,
    });
    expect(keys.vote(ID, WEEK, ID, ID)).toEqual({ PK: `PARTY#${ID}`, SK: `VOTE#${WEEK}#${ID}#${ID}` });
    expect(keys.invite('SONG-7K4P')).toEqual({ PK: 'INVITE#SONG-7K4P', SK: 'INVITE' });
  });

  it.each(UNSAFE_IDS)('every id-taking builder rejects %j', (bad) => {
    expect(() => keys.userProfile(bad)).toThrow();
    expect(() => keys.userParty(bad, ID)).toThrow();
    expect(() => keys.userParty(ID, bad)).toThrow();
    expect(() => keys.partyMeta(bad)).toThrow();
    expect(() => keys.member(bad, ID)).toThrow();
    expect(() => keys.member(ID, bad)).toThrow();
    expect(() => keys.round(bad, WEEK)).toThrow();
    expect(() => keys.recommendation(ID, WEEK, bad)).toThrow();
    expect(() => keys.submittedMarker(ID, WEEK, bad, WEEK)).toThrow();
    expect(() => keys.vote(ID, WEEK, bad, ID)).toThrow();
    expect(() => keys.vote(ID, WEEK, ID, bad)).toThrow();
    expect(() => prefixes.mySubmissions(WEEK, bad)).toThrow();
    expect(() => prefixes.myWeekVotes(WEEK, bad)).toThrow();
  });

  it.each(UNSAFE_DATES)('every date-taking builder rejects %j', (bad) => {
    expect(() => keys.round(ID, bad)).toThrow();
    expect(() => keys.recommendation(ID, bad, ID)).toThrow();
    expect(() => keys.submittedMarker(ID, WEEK, ID, bad)).toThrow();
    expect(() => prefixes.weekRecommendations(bad)).toThrow();
    expect(() => prefixes.weekVotes(bad)).toThrow();
  });

  it('invite keys accept only valid codes, without look-alike characters (D16)', () => {
    for (const bad of [
      'SONG-0K4P',
      'SONG-OK4P',
      'SONG-1K4P',
      'SONG-IK4P',
      'SONG-LK4P',
      'song-7k4p',
      'SONG-7K4P#x',
    ]) {
      expect(() => keys.invite(bad)).toThrow();
    }
  });

  it('prefixes end with "#" so one id can never match another that starts the same way', () => {
    expect(prefixes.myWeekVotes(WEEK, 'abc')).toBe(`VOTE#${WEEK}#abc#`);
    expect(prefixes.mySubmissions(WEEK, 'abc')).toBe(`SUBMITTED#${WEEK}#abc#`);
  });
});

describe('parseRoundId', () => {
  it('splits a valid round id', () => {
    expect(parseRoundId(`${ID}.${WEEK}`)).toEqual({ partyId: ID, weekStart: WEEK });
  });

  it.each(['', ID, WEEK, `${ID}.${WEEK}.x`, `a#b.${WEEK}`, `${ID}.2026-10-5`, `.${WEEK}`])(
    'rejects %j',
    (bad) => {
      expect(parseRoundId(bad)).toBeNull();
    },
  );
});
