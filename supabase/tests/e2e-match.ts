// Plays one real match against the deployed project: anonymous sign-in,
// match-start, the engine's plan, match-finish (twice, to check it pays once).
// Run: node --experimental-strip-types supabase/tests/e2e-match.ts
// Needs SUPABASE_URL and SUPABASE_KEY (the publishable key); leaves one anonymous test user behind.
import { planMatch, type ChanceInput, type MatchSetup } from '../../packages/engine/src/index.ts';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) throw new Error('SUPABASE_URL and SUPABASE_KEY are required');

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(`${URL}${path}`, {
    method: 'POST',
    headers: { apikey: KEY!, 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function check(ok: unknown, what: string): void {
  if (!ok) throw new Error(`check failed: ${what}`);
  console.log(`ok: ${what}`);
}

const auth = await post('/auth/v1/signup', {});
const token: string = auth.access_token;
check(token, 'anonymous sign-in');

const ticket = await post('/functions/v1/match-start', {}, token);
const setup: MatchSetup = ticket.setup;
check(typeof ticket.matchId === 'string' && setup.chances > 0, 'match-start issued a ticket');
check(ticket.energy.energy === 4, 'match-start spent one energy');

const inputs: ChanceInput[] = planMatch(setup).moments.map((m, chance) =>
  m.kind === 'pass' ? { chance, pass: m.openSide! } : { chance, shot: { aim: 700, lift: 400, power: 750 } });

// Play at a human pace so the match is not flagged as too short.
await new Promise((r) => setTimeout(r, setup.chances * 4_000 + 1_000));
const finished = await post('/functions/v1/match-finish', { matchId: ticket.matchId, inputs, durationMs: 60_000 }, token);
check(finished.reward && finished.reward.coin > 0, `match-finish paid ${finished.reward?.coin} coin, ${finished.reward?.xp} XP`);
check(!finished.flagged, 'match was not flagged');
check(finished.player.coin === finished.reward.coin, 'wallet holds the reward');

const again = await post('/functions/v1/match-finish', { matchId: ticket.matchId, inputs, durationMs: 60_000 }, token)
  .catch((e: Error) => e.message);
check(typeof again === 'string' && again.includes('ticket_not_open'), 'a second finish is rejected');

console.log('e2e match passed');
