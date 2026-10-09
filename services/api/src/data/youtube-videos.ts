// A shared song's YouTube video (ADR-0012). Stored apart from the song so DynamoDB deletes it on its own after
// 29 days (YouTube's 30-day rule for video ids). Reads also skip expired ones, because TTL deletion can lag.

import { YOUTUBE_VIDEO_KEEP_DAYS, canonicalLinks, type Recommendation } from '@dropabop/shared';
import type { DataContext } from './context';
import { queryByPrefix } from './context';
import { keys, partitionKeys, prefixes } from './keys';

const DAY_SECONDS = 24 * 60 * 60;

/** Where the video came from: the sharer's own pasted link, or the YouTube search they accepted. */
export type YouTubeVideoSource = 'pasted' | 'search';

/** The item to write in the same transaction as the song (data/recommendations.ts → putRecommendation). */
export function youtubeVideoItem(
  ctx: DataContext,
  recommendation: Pick<Recommendation, 'partyId' | 'recommendationId'>,
  weekStart: string,
  video: { videoId: string; source: YouTubeVideoSource },
  now: Date,
) {
  return {
    TableName: ctx.tableName,
    Item: {
      ...keys.youtubeVideo(recommendation.partyId, weekStart, recommendation.recommendationId),
      entity: 'YouTubeVideo',
      recommendationId: recommendation.recommendationId,
      videoId: video.videoId,
      source: video.source,
      expiresAt: Math.floor(now.getTime() / 1000) + YOUTUBE_VIDEO_KEEP_DAYS * DAY_SECONDS,
    },
  };
}

/** recommendationId → YouTube video id, for a week's songs whose video hasn't expired yet. */
export async function listWeekYouTubeVideos(
  ctx: DataContext,
  partyId: string,
  weekStart: string,
  now: Date,
): Promise<Map<string, string>> {
  const items = await queryByPrefix(ctx, partitionKeys.party(partyId), prefixes.weekYouTubeVideos(weekStart));
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const videos = new Map<string, string>();
  for (const item of items) {
    if (typeof item.expiresAt === 'number' && item.expiresAt > nowSeconds) {
      videos.set(String(item.recommendationId), String(item.videoId));
    }
  }
  return videos;
}

/** Adds a live YouTube video to the song's links, the same way a pasted link was stored before ADR-0012. */
export function withYouTubeVideo(
  recommendation: Recommendation,
  videoId: string | undefined,
): Recommendation {
  if (videoId === undefined || recommendation.song.providers.some((p) => p.provider === 'youtube')) {
    return recommendation;
  }
  return {
    ...recommendation,
    song: {
      ...recommendation.song,
      providers: [
        ...recommendation.song.providers,
        { provider: 'youtube', providerSongId: videoId, externalUrl: canonicalLinks.youtube(videoId) },
      ],
    },
  };
}
