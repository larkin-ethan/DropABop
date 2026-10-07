// Dev smoke test (roadmap P4.3, reused by P10.3): calls every API endpoint on the deployed dev stack.
// Run from the repo root after `aws login --profile dropabop-dev`:   node scripts/smoke-dev.mjs
//
// Creates two throwaway users the first time (passwords only in the git-ignored .test-users.json, never printed),
// signs in with SRP through Amplify like the website does, and prints only statuses and error codes.
// On a non-sharing day sharing is closed (409 WEEKEND); on a sharing day it also shares a song and rates it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Amplify } from 'aws-amplify';
import { signIn, signOut, fetchAuthSession } from 'aws-amplify/auth';

// A CLI script's output is its point, so it writes to stdout directly (console.log is reserved by the lint rules).
const print = (line) => process.stdout.write(`${line}\n`);

// SMOKE_PROFILE overrides the AWS CLI profile (e.g. an older login name); defaults to dropabop-dev.
const profile = process.env.SMOKE_PROFILE ?? 'dropabop-dev';
const aws = (args) =>
  execFileSync('aws', [...args, '--region', 'us-east-2', '--profile', profile, '--output', 'json'], {
    encoding: 'utf8',
  });

// Stack outputs are read live, so no addresses are kept in the (public) repo.
const stack = JSON.parse(aws(['cloudformation', 'describe-stacks', '--stack-name', 'dropabop-dev']));
const outputs = Object.fromEntries(stack.Stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]));
const api = outputs.ApiUrl;
const poolId = outputs.UserPoolId;
const clientId = outputs.UserPoolClientId;
const usersFile = '.test-users.json';
let users;
if (existsSync(usersFile)) {
  users = JSON.parse(readFileSync(usersFile, 'utf8'));
} else {
  users = [1, 2].map((n) => ({
    email: `dropabop-dev-test-${n}@example.com`,
    password: `Aa1-${randomBytes(18).toString('base64url')}`,
  }));
  for (const u of users) {
    aws([
      'cognito-idp',
      'admin-create-user',
      '--user-pool-id',
      poolId,
      '--username',
      u.email,
      '--user-attributes',
      'Name=email,Value=' + u.email,
      'Name=email_verified,Value=true',
      '--message-action',
      'SUPPRESS',
    ]);
    aws([
      'cognito-idp',
      'admin-set-user-password',
      '--user-pool-id',
      poolId,
      '--username',
      u.email,
      '--password',
      u.password,
      '--permanent',
    ]);
  }
  writeFileSync(usersFile, JSON.stringify(users, null, 2) + '\n', { mode: 0o600 });
  print('created 2 test users');
}

Amplify.configure({ Auth: { Cognito: { userPoolId: poolId, userPoolClientId: clientId } } });

async function tokensFor(u) {
  await signOut().catch(() => {});
  const r = await signIn({ username: u.email, password: u.password });
  if (!r.isSignedIn) throw new Error('sign-in not complete: ' + r.nextStep?.signInStep);
  const s = await fetchAuthSession();
  return { access: s.tokens.accessToken.toString(), id: s.tokens.idToken.toString() };
}

const results = [];
async function call(label, method, path, token, body, expect) {
  const res = await fetch(api + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON (e.g. API Gateway's plain 'Unauthorized'); the status code is enough.
  }
  const code = json?.error?.code ?? json?.message ?? '';
  const ok = expect.includes(res.status);
  results.push(ok);
  print(
    `${ok ? 'PASS' : 'FAIL'} ${label.padEnd(44)} ${res.status} ${code} ${ok ? '' : 'expected ' + expect}`,
  );
  return json;
}

const t1 = await tokensFor(users[0]);
const t2 = await tokensFor(users[1]);

await call('health, no token', 'GET', '/health', null, null, [401]);
await call('health, garbage token', 'GET', '/health', 'not-a-jwt', null, [401]);
await call('health, ID token (no scope)', 'GET', '/health', t1.id, null, [401, 403]);
await call('health, access token', 'GET', '/health', t1.access, null, [200]);
await call('GET /users/me (u1)', 'GET', '/users/me', t1.access, null, [200]);
await call('PATCH /users/me (u1)', 'PATCH', '/users/me', t1.access, { displayName: 'Smoke One' }, [200]);
await call('PATCH /users/me with userId -> 400', 'PATCH', '/users/me', t1.access, { userId: 'x' }, [400]);
const me2 = await call('GET /users/me (u2)', 'GET', '/users/me', t2.access, null, [200]);

// Reuse the smoke party from an earlier run: people can be in at most 5 parties (D15), and hosts can't leave.
const mine = await call('GET /parties (u1)', 'GET', '/parties', t1.access, null, [200]);
const existing = mine?.parties?.find((p) => p.partyName === 'Smoke test party');
const created = existing
  ? await call(
      'GET /parties/{id} (u1, earlier smoke party)',
      'GET',
      `/parties/${existing.partyId}`,
      t1.access,
      null,
      [200],
    )
  : await call(
      'POST /parties (u1)',
      'POST',
      '/parties',
      t1.access,
      { name: 'Smoke test party', timezone: 'America/Chicago' },
      [201],
    );
const partyId = created?.party?.partyId;
const code = created?.party?.inviteCode;
await call('GET /parties/{id} (u1 host)', 'GET', `/parties/${partyId}`, t1.access, null, [200]);
await call('GET /parties/{id} (u2 not member) -> 403', 'GET', `/parties/${partyId}`, t2.access, null, [403]);
await call('GET /invites/{code} (u2)', 'GET', `/invites/${code}`, t2.access, null, [200]);
await call('GET /invites/bad -> 400', 'GET', '/invites/SONG-ZZZZ', t2.access, null, [400]);
await call('POST join (u2)', 'POST', `/parties/${partyId}/join`, t2.access, { inviteCode: code }, [200]);
await call(
  'POST join again (u2) -> 409',
  'POST',
  `/parties/${partyId}/join`,
  t2.access,
  { inviteCode: code },
  [409],
);
await call(
  'PATCH settings (u2 not host) -> 403',
  'PATCH',
  `/parties/${partyId}/settings`,
  t2.access,
  { name: 'x' },
  [403],
);
await call(
  'PATCH settings (u1 host)',
  'PATCH',
  `/parties/${partyId}/settings`,
  t1.access,
  { revealRecommenderDuringVoting: false },
  [200],
);

const week = await call(
  'GET rounds/current (u1)',
  'GET',
  `/parties/${partyId}/rounds/current`,
  t1.access,
  null,
  [200],
);
const roundId = week?.round?.roundId;
print(`     week: ${roundId ? 'round ' + week.round.status : 'no round, reason=' + (week?.reason ?? '?')}`);
await call('GET rounds (history)', 'GET', `/parties/${partyId}/rounds`, t1.access, null, [200]);

const search = await call(
  'GET /songs/search?q=midnight city',
  'GET',
  '/songs/search?q=midnight%20city',
  t1.access,
  null,
  [200],
);
const song = search?.songs?.[0];
// The Apple Music id is inside the song's provider list, the same way the website reads it (ShareScreen).
const appleSongId = song?.providers?.find((p) => p.provider === 'appleMusic')?.providerSongId;
print(`     search: ${search?.songs?.length ?? 0} songs`);
await call(
  'POST /songs/resolve (bad link) -> 400',
  'POST',
  '/songs/resolve',
  t1.access,
  { url: 'https://example.com/x' },
  [400],
);

if (roundId) {
  // Non-sharing day: sharing is closed (409 WEEKEND). Sharing day: 201, or 409 if this user already shared today.
  const shared = await call(
    'POST recommendation (u1)',
    'POST',
    `/rounds/${encodeURIComponent(roundId)}/recommendations`,
    t1.access,
    { provider: 'appleMusic', providerSongId: appleSongId ?? 'missing-from-search' },
    [201, 409],
  );
  const listed = await call(
    'GET recommendations (u2)',
    'GET',
    `/rounds/${encodeURIComponent(roundId)}/recommendations`,
    t2.access,
    null,
    [200],
  );
  const othersSong = listed?.songs?.find((s) => !s.isMine);
  if (othersSong) {
    await call(
      'PUT vote on u1 song (u2)',
      'PUT',
      `/rounds/${encodeURIComponent(roundId)}/votes/${othersSong.recommendationId}`,
      t2.access,
      { rating: 8 },
      [200, 204],
    );
    await call(
      'PUT vote on own song (u1) -> 403',
      'PUT',
      `/rounds/${encodeURIComponent(roundId)}/votes/${othersSong.recommendationId}`,
      t1.access,
      { rating: 8 },
      [403],
    );
    // Comments (D25): a member comments, everyone in the party can read it, the host can remove it.
    const posted = await call(
      'POST comment (u2)',
      'POST',
      `/rounds/${encodeURIComponent(roundId)}/recommendations/${othersSong.recommendationId}/comments`,
      t2.access,
      { text: 'Smoke test comment' },
      [201],
    );
    await call(
      'POST empty comment -> 400',
      'POST',
      `/rounds/${encodeURIComponent(roundId)}/recommendations/${othersSong.recommendationId}/comments`,
      t2.access,
      { text: '   ' },
      [400],
    );
    await call(
      'GET comments (u1)',
      'GET',
      `/rounds/${encodeURIComponent(roundId)}/comments`,
      t1.access,
      null,
      [200],
    );
    if (posted?.comment?.commentId) {
      await call(
        'DELETE comment as host (u1)',
        'DELETE',
        `/rounds/${encodeURIComponent(roundId)}/comments/${posted.comment.commentId}`,
        t1.access,
        null,
        [204],
      );
    }
  } else {
    print(
      `     no song to rate yet (${shared?.error?.code ?? 'none shared'}): rating checked on a sharing day`,
    );
  }
  await call(
    'PUT vote on unknown song -> 4xx',
    'PUT',
    `/rounds/${encodeURIComponent(roundId)}/votes/00000000-0000-4000-8000-000000000000`,
    t2.access,
    { rating: 7 },
    [400, 404],
  );
  await call(
    'GET my votes (u2)',
    'GET',
    `/rounds/${encodeURIComponent(roundId)}/votes/me`,
    t2.access,
    null,
    [200],
  );
  await call(
    'GET results while open -> 403',
    'GET',
    `/rounds/${encodeURIComponent(roundId)}/results`,
    t1.access,
    null,
    [403],
  );
}
await call('GET /users/me/stats', 'GET', `/users/me/stats?partyId=${partyId}`, t1.access, null, [200, 403]);
await call('GET party stats', 'GET', `/parties/${partyId}/stats`, t1.access, null, [200, 403]);
await call('GET leaderboard', 'GET', `/parties/${partyId}/leaderboard`, t1.access, null, [200, 403]);
await call(
  'POST new invite code (u2 not host) -> 403',
  'POST',
  `/parties/${partyId}/invite-code`,
  t2.access,
  null,
  [403],
);
await call('POST new invite code (u1)', 'POST', `/parties/${partyId}/invite-code`, t1.access, null, [200]);
await call(
  'DELETE member: u2 leaves',
  'DELETE',
  `/parties/${partyId}/members/${me2?.user?.userId}`,
  t2.access,
  null,
  [200, 204],
);
await call(
  'GET /parties/{id} (u2 after leaving) -> 403',
  'GET',
  `/parties/${partyId}`,
  t2.access,
  null,
  [403],
);

await signOut().catch(() => {});
print(`\n${results.filter(Boolean).length}/${results.length} passed`);
