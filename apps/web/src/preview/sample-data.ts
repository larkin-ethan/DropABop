// SAMPLE DATA for previewing screens before the app is connected to the API (dev builds only).
// Shapes match the real API responses in docs/API.md, so swapping in real data is a drop-in change.

import type { MemberName, OpenWeekSongView, Song } from '@dropabop/shared';

export type SongView = OpenWeekSongView;
export type MemberView = MemberName;

function song(id: string, title: string, artist: string, album: string): Song {
  return {
    songId: id,
    title,
    artist,
    album,
    albumArtUrl: null,
    durationMs: 240000,
    releaseDate: null,
    providers: [
      { provider: 'appleMusic', providerSongId: id, externalUrl: `https://music.apple.com/us/song/${id}` },
    ],
  };
}

export const sampleMembers: MemberView[] = [
  { userId: 'me', displayName: 'Ethan Larkin', avatarColor: '#3B82F6' },
  { userId: 'u2', displayName: 'Sarah Kim', avatarColor: '#14B8A6' },
  { userId: 'u3', displayName: 'Mike Torres', avatarColor: '#8B5CF6' },
  { userId: 'u4', displayName: 'John Park', avatarColor: '#F59E0B' },
  { userId: 'u5', displayName: 'Alex Rivera', avatarColor: '#EC4899' },
  { userId: 'u6', displayName: 'Priya Shah', avatarColor: '#22C55E' },
];

/** Same shape as GET /rounds/{roundId}/recommendations (songs are anonymous while the week is open, D10). */
export const sampleSongs: SongView[] = [
  {
    recommendationId: 'r1',
    weekday: 'MON',
    submittedOn: '2026-10-05',
    song: song('r1', 'Midnight City', 'M83', 'Hurry Up, We’re Dreaming'),
    isMine: true,
    recommendedBy: 'me',
    myRating: null,
  },
  {
    recommendationId: 'r2',
    weekday: 'MON',
    submittedOn: '2026-10-05',
    song: song('r2', 'Good 4 U', 'Olivia Rodrigo', 'SOUR'),
    isMine: false,
    myRating: 8,
  },
  {
    recommendationId: 'r3',
    weekday: 'MON',
    submittedOn: '2026-10-05',
    song: song('r3', 'Flowers', 'Miley Cyrus', 'Endless Summer Vacation'),
    isMine: false,
    myRating: 7,
  },
  {
    recommendationId: 'r4',
    weekday: 'MON',
    submittedOn: '2026-10-05',
    song: song('r4', 'Smells Like Teen Spirit', 'Nirvana', 'Nevermind'),
    isMine: false,
    myRating: 9,
  },
  {
    recommendationId: 'r5',
    weekday: 'TUE',
    submittedOn: '2026-10-06',
    song: song('r5', 'Electric Feel', 'MGMT', 'Oracular Spectacular'),
    isMine: true,
    recommendedBy: 'me',
    myRating: null,
  },
  {
    recommendationId: 'r6',
    weekday: 'TUE',
    submittedOn: '2026-10-06',
    song: song('r6', 'Dreams', 'Fleetwood Mac', 'Rumours'),
    isMine: false,
    myRating: 10,
  },
  {
    recommendationId: 'r7',
    weekday: 'TUE',
    submittedOn: '2026-10-06',
    song: song('r7', 'Sunflower', 'Post Malone & Swae Lee', 'Spider-Verse'),
    isMine: false,
    myRating: 6,
  },
  {
    recommendationId: 'r8',
    weekday: 'TUE',
    submittedOn: '2026-10-06',
    song: song('r8', 'Mr. Brightside', 'The Killers', 'Hot Fuss'),
    isMine: false,
    myRating: 8,
  },
  {
    recommendationId: 'r9',
    weekday: 'WED',
    submittedOn: '2026-10-07',
    song: song('r9', 'Redbone', 'Childish Gambino', '“Awaken, My Love!”'),
    isMine: true,
    recommendedBy: 'me',
    myRating: null,
  },
  {
    recommendationId: 'r10',
    weekday: 'WED',
    submittedOn: '2026-10-07',
    song: song('r10', 'Heat Waves', 'Glass Animals', 'Dreamland'),
    isMine: false,
    myRating: null,
  },
  {
    recommendationId: 'r11',
    weekday: 'WED',
    submittedOn: '2026-10-07',
    song: song('r11', 'Levitating', 'Dua Lipa', 'Future Nostalgia'),
    isMine: false,
    myRating: null,
  },
  {
    recommendationId: 'r12',
    weekday: 'WED',
    submittedOn: '2026-10-07',
    song: song('r12', 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera'),
    isMine: false,
    myRating: null,
  },
  {
    recommendationId: 'r13',
    weekday: 'WED',
    submittedOn: '2026-10-07',
    song: song('r13', 'Blinding Lights', 'The Weeknd', 'After Hours'),
    isMine: false,
    myRating: null,
  },
];
