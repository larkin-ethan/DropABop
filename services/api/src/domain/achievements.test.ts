import type { Recommendation, Round, RoundStatus, Vote, Weekday } from '@dropabop/shared';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, computeAchievements, dayIn, forOtherMember, newlyUnlocked } from './achievements';
import { addDays, dateOfWeekday } from './history';

const ME = 'me';
const OTHERS = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];

let counter = 0;

/** A party history built week by week. */
class World {
  rounds: { round: Round; status: RoundStatus }[] = [];
  recs: Recommendation[] = [];
  votes: Vote[] = [];
  private weekStart = '2026-01-05';

  week(status: RoundStatus = 'CLOSED'): Round {
    const round: Round = {
      roundId: `p1.${this.weekStart}`,
      partyId: 'p1',
      weekStart: this.weekStart,
      timezone: 'UTC',
      startsAt: `${this.weekStart}T00:00:00.000Z`,
      endsAt: `${addDays(this.weekStart, 7)}T00:00:00.000Z`,
      status: 'OPEN',
    };
    this.rounds.push({ round, status });
    this.weekStart = addDays(this.weekStart, 7);
    return round;
  }

  song(
    round: Round,
    userId: string,
    opts: { day?: Weekday; artist?: string; genre?: string } = {},
  ): Recommendation {
    counter += 1;
    const day = opts.day ?? 'MON';
    const rec: Recommendation = {
      recommendationId: `r${counter}`,
      roundId: round.roundId,
      partyId: 'p1',
      userId,
      submittedOn: dateOfWeekday(round.weekStart, day),
      weekday: day,
      song: {
        songId: `s${counter}`,
        title: `Song ${counter}`,
        artist: opts.artist ?? `Artist ${counter}`,
        album: null,
        albumArtUrl: null,
        durationMs: null,
        releaseDate: null,
        genre: opts.genre ?? null,
        providers: [
          { provider: 'appleMusic', providerSongId: '1', externalUrl: 'https://music.apple.com/x' },
        ],
      },
      createdAt: `${dateOfWeekday(round.weekStart, day)}T12:00:00.000Z`,
    };
    this.recs.push(rec);
    return rec;
  }

  rate(rec: Recommendation, userId: string, rating: number): void {
    this.votes.push({
      roundId: rec.roundId,
      recommendationId: rec.recommendationId,
      userId,
      rating,
      updatedAt: `${rec.submittedOn}T18:00:00.000Z`,
    });
  }

  /** Everyone in `raters` gives `rating`. */
  rateAll(rec: Recommendation, raters: string[], rating: number): void {
    for (const r of raters) this.rate(rec, r, rating);
  }

  get(id: string, userId = ME) {
    const all = computeAchievements({
      memberId: userId,
      rounds: this.rounds,
      recommendations: this.recs,
      votes: this.votes,
    });
    const found = all.find((a) => a.id === id);
    if (found === undefined) throw new Error(`no achievement ${id}`);
    return found;
  }
}

describe('the list (D28)', () => {
  it('has 26 achievements with unique ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(26);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(26);
  });
});

describe('participation', () => {
  it('First Drop and First Rating unlock on the lock date of the week they happened', () => {
    const w = new World();
    const r1 = w.week();
    const theirs = w.song(r1, 'u1');
    w.rate(theirs, ME, 7);
    const r2 = w.week();
    w.song(r2, ME);
    expect(w.get('first-rating').unlockedOn).toBe(r1.endsAt);
    expect(w.get('first-drop').unlockedOn).toBe(r2.endsAt);
  });

  it('counts only closed weeks (D9): nothing from an open week', () => {
    const w = new World();
    const open = w.week('OPEN');
    w.song(open, ME);
    expect(w.get('first-drop').unlockedOn).toBeNull();
    expect(w.get('first-drop').progress.label).toBe('0 of 1 songs');
  });

  it('10 Weeks counts the weeks you took part in, with progress', () => {
    const w = new World();
    for (let i = 0; i < 9; i++) w.song(w.week(), ME);
    expect(w.get('weeks-10')).toMatchObject({
      unlockedOn: null,
      progress: { current: 9, target: 10, label: '9 of 10 weeks' },
    });
    const tenth = w.week();
    w.rate(w.song(tenth, 'u1'), ME, 5); // rating counts as taking part too
    expect(w.get('weeks-10').unlockedOn).toBe(tenth.endsAt);
    expect(w.get('weeks-50').progress.label).toBe('10 of 50 weeks');
    expect(w.get('weeks-100').unlockedOn).toBeNull();
  });
});

describe('discovery', () => {
  it('artists are counted once each, ignoring case', () => {
    const w = new World();
    const r = w.week();
    for (let i = 0; i < 9; i++) w.song(r, ME, { artist: `Band ${i}` });
    w.song(r, ME, { artist: 'band 0' });
    expect(w.get('artists-10').progress.current).toBe(9);
    w.song(r, ME, { artist: 'Band 9' });
    expect(w.get('artists-10').unlockedOn).toBe(r.endsAt);
    expect(w.get('artists-25').progress.current).toBe(10);
  });

  it('genres count only songs that have one (P13.7)', () => {
    const w = new World();
    const r = w.week();
    ['Pop', 'Rock', 'Jazz', 'Soul'].forEach((genre) => w.song(r, ME, { genre }));
    w.song(r, ME); // no genre
    expect(w.get('genre-explorer').progress.label).toBe('4 of 5 genres');
    w.song(r, ME, { genre: 'Electronic' });
    expect(w.get('genre-explorer').unlockedOn).toBe(r.endsAt);
    expect(w.get('genres-10').unlockedOn).toBeNull();
  });
});

describe('rating', () => {
  it('First 10 and First 1', () => {
    const w = new World();
    const r = w.week();
    w.rate(w.song(r, 'u1'), ME, 10);
    expect(w.get('first-10').unlockedOn).toBe(r.endsAt);
    expect(w.get('first-1').unlockedOn).toBeNull();
    w.rate(w.song(r, 'u2'), ME, 1);
    expect(w.get('first-1').unlockedOn).toBe(r.endsAt);
  });

  it('Generous Voter and Tough Critic need 10 ratings, then a 1-point gap from the group', () => {
    const w = new World();
    const r = w.week();
    for (let i = 0; i < 9; i++) {
      const s = w.song(r, OTHERS[i % OTHERS.length]!);
      w.rate(s, ME, 9);
      w.rateAll(s, ['x1', 'x2', 'x3'], 6);
    }
    expect(w.get('generous-voter').progress.label).toBe('9 of 10 ratings');
    const tenth = w.song(r, 'u1');
    w.rate(tenth, ME, 9);
    w.rateAll(tenth, ['x1', 'x2', 'x3'], 6);
    // Mine 9; the party's 6.75 → +2.3
    expect(w.get('generous-voter').unlockedOn).toBe(r.endsAt);
    expect(w.get('tough-critic').unlockedOn).toBeNull();
  });

  it('Tough Critic for someone who rates below the group', () => {
    const w = new World();
    const r = w.week();
    for (let i = 0; i < 10; i++) {
      const s = w.song(r, 'u1');
      w.rate(s, ME, 3);
      w.rateAll(s, ['x1', 'x2', 'x3'], 7);
    }
    expect(w.get('tough-critic').unlockedOn).toBe(r.endsAt);
  });

  it('Balanced Judge: 20 ratings within 0.3 of the group', () => {
    const w = new World();
    const r = w.week();
    for (let i = 0; i < 20; i++) {
      const s = w.song(r, 'u1');
      w.rate(s, ME, 7);
      w.rateAll(s, ['x1'], 7);
    }
    expect(w.get('balanced-judge').unlockedOn).toBe(r.endsAt);
  });
});

describe('song success', () => {
  function weekWhereMineWins(w: World, myRating = 9, otherRating = 5) {
    const r = w.week();
    const mine = w.song(r, ME);
    const theirs = w.song(r, 'u1');
    w.rateAll(mine, ['u2', 'u3', 'u4'], myRating);
    w.rateAll(theirs, ['u2', 'u3', 'u4'], otherRating);
    return r;
  }

  it('Top Bop and Crowd Favorite', () => {
    const w = new World();
    const r = weekWhereMineWins(w);
    expect(w.get('top-bop').unlockedOn).toBe(r.endsAt);
    expect(w.get('crowd-favorite').unlockedOn).toBe(r.endsAt);
  });

  it('Perfect Score needs a 10.0 average from at least 3 ratings', () => {
    const w = new World();
    weekWhereMineWins(w, 9);
    expect(w.get('perfect-score').unlockedOn).toBeNull();
    const r = weekWhereMineWins(w, 10);
    expect(w.get('perfect-score').unlockedOn).toBe(r.endsAt);
  });

  it('Back-to-Back needs #1 in two weeks in a row', () => {
    const w = new World();
    weekWhereMineWins(w);
    weekWhereMineWins(w, 5, 9); // lost
    const third = weekWhereMineWins(w);
    expect(w.get('back-to-back').unlockedOn).toBeNull();
    const fourth = weekWhereMineWins(w);
    expect(w.get('back-to-back').unlockedOn).toBe(fourth.endsAt);
    expect(third.endsAt < fourth.endsAt).toBe(true);
  });
});

describe('social', () => {
  it('Musical Twin and Most Compatible compare your ratings with each person', () => {
    const w = new World();
    const r = w.week();
    for (let i = 0; i < 5; i++) {
      const s = w.song(r, 'u3');
      w.rate(s, ME, 8);
      w.rate(s, 'u1', 7); // 1 point apart each time
    }
    expect(w.get('musical-twin').unlockedOn).toBe(r.endsAt);
    expect(w.get('most-compatible').unlockedOn).toBeNull(); // needs 10 songs within 0.5
    const r2 = w.week();
    for (let i = 0; i < 10; i++) {
      const s = w.song(r2, 'u3');
      w.rate(s, ME, 6);
      w.rate(s, 'u2', 6);
    }
    expect(w.get('most-compatible').unlockedOn).toBe(r2.endsAt);
  });

  it('Most Divisive: your song had the widest spread of the week', () => {
    const w = new World();
    const r = w.week();
    const mine = w.song(r, ME);
    const calm = w.song(r, 'u1');
    [1, 10, 1, 10].forEach((rating, i) => w.rate(mine, OTHERS[i + 1]!, rating));
    w.rateAll(calm, ['u2', 'u3', 'u4', 'u5'], 6);
    expect(w.get('most-divisive').unlockedOn).toBe(r.endsAt);
  });

  it('Group Favorite: everyone who rated that week rated your song, average 8.0+', () => {
    const w = new World();
    const r = w.week();
    const mine = w.song(r, ME);
    const theirs = w.song(r, 'u1');
    w.rateAll(mine, ['u2', 'u3'], 9);
    w.rateAll(theirs, ['u2', 'u3', 'u4'], 5); // u4 rated that week but not my song
    expect(w.get('group-favorite').unlockedOn).toBeNull();
    const r2 = w.week();
    const mine2 = w.song(r2, ME);
    w.rateAll(mine2, ['u2', 'u3', 'u4'], 8);
    expect(w.get('group-favorite').unlockedOn).toBe(r2.endsAt);
  });
});

describe('consistency (weeks, never daily streaks)', () => {
  it('Weekly Regular: a song on every sharing day of a week', () => {
    const w = new World();
    const r = w.week();
    (['MON', 'TUE', 'WED', 'THU'] as Weekday[]).forEach((day) => w.song(r, ME, { day }));
    expect(w.get('weekly-regular').unlockedOn).toBeNull();
    const r2 = w.week();
    (['MON', 'TUE', 'WED', 'THU', 'FRI'] as Weekday[]).forEach((day) => w.song(r2, ME, { day }));
    expect(w.get('weekly-regular').unlockedOn).toBe(r2.endsAt);
  });

  it('Full House: rated every song you didn’t share, at least 5', () => {
    const w = new World();
    const r = w.week();
    const songs = OTHERS.slice(0, 5).map((u) => w.song(r, u));
    songs.slice(0, 4).forEach((s) => w.rate(s, ME, 7));
    expect(w.get('full-house').unlockedOn).toBeNull();
    w.rate(songs[4]!, ME, 7);
    expect(w.get('full-house').unlockedOn).toBe(r.endsAt);
  });

  it('Monthly and Season Regular count weeks in a row; a missed week restarts the count', () => {
    const w = new World();
    for (let i = 0; i < 3; i++) w.song(w.week(), ME);
    w.song(w.week(), 'u1'); // a week you sat out
    let last: Round | undefined;
    for (let i = 0; i < 4; i++) {
      last = w.week();
      w.song(last, ME);
    }
    expect(w.get('monthly-regular').unlockedOn).toBe(last!.endsAt);
    expect(w.get('season-regular').progress.label).toBe('4 of 12 weeks in a row');
  });
});

describe('unlocks stick, and the banner', () => {
  it('stays unlocked even if the numbers later change', () => {
    const w = new World();
    const r = w.week();
    for (let i = 0; i < 10; i++) {
      const s = w.song(r, 'u1');
      w.rate(s, ME, 9);
      w.rateAll(s, ['x1'], 6);
    }
    const r2 = w.week();
    for (let i = 0; i < 40; i++) {
      const s = w.song(r2, 'u1');
      w.rate(s, ME, 2);
      w.rateAll(s, ['x1'], 6);
    }
    expect(w.get('generous-voter')).toMatchObject({
      unlocked: true,
      unlockedOn: r.endsAt,
      progress: { label: 'Unlocked' },
    });
  });

  it('newlyUnlocked lists what unlocked after you last looked, and nothing the first time', () => {
    const w = new World();
    const r1 = w.week();
    w.song(r1, ME);
    const r2 = w.week();
    w.rate(w.song(r2, 'u1'), ME, 10);
    const all = computeAchievements({
      memberId: ME,
      rounds: w.rounds,
      recommendations: w.recs,
      votes: w.votes,
    });
    expect(newlyUnlocked(all, null)).toEqual([]);
    expect(newlyUnlocked(all, r1.endsAt).sort()).toEqual(['first-10', 'first-rating']);
  });
});

describe('failure paths and edge cases (P13.9 review)', () => {
  it('Group Favorite needs at least 3 ratings and an 8.0 average', () => {
    const w = new World();
    const r = w.week();
    w.rateAll(w.song(r, ME), ['u2', 'u3'], 10); // only 2 ratings
    expect(w.get('group-favorite').unlocked).toBe(false);
    const r2 = w.week();
    w.rateAll(w.song(r2, ME), ['u2', 'u3', 'u4'], 7); // everyone, but 7.0
    expect(w.get('group-favorite').unlocked).toBe(false);
  });

  it('Full House doesn’t need you to rate your own song', () => {
    const w = new World();
    const r = w.week();
    w.song(r, ME);
    OTHERS.slice(0, 5).forEach((u) => w.rate(w.song(r, u), ME, 6));
    expect(w.get('full-house').unlockedOn).toBe(r.endsAt);
  });

  it('a week without results between two #1 weeks doesn’t break Back-to-Back', () => {
    const w = new World();
    const win = () => {
      const r = w.week();
      const mine = w.song(r, ME);
      const theirs = w.song(r, 'u1');
      w.rateAll(mine, ['u2', 'u3'], 9);
      w.rateAll(theirs, ['u2', 'u3'], 4);
      return r;
    };
    win();
    w.song(w.week('NOT_ENOUGH_SONGS'), ME);
    const second = win();
    expect(w.get('back-to-back').unlockedOn).toBe(second.endsAt);
  });

  it('unlock days follow the party’s timezone', () => {
    expect(dayIn(new Date('2026-10-05T04:59:00.000Z'), 'America/Chicago')).toBe('2026-10-04');
    expect(dayIn(new Date('2026-10-05T04:59:00.000Z'), 'Asia/Tokyo')).toBe('2026-10-05');
  });

  it('another member’s rating-revealing badges have no date (D11)', () => {
    const w = new World();
    const r = w.week();
    w.rate(w.song(r, 'u1'), ME, 1);
    w.song(r, ME);
    const all = computeAchievements({
      memberId: ME,
      rounds: w.rounds,
      recommendations: w.recs,
      votes: w.votes,
    });
    const shown = forOtherMember(all);
    expect(shown.find((a) => a.id === 'first-1')).toMatchObject({
      unlocked: true,
      unlockedOn: null,
      unlockedDay: null,
    });
    expect(shown.find((a) => a.id === 'first-drop')?.unlockedOn).toBe(r.endsAt);
  });

  it('stays fast for two years of a 20-person party (every song rated by everyone)', () => {
    const w = new World();
    const people = Array.from({ length: 20 }, (_, i) => (i === 0 ? ME : `p${i}`));
    for (let week = 0; week < 104; week++) {
      const r = w.week();
      for (const person of people) {
        for (const day of ['MON', 'WED', 'FRI'] as Weekday[]) {
          const song = w.song(r, person, { day, artist: `A${week % 30}` });
          for (const rater of people)
            if (rater !== person) w.rate(song, rater, ((week + rater.length) % 10) + 1);
        }
      }
    }
    const started = Date.now();
    const all = computeAchievements({
      memberId: ME,
      rounds: w.rounds,
      recommendations: w.recs,
      votes: w.votes,
    });
    const took = Date.now() - started;
    expect(all).toHaveLength(26);
    expect(took).toBeLessThan(3000); // ~6,000 songs and ~120,000 ratings; was several seconds before the rewrite
  });
});
