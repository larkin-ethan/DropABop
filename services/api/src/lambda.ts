// The single Lambda bundle's entry point. Every API function in infra/template.yaml is deployed with the same bundle
// and picks its handler by name (`Handler: index.<name>`). One bundle keeps the build simple.
//
// A test checks that every `Handler:` in the template is exported here, so a typo fails `npm test`, not a deploy.

export { healthHandler } from './handlers/health';
export { getMeHandler, updateMeHandler } from './handlers/users';
export { createPartyHandler, listPartiesHandler, getPartyHandler } from './handlers/parties';
export {
  previewInviteHandler,
  joinPartyHandler,
  regenerateInviteHandler,
  removeMemberHandler,
} from './handlers/membership';
export { updateSettingsHandler } from './handlers/settings';
export { getCurrentWeekHandler, listWeeksHandler } from './handlers/weeks';
export { submitRecommendationHandler, listRecommendationsHandler } from './handlers/recommendations';
export { castVoteHandler, listMyVotesHandler } from './handlers/votes';
export { getResultsHandler } from './handlers/results';
export { personalStatsHandler, groupStatsHandler, leaderboardHandler } from './handlers/stats';
export { searchSongsHandler, resolveSongHandler } from './handlers/songs';
