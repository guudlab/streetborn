import {
  computeRating, currentEnergy, DEFAULT_CONFIG, levelForXp, matchReward,
} from '@streetborn/economy';
import {
  ENGINE_VERSION, planMatch, playChance, simulateMatch, skippedDefense,
  type ChanceInput, type ChanceOutcome, type MatchPlan, type MatchSetup, type MomentKind, type TeamResult,
} from '@streetborn/engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  ApiError, blockPlayer, cheerMate, createMahalle as apiCreateMahalle, finishMatch as apiFinish, joinMahalleByCode, joinMahalleById, leaveMahalle as apiLeaveMahalle,
  acceptOffer as apiAcceptOffer, buyItem as apiBuyItem, careerStatus, equipItem, loadShopToday, refillEnergy, loadTrainingToday, trainDrill, trainPrivate, loadBlocked, loadCareer, loadMahalle, loadMahalleToday, loadProfile, reportPlayer, unblockPlayer, saveProfile, startMatch as apiStart, storedPlayerId, kariyerDurum, kariyerMasaj, kariyerSec, deleteAccount as apiDeleteAccount,
  type MahalleColor, type MahalleEmblem, type MahalleInfo, type MahalleToday, type MatchKind, type ServerStat, type TrainResponse, type Profile, type ReportReason, type Career, type CatalogItem, type Choice, type GemGrant, type InjuryKind, type Kariyer, type OwnedItem,
} from '../net/api.ts';
import { loadAccount, signOutAll, type Account } from '../net/auth.ts';
import { offline } from '../net/config.ts';
import { DEFAULT_CHARACTER, NICK_MIN, type Character } from './character.ts';
import { clamp, gradeDrill, OFFERS, type StatKey, type Stats } from './rules.ts';
import { t } from '../i18n/index.ts';

// Player state for the Concept A screens.
// Online (default): level, XP, coin, gem, energy and skills come from Supabase,
// and every match is started and scored by the server (match-start/finish).
// Local: when the server can't be reached, the same engine and economy code
// runs on the device and nothing is saved.
// Rewarded ads and gem packs are still local (they need the native SDKs).

const config = DEFAULT_CONFIG;
const REGEN_MS = config.energyRegenSeconds * 1000;

export type Mode = 'loading' | 'online' | 'local';
/** `none`: show the sign-in screen. `in`: the player pressed Başla (or had a session). */
export type Auth = 'unknown' | 'none' | 'in';

export interface LogEntry { minute: number; kind: MomentKind; outcome: ChanceOutcome['outcome'] }

export interface PostMatch {
  kind: MatchKind;
  /** League matches show coach trust instead of the local trust bar. */
  coachTrust: boolean;
  /** Trial matches: whether the club signs the player. */
  trialPassed?: boolean;
  result: TeamResult; us: number; them: number; rating: number; goals: number; assists: number;
  coins: number; xp: number; trustDelta: number; ups: number; scout: boolean; flagged: boolean;
  log: LogEntry[];
  /** The player's very first match: the result screen also offers to link an account. */
  first: boolean;
  /** Morale, a possible injury and achievements from this match (online). */
  kariyer: { morale: number; injury: { days: number; kind: InjuryKind } | null; unlocked: { key: string; coin: number }[] } | null;
  before: { level: number; xp: number; trust: number };
  after: { level: number; xp: number; trust: number };
}

export interface LiveMatch {
  kind: MatchKind;
  /** NPC opponent of a fixture match (league, trial, mahalle). */
  opponentName: string | null;
  matchId: string | null;
  setup: MatchSetup;
  plan: MatchPlan;
  /** Index of the moment being played (attacking chances and defense moments). */
  i: number;
  inputs: ChanceInput[];
  outcomes: (ChanceOutcome | null)[];
  startedAt: number;
}

export interface TrainResult {
  key: StatKey; grade: 'mukemmel' | 'iyi' | 'kacti' | 'ozel'; xp: number; ups: number; statUp: number;
  before: number; after: number; progress: number;
  /** Coin paid for a private session. */
  coin: number;
}

const SERVER_STAT: Record<StatKey, ServerStat> = { sut: 'shooting', pas: 'passing', hiz: 'pace', fizik: 'stamina' };
const GRADE_TR = { perfect: 'mukemmel', good: 'iyi', miss: 'kacti' } as const;

interface GameState {
  mode: Mode;
  auth: Auth;
  /** Why the app fell back to local mode, for the banner. */
  offlineReason: string | null;
  name: string; club: string; level: number; xp: number; coins: number; gems: number;
  energy: number; energyMax: number; energyUpdatedAt: number;
  /** Choices from the new-player flow. Null for a player who started before the flow existed. */
  character: Character | null;
  /** True until the first match is finished: the coach teaches the first moment. */
  tutorial: boolean;
  /** The player's mahalle (friend group), or null before they pick one. */
  mahalle: MahalleInfo | null;
  /** False until the first answer about the mahalle (cached or from the server). */
  mahalleReady: boolean;
  /** Today's mahalle match: live contributions and the last settled day. Null until loaded or without a mahalle. */
  mahalleToday: MahalleToday | null;
  /** Ids of players this player blocked; their names and cheers are hidden. */
  blocked: string[];
  /** Club career from the server (online only). */
  career: Career | null;
  /** The first career/kariyer request has answered (or failed): loading placeholders stop. */
  careerTried: boolean;
  kariyerTried: boolean;
  /** Whether the player linked an email, Google or Apple (online, loaded on demand). */
  account: Account | null;
  /** Form, morale, injury, the day's choice, achievements and the weekly duel (online). */
  kariyer: Kariyer | null;
  /** Salary, season result or gems from the last career refresh, shown once by the hub. */
  careerNews: { salary: number; seasonEnded: { place: number; prize: number } | null; gems: GemGrant | null } | null;
  /** The season that just ended; the hub opens the summary screen once and clears it. */
  seasonSummary: { place: number; prize: number } | null;
  /** Duels settled and achievements unlocked since the last visit, shown once by the hub. */
  kariyerNews: { settled: Kariyer['settled']; unlocked: Kariyer['unlocked'] } | null;
  /** Invite code from a link, kept until the player joins or picks another mahalle. */
  pendingInvite: string | null;
  stats: Stats; drillProgress: Stats; trainFree: number;
  /** Private sessions left today (online). */
  privateLeft: number; trust: number; form: number[];
  scouted: boolean; signed: string | null; trialAccepted: boolean; adsLeft: number; assisted: boolean;
  /** Gem refills left today. */
  refillsLeft: number;
  /** Items the player owns and the price list (online). */
  owned: OwnedItem[];
  catalog: CatalogItem[];
  match: LiveMatch | null;
  post: PostMatch | null;

  init(): Promise<void>;
  /** Signs in anonymously and loads the player; falls back to local play when the server is out of reach. */
  startAnonymous(): Promise<void>;
  /** Loads the player after a sign-in to an existing account (the session changed). */
  signedIn(): Promise<void>;
  refreshAccount(): Promise<void>;
  /** Saves the new player's choices and nickname (on the device and on the server). Throws ApiError `nick_*` when the server refuses the name. */
  createCharacter(c: Character, nick: string): Promise<void>;
  refreshMahalle(): Promise<void>;
  refreshMahalleToday(): Promise<void>;
  cheer(to: string, phrase: number): Promise<void>;
  report(to: string, reason: ReportReason): Promise<void>;
  setBlocked(to: string, blocked: boolean): Promise<void>;
  createMahalle(name: string, emblem: MahalleEmblem, color: MahalleColor, open: boolean): Promise<void>;
  joinMahalle(target: { code: string } | { id: string }): Promise<void>;
  leaveMahalle(): Promise<void>;
  setPendingInvite(code: string | null): void;
  syncEnergy(now?: number): void;
  startMatch(kind?: MatchKind, offerId?: string): Promise<'ok' | 'no_energy' | 'already_played' | 'injured' | 'error'>;
  refreshKariyer(): Promise<void>;
  /** The day's pre-match choice. */
  choose(choice: Choice): Promise<'ok' | 'already_chosen' | 'error'>;
  /** Ends an injury for coin. */
  massage(): Promise<'ok' | 'no_coin' | 'not_injured' | 'error'>;
  /** Signs out of this device and goes back to the sign-in screen. */
  signOut(): Promise<void>;
  /** Deletes the account on the server for good, then signs out. */
  deleteAccount(): Promise<void>;
  /** Clears the saved profile and caches and returns to the signed-out state. */
  forget(): Promise<void>;
  refreshCareer(): Promise<void>;
  acceptOffer(id: string): Promise<void>;
  play(input: ChanceInput): ChanceOutcome;
  /** A defense moment the player let pass: shows the engine's outcome, records no input. */
  skip(chance: number): void;
  /** Moves to the next moment; returns the opponent goals scored in between. */
  advance(): { done: boolean; events: { minute: number }[] };
  finishMatch(): Promise<PostMatch>;
  /** A timing drill. Online the server grades it and pays AP; offline it stays local. */
  train(key: StatKey, q: number, durationMs: number): Promise<TrainResult | 'no_energy' | null>;
  /** A coin-paid private session (online only). */
  privateTrain(key: StatKey): Promise<TrainResult | 'no_coin' | 'limit' | null>;
  refreshTraining(): Promise<void>;
  sign(id: string): void;
  acceptTrial(): void;
  watchAd(): boolean;
  /** Fills energy for gems (twice a day). */
  gemRefill(): Promise<'ok' | 'no_gem' | 'limit' | 'full' | 'error'>;
  refreshShop(): Promise<void>;
  buyItem(id: string): Promise<'ok' | 'no_gem' | 'no_coin' | 'owned' | 'error'>;
  equip(id: string, on: boolean): Promise<void>;
  setAssisted(v: boolean): void;
}

/** Team score so far: the player's goals and assists, and the opponent goals before `minute`. */
export function liveScore(m: LiveMatch, minute: number) {
  let us = 0, conceded = 0;
  for (const o of m.outcomes) {
    if (!o) continue;
    if (o.kind === 'defense') { if (o.outcome === 'conceded') conceded++; }
    else if (o.outcome === 'goal' || o.outcome === 'assist') us++;
  }
  return { us, them: m.plan.opponentGoals.filter(g => g < minute).length + conceded };
}

const CONNECT_TIMEOUT_MS = 8000;

// The last profile the server sent, so a returning player sees the hub at once
// while the fresh one loads. Display only: the server still decides every change.
const PROFILE_KEY = 'streetborn.profile.v1';
// The new-player choices. Kept on the device until the server stores them.
const CHARACTER_KEY = 'streetborn.character.v1';
// Last mahalle the server sent (display only) and an invite code waiting to be used.
const MAHALLE_KEY = 'streetborn.mahalle.v1';
const INVITE_KEY = 'streetborn.invite.v1';
// Last career screens the server sent (form, duel, trophies, club). Display only, like the
// profile: the hub shows them at once instead of filling in a second later.
const KARIYER_KEY = 'streetborn.kariyer.v1';

interface SavedCharacter { name: string; character: Character; tutorial: boolean }

function saveCharacter(s: Pick<GameState, 'name' | 'character' | 'tutorial'>) {
  if (!s.character) return;
  const v: SavedCharacter = { name: s.name, character: s.character, tutorial: s.tutorial };
  void AsyncStorage.setItem(CHARACTER_KEY, JSON.stringify(v)).catch(() => {});
}

async function restoreCharacter() {
  try {
    const raw = await AsyncStorage.getItem(CHARACTER_KEY);
    const v = raw ? (JSON.parse(raw) as SavedCharacter) : null;
    if (v?.character && typeof v.name === 'string') useGame.setState({ name: v.name, character: { ...DEFAULT_CHARACTER, ...v.character }, tutorial: !!v.tutorial });
  } catch { /* a missing or unreadable save keeps the sample player */ }
}

async function restoreInvite() {
  try {
    const code = await AsyncStorage.getItem(INVITE_KEY);
    if (code && /^[A-Za-z0-9]{6}$/.test(code)) useGame.setState({ pendingInvite: code.toUpperCase() });
  } catch { /* no saved invite */ }
}

async function cachedMahalle(playerId: string): Promise<MahalleInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(MAHALLE_KEY);
    const v = raw ? (JSON.parse(raw) as { playerId: string; mahalle: MahalleInfo }) : null;
    return v?.playerId === playerId ? v.mahalle : null;
  } catch {
    return null;
  }
}

interface SavedKariyer { playerId: string; kariyer: Kariyer | null; career: Career | null }

async function restoreKariyer(playerId: string) {
  try {
    const raw = await AsyncStorage.getItem(KARIYER_KEY);
    const v = raw ? (JSON.parse(raw) as SavedKariyer) : null;
    if (v?.playerId !== playerId) return;
    // An injury that ran out while the app was closed is not shown again.
    const k = v.kariyer && v.kariyer.injury && v.kariyer.injury.until <= Date.now() ? { ...v.kariyer, injury: null } : v.kariyer;
    useGame.setState(s => ({ kariyer: s.kariyer ?? k, career: s.career ?? v.career }));
  } catch { /* no saved career */ }
}

async function saveKariyer() {
  const playerId = await storedPlayerId().catch(() => null);
  if (!playerId) return;
  const { kariyer, career } = useGame.getState();
  const v: SavedKariyer = { playerId, kariyer, career };
  void AsyncStorage.setItem(KARIYER_KEY, JSON.stringify(v)).catch(() => {});
}

function showProfile(p: Profile, fromServer = false) {
  // A player signing in on a new device gets the character saved on the server.
  if (p.character && p.nick && (fromServer || !useGame.getState().character)) {
    useGame.setState({ name: p.nick, character: { ...DEFAULT_CHARACTER, ...p.character }, tutorial: false });
    saveCharacter(useGame.getState());
  }
  useGame.setState({
    level: p.level, xp: p.xp, coins: p.coin, gems: p.gem,
    energy: p.energy, energyUpdatedAt: p.energyUpdatedAt,
    stats: { sut: p.stats.shooting, pas: p.stats.passing, hiz: p.stats.pace, fizik: p.stats.stamina },
    drillProgress: p.ap
      ? { sut: p.ap.shooting, pas: p.ap.passing, hiz: p.ap.pace, fizik: p.ap.stamina }
      : { sut: 0, pas: 0, hiz: 0, fizik: 0 },
    form: [],
  });
  useGame.getState().syncEnergy();
}

async function cachedProfile(playerId: string): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    const p = raw ? (JSON.parse(raw) as Profile) : null;
    return p?.playerId === playerId ? p : null;
  } catch {
    return null;
  }
}

/** Loads the player from Supabase (signing in anonymously if needed), or switches to local mode. */
async function connect(fromServer = false) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ApiError('timeout')), CONNECT_TIMEOUT_MS); });
    const p = await Promise.race([loadProfile(), timeout]);
    useGame.setState({ mode: 'online', offlineReason: null });
    showProfile(p, fromServer);
    void AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p)).catch(() => {});
  } catch (e) {
    console.warn('Supabase unavailable, playing locally', e);
    const slow = e instanceof ApiError && e.code === 'timeout';
    useGame.setState({ mode: 'local', offlineReason: slow ? t('offline.timeout') : t('offline.unreachable') });
  } finally {
    clearTimeout(timer);
  }
}

const randomSeed = () => Math.floor(Math.random() * 0x100000000) >>> 0;

export const useGame = create<GameState>()((set, get) => ({
  mode: 'loading',
  auth: 'unknown',
  offlineReason: null,
  // Sample character from the prototype, used in local mode.
  name: 'Efe Yılmaz',
  character: null,
  tutorial: false,
  mahalle: null,
  mahalleReady: false,
  mahalleToday: null,
  blocked: [],
  career: null,
  careerTried: false,
  kariyerTried: false,
  kariyer: null,
  account: null,
  careerNews: null,
  kariyerNews: null,
  seasonSummary: null,
  pendingInvite: null,
  club: t('club.home'),
  level: 7,
  xp: 3100,
  coins: 1240,
  gems: 30,
  energy: 4,
  energyMax: config.energyMax,
  energyUpdatedAt: Date.now() - REGEN_MS / 3,
  stats: { sut: 52, pas: 47, hiz: 58, fizik: 44 },
  drillProgress: { sut: 1, pas: 0, hiz: 2, fizik: 0 },
  trainFree: 3,
  privateLeft: 0,
  trust: 62,
  form: [6.8, 7.4, 5.9],
  scouted: false,
  signed: null,
  trialAccepted: false,
  adsLeft: 2,
  refillsLeft: config.shop.refillsPerDay,
  owned: [],
  catalog: [],
  assisted: false,
  match: null,
  post: null,

  async init() {
    await restoreInvite();
    if (offline) { set({ mode: 'local', offlineReason: t('offline.mode'), auth: 'none', mahalleReady: true }); return; }
    // A returning player goes straight to the hub; a new one sees the sign-in screen first.
    const playerId = await storedPlayerId().catch(() => null);
    if (playerId) await restoreCharacter();
    if (!playerId) { set({ mode: 'online', auth: 'none' }); return; }
    // With a saved profile the hub shows at once and refreshes when the server answers.
    const cached = await cachedProfile(playerId);
    if (cached) {
      const mahalle = await cachedMahalle(playerId);
      await restoreKariyer(playerId);
      set({ mode: 'online', auth: 'in', mahalle, mahalleReady: mahalle !== null });
      showProfile(cached);
      void connect().then(() => get().refreshMahalle());
      return;
    }
    await restoreKariyer(playerId);
    await connect();
    await get().refreshMahalle();
    set({ auth: 'in' });
  },

  async startAnonymous() {
    if (get().mode !== 'local') await connect();
    await get().refreshMahalle();
    set({ auth: 'in' });
  },

  async signedIn() {
    // Whatever was cached belonged to the session before; the server has the truth.
    set({ mahalle: null, mahalleReady: false, mahalleToday: null, career: null, kariyer: null, careerTried: false, kariyerTried: false, account: null, owned: [], character: null });
    await connect(true);
    await get().refreshMahalle();
    set({ auth: 'in' });
    void get().refreshAccount();
  },

  async refreshAccount() {
    if (get().mode !== 'online') return;
    try {
      set({ account: await loadAccount() });
    } catch (e) {
      console.warn('Could not load the account', e);
    }
  },

  async createCharacter(c, nick) {
    const name = nick.trim().slice(0, 14);
    if (name.length < NICK_MIN) return;
    // The server checks the name too; a network failure keeps the choices on the device.
    if (get().mode === 'online') {
      try { await saveProfile(name, c); } catch (e) { if (e instanceof ApiError && e.code.startsWith('nick_')) throw e; }
    }
    set({ name, character: c, tutorial: true });
    saveCharacter(get());
    void get().refreshMahalle();
  },

  async refreshMahalle() {
    if (get().mode === 'local') { set({ mahalleReady: true }); return; }
    try {
      const m = await loadMahalle();
      set({ mahalle: m, mahalleReady: true });
      if (m) void loadBlocked().then(blocked => set({ blocked }), () => {});
      const playerId = await storedPlayerId().catch(() => null);
      if (m && playerId) void AsyncStorage.setItem(MAHALLE_KEY, JSON.stringify({ playerId, mahalle: m })).catch(() => {});
      else void AsyncStorage.removeItem(MAHALLE_KEY).catch(() => {});
    } catch (e) {
      console.warn('Could not load the mahalle', e);
      set({ mahalleReady: true });
    }
  },

  async refreshMahalleToday() {
    if (get().mode !== 'online') return;
    try {
      set({ mahalleToday: await loadMahalleToday() });
    } catch (e) {
      console.warn('Could not load today\'s mahalle match', e);
    }
  },

  async cheer(to, phrase) {
    // The star lights at once; a refused cheer puts the card back.
    const before = get().mahalleToday;
    if (before) {
      set({ mahalleToday: {
        ...before,
        cheersLeft: Math.max(0, before.cheersLeft - 1),
        contributions: before.contributions.map(c => (c.playerId === to ? { ...c, cheered: true, cheers: c.cheers + 1 } : c)),
      } });
    }
    try { await cheerMate(to, phrase); } catch (e) { set({ mahalleToday: before }); throw e; }
    void get().refreshMahalleToday();
  },

  async refreshCareer() {
    if (get().mode !== 'online') return;
    try {
      const status = await careerStatus();
      const gems = status.gems && (status.gems.coin > 0 || status.gems.gem > 0) ? status.gems : null;
      if (status.salary > 0 || status.seasonEnded || gems) {
        set({ careerNews: { salary: status.salary, seasonEnded: status.seasonEnded, gems } });
        const profile = await loadProfile().catch(() => null);
        if (profile) set({ coins: profile.coin, gems: profile.gem });
      }
      set({ career: await loadCareer() });
      void saveKariyer();
    } catch (e) {
      console.warn('Could not load the career', e);
    } finally {
      set({ careerTried: true });
    }
  },

  async refreshKariyer() {
    if (get().mode !== 'online') return;
    try {
      const k = await kariyerDurum();
      set({ kariyer: k, coins: k.coin });
      void saveKariyer();
      // What happened since the last visit is shown once by the hub.
      if (k.settled.length > 0 || k.unlocked.length > 0) set({ kariyerNews: { settled: k.settled, unlocked: k.unlocked } });
    } catch (e) {
      console.warn('Could not load the career features', e);
    } finally {
      set({ kariyerTried: true });
    }
  },

  async choose(choice) {
    try {
      await kariyerSec(choice);
      await get().refreshKariyer();
      return 'ok';
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_chosen') { void get().refreshKariyer(); return 'already_chosen'; }
      console.warn('choice failed', e);
      return 'error';
    }
  },

  async massage() {
    try {
      const r = await kariyerMasaj();
      set({ coins: r.coin });
      await get().refreshKariyer();
      return 'ok';
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'no_coin' || e.code === 'not_injured')) {
        if (e.code === 'not_injured') void get().refreshKariyer();
        return e.code;
      }
      console.warn('massage failed', e);
      return 'error';
    }
  },

  async signOut() {
    await signOutAll();
    await get().forget();
  },

  async deleteAccount() {
    await apiDeleteAccount();
    // The user is gone on the server, so the sign-out call may be refused; the local
    // session goes either way.
    await signOutAll().catch(e => console.warn('sign out after delete', e));
    await get().forget();
  },

  async forget() {
    // The device forgets this player: the session, the saved profile and every local cache.
    await AsyncStorage.multiRemove([PROFILE_KEY, CHARACTER_KEY, MAHALLE_KEY, INVITE_KEY, KARIYER_KEY]).catch(() => {});
    set({
      auth: 'none', mode: 'online', offlineReason: null, name: 'Efe Yılmaz', character: null, tutorial: false,
      mahalle: null, mahalleReady: false, mahalleToday: null, blocked: [], career: null, kariyer: null, careerTried: false, kariyerTried: false, account: null,
      careerNews: null, kariyerNews: null, seasonSummary: null, pendingInvite: null, club: t('club.home'), level: 1, xp: 0, coins: 0, gems: 0,
      stats: { sut: 40, pas: 40, hiz: 40, fizik: 40 }, drillProgress: { sut: 0, pas: 0, hiz: 0, fizik: 0 }, form: [],
      owned: [], catalog: [], match: null, post: null,
    });
  },

  async acceptOffer(id) {
    await apiAcceptOffer(id);
    await get().refreshCareer();
    // The first contract pays gems; reload the wallet.
    const profile = await loadProfile().catch(() => null);
    if (profile) set({ coins: profile.coin, gems: profile.gem });
  },

  async report(to, reason) {
    await reportPlayer(to, reason);
  },

  async setBlocked(to, blocked) {
    await (blocked ? blockPlayer(to) : unblockPlayer(to));
    set({ blocked: blocked ? [...new Set([...get().blocked, to])] : get().blocked.filter(id => id !== to) });
  },

  async createMahalle(name, emblem, color, open) {
    await apiCreateMahalle(name, emblem, color, open);
    get().setPendingInvite(null);
    await get().refreshMahalle();
  },

  async joinMahalle(target) {
    if ('code' in target) await joinMahalleByCode(target.code); else await joinMahalleById(target.id);
    get().setPendingInvite(null);
    await get().refreshMahalle();
  },

  async leaveMahalle() {
    await apiLeaveMahalle();
    set({ mahalle: null });
    void AsyncStorage.removeItem(MAHALLE_KEY).catch(() => {});
  },

  setPendingInvite(code) {
    set({ pendingInvite: code });
    void (code ? AsyncStorage.setItem(INVITE_KEY, code) : AsyncStorage.removeItem(INVITE_KEY)).catch(() => {});
  },

  syncEnergy(now = Date.now()) {
    const s = get();
    const next = currentEnergy({ energy: s.energy, updatedAt: s.energyUpdatedAt }, now, config);
    if (next.energy !== s.energy || next.updatedAt !== s.energyUpdatedAt) set({ energy: next.energy, energyUpdatedAt: next.updatedAt });
  },

  async startMatch(kind = 'energy', offerId) {
    const s = get();
    s.syncEnergy();
    const cost = kind === 'energy' ? config.matchEnergyCost : config.fixtureEnergyCost;
    if (get().energy < cost) return 'no_energy';
    if (kind !== 'energy' && s.mode !== 'online') return 'error';
    let matchId: string | null = null;
    let opponentName: string | null = null;
    let setup: MatchSetup;
    if (s.mode === 'online') {
      try {
        const t = await apiStart(kind, offerId);
        matchId = t.matchId;
        opponentName = t.opponentName ?? null;
        setup = t.setup;
        set({ energy: t.energy.energy, energyUpdatedAt: t.energy.updatedAt });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'no_energy') { set({ energy: 0 }); return 'no_energy'; }
        if (e instanceof ApiError && e.code === 'injured') { void get().refreshKariyer(); return 'injured'; }
        if (e instanceof ApiError && (e.code === 'already_played' || e.code === 'season_over')) {
          void get().refreshCareer();
          return 'already_played';
        }
        console.warn('match-start failed', e);
        return 'error';
      }
    } else {
      setup = {
        engineVersion: ENGINE_VERSION, seed: randomSeed(), chances: config.matchChances,
        shooting: clamp(s.stats.sut, 1, 100), passing: clamp(s.stats.pas, 1, 100),
        opponentGoalkeeping: Math.min(95, 35 + s.level * 2), opponentAttack: Math.min(95, 30 + s.level * 2),
      };
      const wasFull = s.energy >= s.energyMax;
      set({ energy: s.energy - config.matchEnergyCost, energyUpdatedAt: wasFull ? Date.now() : s.energyUpdatedAt });
    }
    const plan = planMatch(setup);
    set({
      match: {
        kind, opponentName, matchId, setup, plan, i: 0, inputs: [],
        outcomes: plan.moments.map(() => null), startedAt: Date.now(),
      },
    });
    return 'ok';
  },

  play(input) {
    const m = get().match!;
    const outcome = playChance(m.setup, m.plan, input);
    const outcomes = m.outcomes.slice();
    outcomes[input.chance] = outcome;
    set({ match: { ...m, inputs: [...m.inputs, input], outcomes } });
    return outcome;
  },

  skip(chance) {
    const m = get().match!;
    if (m.plan.moments[chance]?.kind !== 'defense' || m.outcomes[chance]) return;
    const outcomes = m.outcomes.slice();
    outcomes[chance] = { kind: 'defense', outcome: skippedDefense(m.setup, chance) };
    set({ match: { ...m, outcomes } });
  },

  advance() {
    const m = get().match!;
    const from = m.plan.moments[m.i]!.minute;
    const i = m.i + 1;
    const done = i >= m.plan.moments.length;
    const to = done ? 91 : m.plan.moments[i]!.minute;
    set({ match: { ...m, i } });
    return { done, events: m.plan.opponentGoals.filter(g => g >= from && g < to).map(minute => ({ minute })) };
  },

  async finishMatch() {
    const s = get();
    const m = s.match!;
    const durationMs = Date.now() - m.startedAt;
    const log: LogEntry[] = m.inputs
      .map(inp => ({ minute: m.plan.moments[inp.chance]!.minute, kind: m.plan.moments[inp.chance]!.kind, outcome: m.outcomes[inp.chance]!.outcome }))
      .sort((a, b) => a.minute - b.minute);
    const before = { level: s.level, xp: s.xp, trust: s.trust };

    let sim, rating: number, coins: number, xpGain: number, after: { level: number; xp: number }, flagged = false;
    let coinBalance = s.coins;
    let server: { trustDelta?: number; trialPassed?: boolean; offersBefore: number; offersAfter: number } | null = null;
    let kariyer: PostMatch['kariyer'] = null;
    if (s.mode === 'online' && m.matchId) {
      const r = await apiFinish(m.matchId, m.inputs, durationMs);
      // The career may change after any match: league day, trial result, the first offers.
      const offersBefore = s.career?.offers.length ?? 0;
      await get().refreshCareer();
      server = { trustDelta: r.trustDelta, trialPassed: r.trialPassed, offersBefore, offersAfter: get().career?.offers.length ?? 0 };
      sim = r.result;
      rating = r.result.rating;
      coins = r.reward?.coin ?? 0;
      xpGain = r.reward?.xp ?? 0;
      flagged = r.flagged;
      after = { level: r.player.level, xp: r.player.xp };
      coinBalance = r.player.coin;
      kariyer = r.kariyer ?? null;
    } else {
      sim = simulateMatch(m.setup, m.inputs);
      rating = computeRating(sim);
      const reward = matchReward({ ...sim, rating }, false, 0, config);
      coins = reward.coin;
      xpGain = reward.xp;
      after = { level: levelForXp(s.xp + xpGain), xp: s.xp + xpGain };
      coinBalance = s.coins + coins;
    }

    const coachTrust = m.kind === 'league' && server?.trustDelta !== undefined;
    const trustDelta = coachTrust ? server!.trustDelta! : rating >= 70 ? 4 : rating >= 60 ? 1 : -3;
    const trust = coachTrust ? (get().career?.trust ?? 50) : clamp(s.trust + trustDelta, 0, 100);
    if (coachTrust) before.trust = clamp(trust - trustDelta, 0, 100);
    // Online, the scout report means the server has just sent the first offers.
    const scout = server ? server.offersBefore === 0 && server.offersAfter > 0 : rating >= 65;
    const post: PostMatch = {
      kind: m.kind, coachTrust, trialPassed: server?.trialPassed, result: sim.result, us: sim.us, them: sim.them, rating, goals: sim.goals, assists: sim.assists,
      coins, xp: xpGain, trustDelta, ups: Math.max(0, after.level - before.level), scout, flagged, log, first: s.tutorial, kariyer,
      before, after: { ...after, trust },
    };
    set({
      coins: coinBalance, level: after.level, xp: after.xp, trust: coachTrust ? s.trust : trust,
      form: [...s.form.slice(-2), rating / 10],
      scouted: s.scouted || scout,
      match: null, post, tutorial: false,
    });
    saveCharacter(get());
    if (m.kind === 'mahalle') void get().refreshMahalleToday();
    if (s.mode === 'online') void get().refreshKariyer();
    return post;
  },

  async train(key, q, durationMs) {
    const s = get();
    if (s.mode === 'online') {
      try {
        const r = await trainDrill(SERVER_STAT[key], Math.round(q * 100), Math.round(durationMs));
        return applyTraining(key, r);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'no_energy') { set({ energy: 0 }); return 'no_energy'; }
        console.warn('train failed', e);
        return null;
      }
    }
    let { trainFree, energy } = s;
    if (trainFree > 0) trainFree--;
    else if (energy > 0) energy--;
    else return 'no_energy';
    const g = gradeDrill(q);
    const xp = s.xp + g.xp;
    const level = Math.max(s.level, levelForXp(xp));
    let progress = s.drillProgress[key] + g.progress;
    let statUp = 0;
    if (progress >= 3) { progress -= 3; statUp = 1; }
    const before = s.stats[key];
    set({
      trainFree, energy, level, xp,
      drillProgress: { ...s.drillProgress, [key]: progress },
      stats: { ...s.stats, [key]: before + statUp },
    });
    return { key, grade: g.grade, xp: g.xp, ups: level - s.level, statUp, before, after: before + statUp, progress, coin: 0 };
  },

  async privateTrain(key) {
    if (get().mode !== 'online') return null;
    try {
      return applyTraining(key, await trainPrivate(SERVER_STAT[key]));
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'no_coin' || e.code === 'limit')) return e.code;
      console.warn('private training failed', e);
      return null;
    }
  },

  async refreshTraining() {
    if (get().mode !== 'online') return;
    try {
      const today = await loadTrainingToday();
      const tc = config.training;
      set({
        trainFree: Math.max(0, tc.freeDrillsPerDay - today.free),
        privateLeft: Math.max(0, tc.privateSessionsPerDay - today.private),
      });
    } catch (e) {
      console.warn('Could not load today\'s training', e);
    }
  },

  sign(id) { if (OFFERS.some(o => o.id === id)) set({ signed: id }); },
  acceptTrial() { set({ trialAccepted: true }); },

  watchAd() {
    const s = get();
    if (s.mode !== 'local' || s.adsLeft <= 0 || s.energy >= s.energyMax) return false;
    set({ adsLeft: s.adsLeft - 1, energy: s.energy + 1 });
    return true;
  },

  async gemRefill() {
    const s = get();
    s.syncEnergy();
    const sc = config.shop;
    if (get().energy >= s.energyMax) return 'full';
    if (s.refillsLeft <= 0) return 'limit';
    if (s.gems < sc.refillGem) return 'no_gem';
    if (s.mode !== 'online') {
      set({ gems: s.gems - sc.refillGem, energy: s.energyMax, energyUpdatedAt: Date.now(), refillsLeft: s.refillsLeft - 1 });
      return 'ok';
    }
    // Fill the bar at once; the server confirms in the background and a refusal rolls it back.
    const before = { gems: s.gems, energy: get().energy, energyUpdatedAt: get().energyUpdatedAt, refillsLeft: s.refillsLeft };
    set({ gems: s.gems - sc.refillGem, energy: s.energyMax, energyUpdatedAt: Date.now(), refillsLeft: s.refillsLeft - 1 });
    try {
      const r = await refillEnergy();
      set({ gems: r.gem, energy: r.energy.energy, energyUpdatedAt: r.energy.updatedAt });
      return 'ok';
    } catch (e) {
      set(before);
      if (e instanceof ApiError && (e.code === 'no_gem' || e.code === 'limit' || e.code === 'full')) {
        void get().refreshShop();
        return e.code;
      }
      console.warn('refill failed', e);
      return 'error';
    }
  },

  async refreshShop() {
    if (get().mode !== 'online') return;
    try {
      const today = await loadShopToday();
      set({ refillsLeft: Math.max(0, config.shop.refillsPerDay - today.refills), owned: today.items, catalog: today.catalog });
    } catch (e) {
      console.warn('Could not load the shop', e);
    }
  },

  async buyItem(id) {
    if (get().mode !== 'online') return 'error';
    try {
      const r = await apiBuyItem(id);
      set(r.currency === 'gem' ? { gems: r.balance } : { coins: r.balance });
      set({ owned: [...get().owned, { id, equipped: false }] });
      return 'ok';
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'no_gem' || e.code === 'no_coin' || e.code === 'owned')) {
        void get().refreshShop();
        return e.code;
      }
      console.warn('buy failed', e);
      return 'error';
    }
  },

  async equip(id, on) {
    // Shown at once; a failed save puts the old state back.
    const before = get().owned;
    set({ owned: before.map(o => (o.id === id ? { ...o, equipped: on } : o)) });
    try { await equipItem(id, on); } catch (e) { set({ owned: before }); throw e; }
    void get().refreshShop();
  },

  setAssisted(v) { set({ assisted: v }); },
}));

/** Writes a server training result into the store and shapes it for the result line. */
function applyTraining(key: StatKey, r: TrainResponse): TrainResult {
  const s = useGame.getState();
  useGame.setState({
    xp: r.player.xp, level: r.player.level, coins: r.player.coin,
    stats: { ...s.stats, [key]: r.stat.after },
    drillProgress: { ...s.drillProgress, [key]: r.stat.ap },
    ...(r.energy ? { energy: r.energy.energy, energyUpdatedAt: r.energy.updatedAt } : {}),
    ...(r.grade ? { trainFree: Math.max(0, s.trainFree - 1) } : { privateLeft: Math.max(0, s.privateLeft - 1) }),
  });
  return {
    key, grade: r.grade ? GRADE_TR[r.grade] : 'ozel', xp: r.xp, ups: r.player.level - s.level,
    statUp: r.stat.after - r.stat.before, before: r.stat.before, after: r.stat.after, progress: r.stat.ap, coin: r.coin,
  };
}
