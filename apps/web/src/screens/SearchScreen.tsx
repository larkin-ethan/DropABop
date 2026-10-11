// /search (spec §24; P13.12, D33): search your current party's songs, artists, members and weeks.
// The query and category live in the address (?q=…&type=…), so Back and shared links keep the search.

import type { PartySearchResponse, PartySearchType, SearchSongHit } from '@dropabop/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMe, useParty, usePartySearch } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { EmptyState } from '../components/States';
import { AlbumArt, Avatar, Button, Card } from '../components/ui';
import { formatShortDate, hueFor } from '../lib/format';
import { nameLookup, type NameLookup } from '../lib/members';
import { useCurrentParty } from '../party/CurrentParty';
import { NoPartyCard } from './ResultsScreens';
import { songDetailsPath } from './SongDetailsScreen';

const TYPES: { id: PartySearchType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'songs', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'members', label: 'Members' },
  { id: 'weeks', label: 'Weeks' },
];

function isType(value: string | null): value is PartySearchType {
  return TYPES.some((t) => t.id === value);
}

/** Waits until typing pauses, so each keystroke doesn't ask the server. */
function useDebounced(value: string, ms = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function SearchScreen() {
  const { partyId, status, current } = useCurrentParty();
  const [params, setParams] = useSearchParams();
  const requestedType = params.get('type');
  const type: PartySearchType = isType(requestedType) ? requestedType : 'all';
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text).trim();

  // Keep the address in step with what's being searched (replace: typing shouldn't fill the Back history).
  useEffect(() => {
    const next = new URLSearchParams();
    if (q !== '') next.set('q', q);
    if (type !== 'all') next.set('type', type);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [q, type, params, setParams]);

  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  const setType = (next: PartySearchType) => {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('type');
    else p.set('type', next);
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Search"
        description={current ? `Songs, artists, members and weeks in ${current.partyName}` : undefined}
      />
      <label htmlFor="party-search" className="sr-only">
        Search your party
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3.5 focus-within:border-blue">
        <Icon name="search" className="size-5 text-muted" />
        <input
          id="party-search"
          type="search"
          autoComplete="off"
          placeholder="Search songs, artists, members or a week…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full bg-transparent py-2.5 text-ink placeholder:text-muted/60 focus:outline-none"
        />
      </div>
      {partyId !== null && (
        <Results partyId={partyId} q={q} type={type} onType={setType} onSearch={setText} />
      )}
    </div>
  );
}

function Results({
  partyId,
  q,
  type,
  onType,
  onSearch,
}: {
  partyId: string;
  q: string;
  type: PartySearchType;
  onType: (type: PartySearchType) => void;
  onSearch: (q: string) => void;
}) {
  const search = usePartySearch(partyId, q, type);
  const me = useMe();
  const party = useParty(partyId); // names for "Shared by …" (the search only returns members that match)
  if (q.length < 2) {
    return (
      <p className="mt-6 text-center text-sm text-muted">
        Type at least 2 characters. Search covers only this party.
      </p>
    );
  }
  const first = search.data?.pages[0];

  return (
    <>
      <div role="group" aria-label="Category" className="mt-4 flex flex-wrap gap-2">
        {TYPES.map((t) => {
          const count = t.id === 'all' || first === undefined ? null : first.totals[t.id];
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={type === t.id}
              onClick={() => onType(t.id)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                type === t.id
                  ? 'border-primary bg-primary/15 text-ink'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {t.label}
              {count !== null && <span className="ml-1 font-normal text-muted">{count}</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <QueryBoundary
          isPending={search.isPending}
          error={search.error}
          onRetry={() => void search.refetch()}
          loadingLabel="Searching…"
        >
          {() => {
            const pages = search.data?.pages ?? [];
            if (first === undefined) return null;
            const merged = mergePages(pages);
            const names = nameLookup(party.data?.members ?? [], me.data?.user.userId);
            const total = Object.values(first.totals).reduce((a, b) => a + b, 0);
            if (total === 0) {
              return (
                <Card>
                  <EmptyState
                    title="No matches"
                    message={`Nothing in this party matches “${q}”. Try part of a title, an artist, a name or a date like “Oct 5”.`}
                  />
                </Card>
              );
            }
            return (
              <div className="flex flex-col gap-4">
                {first.truncated && (
                  <p className="text-xs text-muted">
                    Your party has lots of songs: the newest 5,000 were searched.
                  </p>
                )}
                <ResultSections
                  data={merged}
                  type={type}
                  names={names}
                  onMore={onType}
                  onArtist={(artist) => {
                    onSearch(artist);
                    onType('songs');
                  }}
                />
                {type !== 'all' && search.hasNextPage && (
                  <div className="flex justify-center">
                    <Button
                      variant="secondary"
                      disabled={search.isFetchingNextPage}
                      onClick={() => void search.fetchNextPage()}
                    >
                      {search.isFetchingNextPage ? 'Loading…' : 'Show more'}
                    </Button>
                  </div>
                )}
              </div>
            );
          }}
        </QueryBoundary>
      </div>
    </>
  );
}

function mergePages(pages: PartySearchResponse[]): PartySearchResponse {
  const [first, ...rest] = pages;
  if (first === undefined) throw new Error('no pages');
  return rest.reduce(
    (all, page) => ({
      ...all,
      songs: [...all.songs, ...page.songs],
      artists: [...all.artists, ...page.artists],
      members: [...all.members, ...page.members],
      weeks: [...all.weeks, ...page.weeks],
    }),
    first,
  );
}

function ResultSections({
  data,
  type,
  names,
  onMore,
  onArtist,
}: {
  data: PartySearchResponse;
  type: PartySearchType;
  names: NameLookup;
  onMore: (type: PartySearchType) => void;
  onArtist: (artist: string) => void;
}) {
  const section = (id: Exclude<PartySearchType, 'all'>, title: string, list: ReactNode) => {
    if (data.totals[id] === 0 || (type !== 'all' && type !== id)) return null;
    const hidden = type === 'all' ? data.totals[id] - data[id].length : 0;
    return (
      <Card key={id}>
        <h2 className="font-bold">{title}</h2>
        {list}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => onMore(id)}
            className="mt-2 text-sm font-semibold text-blue hover:underline"
          >
            See all {data.totals[id]} {title.toLowerCase()}
          </button>
        )}
      </Card>
    );
  };

  return (
    <>
      {section(
        'songs',
        'Songs',
        <ul className="mt-2 flex flex-col gap-1">
          {data.songs.map((song) => (
            <SongHit key={song.recommendationId} song={song} names={names} />
          ))}
        </ul>,
      )}
      {section(
        'artists',
        'Artists',
        <ul className="mt-2 flex flex-col gap-1">
          {data.artists.map((a) => (
            <li key={a.artist}>
              <button
                type="button"
                onClick={() => onArtist(a.artist)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-surface-raised"
              >
                <span className="min-w-0 truncate font-medium">{a.artist}</span>
                <span className="shrink-0 text-sm text-muted">
                  {a.songCount} song{a.songCount === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>,
      )}
      {section(
        'members',
        'Members',
        <ul className="mt-2 flex flex-col gap-2">
          {data.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-2 py-1">
              <Avatar name={m.displayName} color={m.avatarColor} image={m.avatarImage} size="sm" />
              <span className="min-w-0 truncate font-medium">{names.name(m.userId)}</span>
            </li>
          ))}
        </ul>,
      )}
      {section(
        'weeks',
        'Weeks',
        <ul className="mt-2 flex flex-col gap-1">
          {data.weeks.map((w) => (
            <li key={w.roundId}>
              <Link
                to={`/history/week/${w.weekStart}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-surface-raised"
              >
                <span className="font-medium">Week of {formatShortDate(w.weekStart)}</span>
                <span className="shrink-0 text-sm text-muted">
                  {w.songCount} song{w.songCount === 1 ? '' : 's'}
                  {w.status === 'OPEN' ? ' · this week' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>,
      )}
    </>
  );
}

function SongHit({ song, names }: { song: SearchSongHit; names: NameLookup }) {
  // While the week is open the sharer stays hidden (D10) unless the API included it (yours, or a revealing week).
  const sharer =
    song.recommendedBy === undefined
      ? 'Sharer revealed with the results'
      : song.isMine
        ? 'Your pick'
        : `Shared by ${names.name(song.recommendedBy)}`;
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-raised">
      <AlbumArt url={song.albumArtUrl} hue={hueFor(song.recommendationId)} />
      <span className="min-w-0 flex-1">
        <Link
          to={songDetailsPath(song.roundId, song.recommendationId)}
          className="line-clamp-2 font-semibold break-words hover:text-blue hover:underline"
        >
          {song.title}
        </Link>
        <span className="block truncate text-sm text-muted">{song.artist}</span>
        <span className="block truncate text-xs text-muted">
          {sharer} · {song.weekOpen ? 'this week' : formatShortDate(song.submittedOn)}
        </span>
      </span>
    </li>
  );
}
