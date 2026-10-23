// AdMob server-side verification callback (GDD v3.1 section 9). Google calls this
// URL with GET after a rewarded ad finishes; the app never calls it. The app sets
// user_id to the player id and custom_data to `energy` or `double:<match id>`.
// The signature is checked against Google's published keys, the transaction id
// makes Google's retries harmless, and the reward is computed here.
// Deployed with verify_jwt = false (supabase/config.toml): Google sends no JWT.
import {
  adDoubleCoin,
  currentEnergy,
  parseAdReward,
  parseSsv,
  verifySsv,
  type SsvKey,
} from '../../../packages/economy/src/index.ts';
import { json } from '../_shared/http.ts';
import { admin, loadEconomyConfig } from '../_shared/supabase.ts';

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_TTL_MS = 24 * 3600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let keys: { list: SsvKey[]; at: number } | null = null;

async function verifierKeys(refresh: boolean): Promise<SsvKey[]> {
  if (!refresh && keys && Date.now() - keys.at < KEYS_TTL_MS) return keys.list;
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new Error(`verifier keys ${res.status}`);
  const body = await res.json() as { keys: SsvKey[] };
  keys = { list: body.keys, at: Date.now() };
  return keys.list;
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  try {
    const cb = parseSsv(new URL(req.url).search.slice(1));
    if (!cb) return json({ error: 'unsigned' }, 400);
    let list = await verifierKeys(false);
    if (!list.some((k) => k.keyId === cb.keyId)) list = await verifierKeys(true);
    if (!(await verifySsv(cb, list))) return json({ error: 'bad_signature' }, 403);

    // From here on the callback is Google's: always answer 200 so it is not retried.
    const tx = cb.params.get('transaction_id') ?? '';
    const playerId = cb.params.get('user_id') ?? '';
    const reward = parseAdReward(cb.params.get('custom_data'));
    if (!tx || !UUID.test(playerId) || !reward) return json({ outcome: 'ignored' });
    const adUnit = cb.params.get('ad_unit');
    const config = await loadEconomyConfig();

    if (reward.kind === 'energy') {
      // A match or drill can change the wallet in between; retry on the version check.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: wallet, error } = await admin
          .from('wallets').select('energy, energy_updated_at, version').eq('player_id', playerId).maybeSingle();
        if (error) throw error;
        if (!wallet) return json({ outcome: 'ignored' });
        const now = Date.now();
        const cur = currentEnergy({ energy: wallet.energy, updatedAt: Date.parse(wallet.energy_updated_at) }, now, config);
        const energy = Math.min(config.energyMax, cur.energy + config.shop.adEnergy);
        const { data: outcome, error: applyError } = await admin.rpc('apply_ad_reward', {
          p_tx: tx, p_player: playerId, p_ad_unit: adUnit, p_kind: 'ad_energy', p_ref: null, p_limit: config.shop.adEnergyPerDay,
          p_expected_version: wallet.version, p_energy: energy,
          p_energy_updated_at: new Date(energy >= config.energyMax ? now : cur.updatedAt).toISOString(), p_coin: 0,
        });
        if (applyError?.code === '40001') continue;
        if (applyError) throw applyError;
        return json({ outcome });
      }
      throw new Error('ad energy: wallet kept changing');
    }

    // Coin ×2: only an energy match of this player, finished in the last few minutes.
    const [{ data: match, error: matchError }, { data: earnedToday, error: earnedError }, { data: contract, error: contractError }] =
      await Promise.all([
        admin.from('matches').select('id, player_id, kind, status, coin_reward, finished_at').eq('id', reward.matchId).maybeSingle(),
        admin.rpc('match_coin_today', { p_player: playerId }),
        admin.from('contracts').select('tier, active').eq('player_id', playerId).maybeSingle(),
      ]);
    if (matchError || earnedError || contractError) throw matchError ?? earnedError ?? contractError;
    const windowMs = config.shop.adDoubleWindowMinutes * 60_000;
    if (!match || match.player_id !== playerId || match.kind !== 'energy' || match.status !== 'finished'
      || !match.finished_at || Date.now() - Date.parse(match.finished_at) > windowMs) {
      return json({ outcome: 'ignored' });
    }
    const multiplier = contract?.active ? config.career.tiers[contract.tier]!.coinMultiplierX100 : 100;
    const coin = adDoubleCoin(match.coin_reward ?? 0, Number(earnedToday), config, multiplier);
    const { data: outcome, error } = await admin.rpc('apply_ad_reward', {
      p_tx: tx, p_player: playerId, p_ad_unit: adUnit, p_kind: 'ad_double', p_ref: match.id, p_limit: config.shop.adDoublePerDay,
      p_expected_version: null, p_energy: null, p_energy_updated_at: null, p_coin: coin,
    });
    if (error) throw error;
    return json({ outcome, coin: outcome === 'ok' ? coin : 0 });
  } catch (err) {
    console.error(err);
    return json({ error: 'internal' }, 500);
  }
});
