// Comments on one song (D25). Collapsed by default: a song shows only "Comments (3)" until someone opens it, so long
// weeks stay easy to scan. Names are always shown. Comments can be added while the week is open; you can delete your
// own then, and the host can delete any comment (moderation).

import type { Comment } from '@dropabop/shared';
import { COMMENT_MAX_LENGTH } from '@dropabop/shared';
import { useId, useState, type FormEvent } from 'react';
import { useAddComment, useDeleteComment } from '../api/hooks';
import { errorMessage } from '../lib/errors';
import type { NameLookup } from '../lib/members';
import { Avatar, Button } from './ui';

export function SongComments({
  roundId,
  recommendationId,
  songTitle,
  comments,
  weekOpen,
  isHost,
  myUserId,
  names,
}: {
  roundId: string;
  recommendationId: string;
  /** For screen readers: which song these comments belong to. */
  songTitle: string;
  /** This song's comments, oldest first. */
  comments: Comment[];
  /** Comments can be added (and your own deleted) only while the week is open. */
  weekOpen: boolean;
  isHost: boolean;
  myUserId: string | undefined;
  names: NameLookup;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const add = useAddComment(roundId);
  const remove = useDeleteComment(roundId);
  const panelId = useId();
  const inputId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim() === '') return;
    add.mutate({ recommendationId, text }, { onSuccess: () => setText('') });
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        // Says which song, since every card has one of these buttons.
        aria-label={open ? `Hide comments on ${songTitle}` : `Comments (${comments.length}) on ${songTitle}`}
        className="text-sm font-medium text-blue hover:underline"
      >
        {open ? 'Hide comments' : `💬 Comments (${comments.length})`}
      </button>

      {open && (
        <div
          id={panelId}
          className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-surface-raised p-3"
        >
          {comments.length === 0 ? (
            <p className="text-sm text-muted">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5" aria-label={`Comments on ${songTitle}`}>
              {comments.map((c) => {
                const mine = c.userId === myUserId;
                const canDelete = isHost || (mine && weekOpen);
                return (
                  <li key={c.commentId} className="flex items-start gap-2">
                    <Avatar
                      name={names.name(c.userId)}
                      color={names.color(c.userId)}
                      image={names.image(c.userId)}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">
                        <span className="font-semibold text-ink">{names.name(c.userId)}</span> ·{' '}
                        {new Date(c.createdAt).toLocaleString('en-US', {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-sm break-words">{c.text}</p>
                    </div>
                    {canDelete && (
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(c.commentId)}
                        className="shrink-0 text-xs text-muted hover:text-red-300"
                        aria-label={`Delete comment by ${names.name(c.userId)}`}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {remove.error && (
            <p role="alert" className="text-sm text-red-200">
              {errorMessage(remove.error)}
            </p>
          )}

          {weekOpen ? (
            <form onSubmit={submit} className="flex flex-col gap-1.5" noValidate>
              <label htmlFor={inputId} className="text-sm font-medium">
                Add a comment
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  value={text}
                  maxLength={COMMENT_MAX_LENGTH}
                  onChange={(e) => setText(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted/60 focus:border-blue focus:outline-none"
                  placeholder="Say something about this song"
                />
                <Button type="submit" disabled={add.isPending || text.trim() === ''}>
                  {add.isPending ? 'Posting…' : 'Post'}
                </Button>
              </div>
              <p className="text-xs text-muted">
                Your name shows with your comment. {COMMENT_MAX_LENGTH - text.length} characters left.
              </p>
              {add.error && (
                <p role="alert" className="text-sm text-red-200">
                  {errorMessage(add.error)}
                </p>
              )}
            </form>
          ) : (
            <p className="text-sm text-muted">Comments are closed for this week.</p>
          )}
        </div>
      )}
    </div>
  );
}
