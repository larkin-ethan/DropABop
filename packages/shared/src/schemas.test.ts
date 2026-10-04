import { describe, expect, it } from 'vitest';
import {
  avatarColorSchema,
  castVoteRequestSchema,
  createPartyRequestSchema,
  displayNameSchema,
  httpsUrlSchema,
  inviteCodeSchema,
  joinPartyRequestSchema,
  partyNameSchema,
  ratingSchema,
  resolveSongRequestSchema,
  songSchema,
  songSearchQuerySchema,
  submitRecommendationRequestSchema,
  timezoneSchema,
  updatePartySettingsRequestSchema,
  updateProfileRequestSchema,
} from './schemas';

/** First issue message, so tests can check the friendly wording users will see. */
function firstError(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}): string | undefined {
  return result.error?.issues[0]?.message;
}

describe('ratingSchema (spec §15, D7)', () => {
  it.each([1, 5, 10])('accepts %i', (rating) => {
    expect(ratingSchema.safeParse(rating).success).toBe(true);
  });

  it.each([0, 11, -1, 5.5, Number.NaN, '7', null])('rejects %s', (rating) => {
    const result = ratingSchema.safeParse(rating);
    expect(result.success).toBe(false);
    expect(firstError(result)).toBe('Ratings are whole numbers from 1 to 10.');
  });
});

describe('displayNameSchema', () => {
  it('trims surrounding whitespace', () => {
    expect(displayNameSchema.parse('  Ethan  ')).toBe('Ethan');
  });

  it('accepts exactly 40 characters', () => {
    expect(displayNameSchema.safeParse('a'.repeat(40)).success).toBe(true);
  });

  it('rejects 41 characters', () => {
    expect(displayNameSchema.safeParse('a'.repeat(41)).success).toBe(false);
  });

  it('rejects an empty or whitespace-only name with a friendly message', () => {
    const result = displayNameSchema.safeParse('   ');
    expect(result.success).toBe(false);
    expect(firstError(result)).toBe('Please enter a display name.');
  });
});

describe('partyNameSchema', () => {
  it('accepts up to 60 characters and rejects 61', () => {
    expect(partyNameSchema.safeParse('p'.repeat(60)).success).toBe(true);
    expect(partyNameSchema.safeParse('p'.repeat(61)).success).toBe(false);
  });

  it('rejects empty', () => {
    expect(partyNameSchema.safeParse('').success).toBe(false);
  });
});

describe('inviteCodeSchema (D16)', () => {
  it('accepts a valid code', () => {
    expect(inviteCodeSchema.parse('SONG-7K4P')).toBe('SONG-7K4P');
  });

  it('normalizes lowercase and surrounding spaces', () => {
    expect(inviteCodeSchema.parse('  song-7k4p ')).toBe('SONG-7K4P');
  });

  it.each([
    'SONG-7K4',
    'SONG-7K4PX',
    'SANG-7K4P',
    'SONG7K4P',
    'SONG-0K4P',
    'SONG-OK4P',
    'SONG-1K4P',
    'SONG-IK4P',
    'SONG-LK4P',
  ])('rejects %s (wrong shape or look-alike characters)', (code) => {
    expect(inviteCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe('timezoneSchema', () => {
  it.each(['America/Chicago', 'Europe/London', 'Asia/Kolkata', 'UTC'])('accepts %s', (tz) => {
    expect(timezoneSchema.safeParse(tz).success).toBe(true);
  });

  it.each(['Mars/Olympus', 'not a zone', ''])('rejects %s', (tz) => {
    expect(timezoneSchema.safeParse(tz).success).toBe(false);
  });
});

describe('avatarColorSchema', () => {
  it('accepts #RRGGBB', () => {
    expect(avatarColorSchema.safeParse('#3B82F6').success).toBe(true);
  });

  it.each(['3B82F6', '#3B82F', '#GGGGGG', 'blue'])('rejects %s', (color) => {
    expect(avatarColorSchema.safeParse(color).success).toBe(false);
  });
});

describe('httpsUrlSchema', () => {
  it('accepts https links', () => {
    expect(httpsUrlSchema.safeParse('https://open.example.com/track/123').success).toBe(true);
  });

  it.each(['http://example.com', 'javascript:alert(1)', 'ftp://example.com', 'not a url'])(
    'rejects %s',
    (url) => {
      expect(httpsUrlSchema.safeParse(url).success).toBe(false);
    },
  );
});

describe('songSchema', () => {
  const validSong = {
    songId: 'song_1',
    title: 'Midnight City',
    artist: 'M83',
    album: 'Hurry Up, We’re Dreaming',
    albumArtUrl: 'https://images.example.com/art.jpg',
    durationMs: 243000,
    releaseDate: '2011-10-18',
    providers: [
      { provider: 'spotify', providerSongId: 'abc123', externalUrl: 'https://open.example.com/abc123' },
    ],
  };

  it('accepts a complete song', () => {
    expect(songSchema.safeParse(validSong).success).toBe(true);
  });

  it('accepts unknown optional metadata as null', () => {
    const song = { ...validSong, album: null, albumArtUrl: null, durationMs: null, releaseDate: null };
    expect(songSchema.safeParse(song).success).toBe(true);
  });

  it('requires at least one provider link (spec §14: valid provider information)', () => {
    expect(songSchema.safeParse({ ...validSong, providers: [] }).success).toBe(false);
  });

  it('rejects an insecure provider link', () => {
    const providers = [
      { provider: 'spotify', providerSongId: 'abc', externalUrl: 'http://open.example.com/abc' },
    ];
    expect(songSchema.safeParse({ ...validSong, providers }).success).toBe(false);
  });

  it('rejects an unsupported provider', () => {
    const providers = [
      { provider: 'napster', providerSongId: 'abc', externalUrl: 'https://example.com/abc' },
    ];
    expect(songSchema.safeParse({ ...validSong, providers }).success).toBe(false);
  });
});

describe('request schemas reject client-supplied identity (spec §24)', () => {
  it.each([
    ['castVote', castVoteRequestSchema, { rating: 7, userId: 'someone-else' }],
    ['joinParty', joinPartyRequestSchema, { inviteCode: 'SONG-7K4P', userId: 'someone-else' }],
    [
      'submitRecommendation',
      submitRecommendationRequestSchema,
      { provider: 'spotify', providerSongId: 'x', userId: 'u' },
    ],
    ['createParty', createPartyRequestSchema, { name: 'P', timezone: 'UTC', hostUserId: 'someone-else' }],
    ['updateProfile', updateProfileRequestSchema, { displayName: 'Ethan', userId: 'someone-else' }],
    ['updatePartySettings', updatePartySettingsRequestSchema, { paused: true, hostUserId: 'someone-else' }],
  ])('%s rejects unknown keys', (_name, schema, body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });
});

describe('castVoteRequestSchema', () => {
  it('accepts a valid rating', () => {
    expect(castVoteRequestSchema.parse({ rating: 9 })).toEqual({ rating: 9 });
  });

  it('rejects a missing or out-of-range rating', () => {
    expect(castVoteRequestSchema.safeParse({}).success).toBe(false);
    expect(castVoteRequestSchema.safeParse({ rating: 11 }).success).toBe(false);
  });
});

describe('createPartyRequestSchema', () => {
  it('accepts name + timezone, with maxMembers optional', () => {
    expect(
      createPartyRequestSchema.safeParse({ name: 'Ethan’s Music Party', timezone: 'America/Chicago' })
        .success,
    ).toBe(true);
    expect(createPartyRequestSchema.safeParse({ name: 'P', timezone: 'UTC', maxMembers: 12 }).success).toBe(
      true,
    );
  });

  it.each([1, 51, 10.5])('rejects maxMembers %s (D14: 2–50)', (maxMembers) => {
    expect(createPartyRequestSchema.safeParse({ name: 'P', timezone: 'UTC', maxMembers }).success).toBe(
      false,
    );
  });

  it('rejects a missing timezone', () => {
    expect(createPartyRequestSchema.safeParse({ name: 'P' }).success).toBe(false);
  });
});

describe('updatePartySettingsRequestSchema', () => {
  it('accepts any single setting', () => {
    expect(updatePartySettingsRequestSchema.safeParse({ paused: true }).success).toBe(true);
    expect(updatePartySettingsRequestSchema.safeParse({ timezone: 'Europe/London' }).success).toBe(true);
    expect(updatePartySettingsRequestSchema.safeParse({ showWhoRatedWhat: true }).success).toBe(true);
  });

  it('rejects an empty update', () => {
    const result = updatePartySettingsRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(firstError(result)).toBe('Nothing to update.');
  });

  it('rejects invalid values', () => {
    expect(updatePartySettingsRequestSchema.safeParse({ maxMembers: 100 }).success).toBe(false);
    expect(updatePartySettingsRequestSchema.safeParse({ paused: 'yes' }).success).toBe(false);
  });
});

describe('updateProfileRequestSchema', () => {
  it('accepts a preferred provider or clearing it with null (D22)', () => {
    expect(updateProfileRequestSchema.safeParse({ preferredProvider: 'appleMusic' }).success).toBe(true);
    expect(updateProfileRequestSchema.safeParse({ preferredProvider: null }).success).toBe(true);
  });

  it('rejects an empty update', () => {
    expect(updateProfileRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('submitRecommendationRequestSchema (ADR-0007)', () => {
  it('accepts an Apple Music / iTunes track id, with optional pasted links', () => {
    expect(
      submitRecommendationRequestSchema.safeParse({ provider: 'appleMusic', providerSongId: '828259377' })
        .success,
    ).toBe(true);
    const withLinks = {
      provider: 'appleMusic',
      providerSongId: '828259377',
      links: {
        spotify: 'https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt',
        youtube: 'https://youtu.be/dX3k_QDnzHE',
      },
    };
    expect(submitRecommendationRequestSchema.safeParse(withLinks).success).toBe(true);
  });

  it('rejects other providers as the main song source (search is iTunes in v1)', () => {
    expect(
      submitRecommendationRequestSchema.safeParse({ provider: 'spotify', providerSongId: '123' }).success,
    ).toBe(false);
  });

  it('rejects client-sent song metadata or dates (server looks these up itself)', () => {
    const body = {
      provider: 'appleMusic',
      providerSongId: '1',
      title: 'Fake title',
      submittedOn: '2026-10-05',
    };
    expect(submitRecommendationRequestSchema.safeParse(body).success).toBe(false);
  });

  it('rejects empty or non-numeric ids and bad pasted links', () => {
    expect(
      submitRecommendationRequestSchema.safeParse({ provider: 'appleMusic', providerSongId: '  ' }).success,
    ).toBe(false);
    expect(
      submitRecommendationRequestSchema.safeParse({ provider: 'appleMusic', providerSongId: 'abc' }).success,
    ).toBe(false);
    const badLink = {
      provider: 'appleMusic',
      providerSongId: '1',
      links: { spotify: 'https://evil.example.com/track/x' },
    };
    const result = submitRecommendationRequestSchema.safeParse(badLink);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('That doesn’t look like a Spotify song link.');
  });
});

describe('songSearchQuerySchema', () => {
  it('accepts a query and trims it', () => {
    expect(songSearchQuerySchema.parse({ q: '  midnight city ' })).toEqual({ q: 'midnight city' });
  });

  it('rejects empty and over-long queries', () => {
    expect(songSearchQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(songSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(songSearchQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('resolveSongRequestSchema (D21)', () => {
  it('accepts Apple Music song links and rejects everything else', () => {
    expect(
      resolveSongRequestSchema.safeParse({
        url: 'https://music.apple.com/us/album/midnight-city/828259375?i=828259377',
      }).success,
    ).toBe(true);
    expect(resolveSongRequestSchema.safeParse({ url: 'https://music.example.com/song/1' }).success).toBe(
      false,
    );
    expect(resolveSongRequestSchema.safeParse({ url: 'http://music.apple.com/us/song/x/1' }).success).toBe(
      false,
    );
  });
});
