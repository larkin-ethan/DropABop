// Share today's song (roadmap P8.4; spec §19 screen 4; mockup screens 10 and 13).
// Search the iTunes catalog (ADR-0007), or paste an Apple Music link (D21). Optionally add your own Spotify/YouTube Music
// links to the same song. A confirm step makes clear the pick is final for today.

import {
  parseAppleMusicSongUrl,
  parseSpotifyTrackUrl,
  parseYouTubeUrl,
  spotifyLinkSchema,
  youtubeLinkSchema,
  type CurrentWeekResponse,
  type Song,
  type SubmitRecommendationRequest,
} from '@dropabop/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  useCurrentWeek,
  useMe,
  useResolveSong,
  useShareSong,
  useSongSearch,
  useWeekSongs,
} from '../api/hooks';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PageHeader, QueryBoundary } from '../components/Page';
import { ListenLinks, SongRow } from '../components/SongRow';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { TextField } from '../components/TextField';
import { AlbumArt, Button, Card, buttonClassName } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { DAY_NAMES, hueFor } from '../lib/format';
import { useCurrentParty } from '../party/CurrentParty';
import { useSharerNames } from '../party/useSharerNames';

type OpenWeek = Extract<CurrentWeekResponse, { reason: null }>;

export function ShareScreen() {
  const { partyId, status, retry } = useCurrentParty();
  const week = useCurrentWeek(partyId);
  const { reveal } = useSharerNames(partyId);

  if (status === 'ready' && partyId === null) {
    return (
      <Card>
        <EmptyState
          title="Join a party first"
          message="Songs are shared inside a party."
          action={
            <Link to="/join" className={buttonClassName('primary')}>
              Join with a code
            </Link>
          }
        />
      </Card>
    );
  }
  return (
    <div>
      <PageHeader
        title="Share today’s song"
        description={
          reveal
            ? 'Pick one song for today. This party shows who shared each song.'
            : 'Pick one song for today. Nobody sees it’s yours until the week’s results.'
        }
      />
      <QueryBoundary
        isPending={status === 'loading' || week.isPending}
        error={status === 'error' ? true : week.error}
        onRetry={() => {
          retry();
          void week.refetch();
        }}
      >
        {() => {
          const data = week.data;
          if (data === undefined || partyId === null) return null;
          if (data.reason !== null) {
            return (
              <Card>
                <EmptyState
                  title={data.reason === 'paused' ? 'This party is paused' : 'No week is running right now'}
                  message={
                    data.reason === 'paused'
                      ? 'Sharing is off until the host resumes the party.'
                      : 'Sharing opens when the next week starts on Monday.'
                  }
                />
              </Card>
            );
          }
          if (data.today === null) {
            return (
              <Card>
                <EmptyState
                  title="Sharing is closed on weekends"
                  message="It opens again Monday. Meanwhile, catch up on this week’s songs before Sunday night."
                  action={
                    <Link to="/rate" className={buttonClassName('secondary')}>
                      Rate this week’s songs
                    </Link>
                  }
                />
              </Card>
            );
          }
          if (data.sharedToday) return <AlreadyShared week={data} />;
          return <SongPicker week={data} partyId={partyId} reveal={reveal} />;
        }}
      </QueryBoundary>
    </div>
  );
}

function AlreadyShared({ week }: { week: OpenWeek }) {
  const songs = useWeekSongs(week.round.roundId);
  const me = useMe();
  const today = week.today;
  const mine = songs.data?.songs.find((s) => s.isMine && s.submittedOn === today?.date);
  return (
    <Card>
      <p className="inline-flex items-center gap-1.5 font-semibold text-success">
        <Icon name="check" className="size-5" /> You’ve shared today’s song
      </p>
      {mine && (
        <ul className="mt-3">
          <SongRow
            id={mine.recommendationId}
            song={mine.song}
            preferred={me.data?.user.preferredProvider ?? null}
          />
        </ul>
      )}
      <p className="mt-3 text-muted">
        {today?.weekday === 'FRI'
          ? 'Next chance to share is Monday.'
          : 'Come back tomorrow to share another.'}
      </p>
      <Link to="/rate" className={buttonClassName('secondary', 'mt-4')}>
        <Icon name="star" className="size-4" /> Rate this week’s songs
      </Link>
    </Card>
  );
}

/** Waits until typing pauses, so search doesn't fire on every keystroke (iTunes has a rate limit). */
function useDebounced(value: string, delayMs = 400): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** A Spotify or YouTube Music link someone pasted, waiting to be attached to the song they pick. */
interface PastedLink {
  service: 'Spotify' | 'YouTube Music';
  links: { spotify?: string; youtube?: string };
}

function SongPicker({ week, partyId, reveal }: { week: OpenWeek; partyId: string; reveal: boolean }) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'paste'>('search');
  const [chosen, setChosen] = useState<Song | null>(null);
  const [pasted, setPasted] = useState<PastedLink | null>(null);
  const debounced = useDebounced(query);
  const search = useSongSearch(debounced);
  const today = week.today;

  return (
    <div className="flex flex-col gap-4">
      {today && (
        <p className="text-sm text-muted">
          Sharing for <span className="font-semibold text-ink">{DAY_NAMES[today.weekday]}</span>. One song per
          day.
        </p>
      )}
      <Card>
        <div className="flex gap-2" role="tablist" aria-label="How to find your song">
          {(['search', 'paste'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                mode === m ? 'bg-primary text-primary-ink' : 'text-muted hover:bg-surface-raised'
              }`}
            >
              {m === 'search' ? 'Search' : 'Paste a link'}
            </button>
          ))}
        </div>

        {mode === 'search' ? (
          <div className="mt-4">
            {pasted && (
              <div
                role="status"
                className="mb-3 flex flex-wrap items-start justify-between gap-2 rounded-xl border border-blue/40 bg-blue/10 px-3 py-2 text-sm"
              >
                <p>
                  Got your {pasted.service} link. Now find the same song below, and we’ll link it on the other
                  apps too.
                </p>
                <button type="button" className="text-blue hover:underline" onClick={() => setPasted(null)}>
                  Don’t use my link
                </button>
              </div>
            )}
            <label htmlFor="song-search" className="sr-only">
              Search for a song, artist, or album
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3.5 focus-within:border-blue">
              <Icon name="search" className="size-5 text-muted" />
              <input
                id="song-search"
                type="search"
                autoComplete="off"
                placeholder="Search for a song, artist, or album…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent py-2.5 text-ink placeholder:text-muted/60 focus:outline-none"
              />
            </div>
            <SearchResults query={debounced} search={search} onChoose={setChosen} />
          </div>
        ) : (
          <PasteLink
            onFound={setChosen}
            onOtherServiceLink={(link) => {
              setPasted(link);
              setMode('search'); // pick the matching song from Apple's catalog
            }}
          />
        )}
      </Card>

      <ConfirmShare
        song={chosen}
        roundId={week.round.roundId}
        partyId={partyId}
        reveal={reveal}
        pastedLinks={pasted?.links ?? null}
        onCancel={() => setChosen(null)}
      />
    </div>
  );
}

function SearchResults({
  query,
  search,
  onChoose,
}: {
  query: string;
  search: ReturnType<typeof useSongSearch>;
  onChoose: (song: Song) => void;
}) {
  if (query.trim().length < 2) {
    return <p className="mt-6 text-center text-sm text-muted">Type at least 2 letters to search.</p>;
  }
  if (search.isPending) return <LoadingState label="Searching…" rows={3} />;
  if (search.error)
    return (
      <div className="mt-4">
        <ErrorState message={errorMessage(search.error)} onRetry={() => void search.refetch()} />
      </div>
    );
  const songs = search.data?.songs ?? [];
  if (songs.length === 0) {
    return (
      <EmptyState
        title="No songs found"
        message="Try different words, or paste an Apple Music link instead."
      />
    );
  }
  return (
    <ul className="mt-3 flex flex-col" aria-label="Search results">
      {songs.map((song) => (
        <li
          key={song.songId}
          className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-raised sm:gap-4"
        >
          <AlbumArt url={song.albumArtUrl} hue={hueFor(song.songId)} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{song.title}</p>
            <p className="truncate text-sm text-muted">
              {song.artist}
              {song.album ? ` · ${song.album}` : ''}
            </p>
            {/* Apple's catalog terms: show where the song and artwork come from (ADR-0007). */}
            <div className="mt-1">
              <ListenLinks song={song} preferred="appleMusic" limit={1} />
            </div>
          </div>
          <Button
            variant="secondary"
            className="shrink-0 px-4"
            onClick={() => onChoose(song)}
            aria-label={`Choose ${song.title}`}
          >
            Choose
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Paste a song link from any of the apps (Ethan, 2026-10-04). Apple Music links are looked up directly. Spotify and
 * YouTube Music links can't be read without breaking those services' developer terms (docs/MUSIC_PROVIDERS.md), so
 * the app keeps the link and asks the person to find the same song in search; the link is attached when they share.
 */
function PasteLink({
  onFound,
  onOtherServiceLink,
}: {
  onFound: (song: Song) => void;
  onOtherServiceLink: (link: PastedLink) => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const resolve = useResolveSong();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const link = url.trim();
    if (link === '') return;
    setError(null);
    if (parseAppleMusicSongUrl(link) !== null) {
      resolve.mutate(link, { onSuccess: (data) => onFound(data.song) });
    } else if (parseSpotifyTrackUrl(link) !== null) {
      onOtherServiceLink({ service: 'Spotify', links: { spotify: link } });
    } else if (parseYouTubeUrl(link) !== null) {
      onOtherServiceLink({ service: 'YouTube Music', links: { youtube: link } });
    } else {
      setError('That isn’t a song link from Apple Music, Spotify, or YouTube Music.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3" noValidate>
      <TextField
        label="Song link"
        type="url"
        placeholder="Apple Music, Spotify, or YouTube Music link"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
        }}
        hint="In the music app: Share → Copy link. Then paste it here."
        error={error ?? (resolve.error ? errorMessage(resolve.error) : undefined)}
      />
      <Button type="submit" disabled={resolve.isPending || url.trim() === ''}>
        {resolve.isPending ? 'Looking it up…' : 'Find this song'}
      </Button>
    </form>
  );
}

function ConfirmShare({
  song,
  roundId,
  partyId,
  reveal,
  pastedLinks,
  onCancel,
}: {
  song: Song | null;
  roundId: string;
  partyId: string;
  /** D10: whether the party shows who shared each song during the week. */
  reveal: boolean;
  /** A link pasted on the "Paste a link" tab, attached to whichever song is chosen. */
  pastedLinks: PastedLink['links'] | null;
  onCancel: () => void;
}) {
  const share = useShareSong(roundId, partyId);
  const navigate = useNavigate();
  const [spotify, setSpotify] = useState('');
  const [youtube, setYoutube] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Each time a song is chosen, start from the pasted link (if any) so it's attached without retyping.
  useEffect(() => {
    if (song === null) return;
    setSpotify(pastedLinks?.spotify ?? '');
    setYoutube(pastedLinks?.youtube ?? '');
    setLinkError(null);
  }, [song, pastedLinks]);

  function handleShare() {
    if (song === null) return;
    const appleId = song.providers.find((p) => p.provider === 'appleMusic')?.providerSongId;
    if (appleId === undefined) return;
    const links: NonNullable<SubmitRecommendationRequest['links']> = {};
    if (spotify.trim() !== '') {
      const parsed = spotifyLinkSchema.safeParse(spotify.trim());
      if (!parsed.success) return setLinkError(parsed.error.issues[0]?.message ?? 'Check the Spotify link.');
      links.spotify = parsed.data;
    }
    if (youtube.trim() !== '') {
      const parsed = youtubeLinkSchema.safeParse(youtube.trim());
      if (!parsed.success)
        return setLinkError(parsed.error.issues[0]?.message ?? 'Check the YouTube Music link.');
      links.youtube = parsed.data;
    }
    setLinkError(null);
    share.mutate(
      {
        provider: 'appleMusic',
        providerSongId: appleId,
        ...(Object.keys(links).length > 0 ? { links } : {}),
      },
      { onSuccess: () => void navigate('/', { replace: true }) },
    );
  }

  return (
    <Modal open={song !== null} title="Share this song?" onClose={onCancel}>
      {song && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <AlbumArt url={song.albumArtUrl} hue={hueFor(song.songId)} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{song.title}</p>
              <p className="truncate text-muted">{song.artist}</p>
              {song.album && <p className="truncate text-sm text-muted">{song.album}</p>}
            </div>
          </div>
          <details className="rounded-xl border border-line px-3 py-2" open={pastedLinks !== null}>
            <summary className="cursor-pointer text-sm font-medium text-blue">
              Add your Spotify or YouTube Music link (optional)
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <TextField
                label="Spotify link"
                type="url"
                placeholder="https://open.spotify.com/track/…"
                value={spotify}
                onChange={(e) => setSpotify(e.target.value)}
              />
              <TextField
                label="YouTube Music link"
                type="url"
                placeholder="https://music.youtube.com/watch?v=…"
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
              />
              <p className="text-xs text-muted">
                Without these, people get a search link on those apps instead.
              </p>
            </div>
          </details>
          <p className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
            You can’t change it after sharing.{' '}
            {reveal
              ? 'This party shows who shared each song, so people will see it’s yours.'
              : 'Your name stays hidden until the week’s results.'}
          </p>
          {(linkError ?? share.error) && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200"
            >
              {linkError ?? errorMessage(share.error)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onCancel}>
              Back
            </Button>
            <Button onClick={handleShare} disabled={share.isPending}>
              {share.isPending ? 'Sharing…' : 'Share song'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
