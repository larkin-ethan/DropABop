# Used by `sam build` (infra/template.yaml: Metadata BuildMethod: makefile). SAM runs `make build-<FunctionLogicalId>`
# with ARTIFACTS_DIR set to that function's output folder. Every function ships the same bundle (src/lambda.ts) and
# picks its handler by name, so all targets share one recipe.
#
# samconfig.toml sets build_in_source = true so this runs here, where the workspace's node_modules are reachable.

FUNCTIONS = HealthFunction GetMeFunction UpdateMeFunction CreatePartyFunction ListPartiesFunction GetPartyFunction \
	PreviewInviteFunction JoinPartyFunction RegenerateInviteFunction RemoveMemberFunction UpdateSettingsFunction \
	GetCurrentWeekFunction ListWeeksFunction SubmitRecommendationFunction ListRecommendationsFunction \
	CastVoteFunction ListMyVotesFunction GetResultsFunction PersonalStatsFunction GroupStatsFunction \
	LeaderboardFunction SearchSongsFunction ResolveSongFunction ListCommentsFunction AddCommentFunction \
	DeleteCommentFunction

$(addprefix build-,$(FUNCTIONS)):
	node scripts/bundle.mjs "$(ARTIFACTS_DIR)"
