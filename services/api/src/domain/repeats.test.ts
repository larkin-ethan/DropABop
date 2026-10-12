import { describe, expect, it } from 'vitest';
import { alreadySharedMessage, shortDate, versionKey } from './repeats';

const key = (title: string, artist: string) => versionKey({ title, artist });

describe('versionKey (D35)', () => {
  it('ignores case, accents, spacing and punctuation', () => {
    expect(key('Jóga', 'Björk')).toBe(key('joga', 'bjork'));
    expect(key("Don't Stop  Me Now", 'Queen')).toBe(key('Dont Stop Me Now', 'QUEEN'));
  });

  it('ignores bracketed and dashed version notes', () => {
    const plainKey = key('Here Comes the Sun', 'The Beatles');
    expect(key('Here Comes the Sun (Remastered 2009)', 'The Beatles')).toBe(plainKey);
    expect(key('Here Comes the Sun [Live]', 'The Beatles')).toBe(plainKey);
    expect(key('Here Comes the Sun - Remastered 2009', 'The Beatles')).toBe(plainKey);
    expect(key('Here Comes the Sun – Live at the BBC', 'The Beatles')).toBe(plainKey);
  });

  it('ignores featured artists in the title and the artist', () => {
    const plainKey = key('Work', 'Rihanna');
    expect(key('Work (feat. Drake)', 'Rihanna')).toBe(plainKey);
    expect(key('Work ft. Drake', 'Rihanna')).toBe(plainKey);
    expect(key('Work', 'Rihanna feat. Drake')).toBe(plainKey);
    expect(key('Work', 'Rihanna featuring Drake')).toBe(plainKey);
    expect(key('Work', 'Rihanna & Drake')).toBe(plainKey);
  });

  it('keeps different songs and different artists apart', () => {
    expect(key('Work', 'Rihanna')).not.toBe(key('Work', 'Iggy Azalea'));
    expect(key('Work', 'Rihanna')).not.toBe(key('Needed Me', 'Rihanna'));
  });

  it('keeps letters from any alphabet', () => {
    expect(key('昼間から夜', 'mei ehara')).toBe('昼間から夜|mei ehara');
  });

  it('stays short enough for a DynamoDB sort key, cutting whole characters', () => {
    const long = key('𠀀'.repeat(400), 'Artist'); // 4 bytes each in UTF-8
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(900);
    expect(long).toBe('𠀀'.repeat(225));
  });

  it('is empty when nothing is left to compare', () => {
    expect(key('!!!', 'Someone')).toBe('');
    expect(key('Song', '...')).toBe('');
  });
});

describe('dates in the message', () => {
  it('leaves the year out for this year only', () => {
    expect(shortDate('2026-10-05', '2026-10-12')).toBe('Oct 5');
    expect(shortDate('2025-10-05', '2026-10-12')).toBe('Oct 5, 2025');
  });

  it('says the date and nothing about who', () => {
    expect(alreadySharedMessage('2026-10-05', '2026-10-12')).toBe(
      'That song was already shared in this party on Oct 5. Pick a different one.',
    );
  });
});
