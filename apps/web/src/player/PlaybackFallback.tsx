// What to show when a song can't play inside Drop a Bop (spec v2 §14). Only real links are offered: the song's
// exact links, or a plainly labelled search on that service. Never a different recording picked for the person.

import { Icon } from '../components/Icon';
import type { MusicLink } from '../lib/music-links';
import type { PlaybackErrorKind } from './types';

const MESSAGES: Record<PlaybackErrorKind, { title: string; detail: string }> = {
  notEmbeddable: {
    title: 'This song can’t be played here.',
    // YouTube also uses these codes for some removed or restricted videos, so don't blame the owner.
    detail: 'YouTube doesn’t allow this video to play outside YouTube.',
  },
  notFound: {
    title: 'This song can’t be played here.',
    detail: 'The linked video was removed or made private.',
  },
  failed: {
    title: 'We couldn’t play this song here.',
    detail: 'Try another available listening option.',
  },
};

export function PlaybackFallback({ error, links }: { error: PlaybackErrorKind; links: MusicLink[] }) {
  const message = MESSAGES[error];
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="font-semibold">{message.title}</p>
      <p className="text-sm text-muted">{message.detail}</p>
      {links.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.provider}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-blue"
              >
                {link.exact ? `Listen on ${link.label}` : `Search on ${link.label}`}
                <Icon name="external" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
