import { DEFAULT_CONFIG, halisahaPayout, lifeBuyCheck, lifeShowcase, type LifestyleItem } from '@streetborn/economy';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { sfx } from '../../audio/audio.ts';
import { num } from '../../game/format.ts';
import { useGame } from '../../game/store.ts';
import { t, type Key } from '../../i18n/index.ts';
import { colors, radius, TAB_BAR_SPACE } from '../../theme.ts';
import { CurrencyFly, type Point } from '../../ui/fly.tsx';
import { HintBubble } from '../../ui/hint.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { buzz, Caps, Cta, Ghost, H1, H3, T } from '../../ui/kit.tsx';
import { PressableScale, useReduceMotion } from '../../ui/motion.tsx';
import { closeSheet, openSheet, SheetText, Spinner, toast } from '../../ui/overlay.tsx';
import { Amount, Ico, Tile } from '../../ui/sade.tsx';
import { LIFE_ICON } from '../../ui/yasam.tsx';

// Yaşam: the house, ride and land the player buys with coin and shows off (GDD v3.1 section 8.1;
// Kaan 2026-11-08 "Şimdi aç + vitrin"). Status only: no match, stat or energy effect. The items
// show on the player's profile, their mahalle card and at kick-off. The halısaha pays coin each
// day, collected here. The server holds the prices and does the buying (shop function).

const LIFE = DEFAULT_CONFIG.lifestyle;
const ITEMS = LIFE.items.filter(i => LIFE_ICON[i.id]);
const name = (i: LifestyleItem) => t(`life.${i.id}` as Key);

type Host = ComponentRef<typeof View>;
const measure = (v: Host) => new Promise<{ x: number; y: number; w: number; h: number } | null>(res => v.measureInWindow((x, y, w, h) => res(w > 0 ? { x, y, w, h } : null)));

/** The Yaşam ids among the items the player owns. */
const useBought = () => {
  const owned = useGame(s => s.owned);
  return owned.filter(o => LIFE_ICON[o.id]).map(o => o.id);
};

export default function Yasam() {
  const insets = useSafeAreaInsets();
  const still = useReduceMotion();
  const coins = useGame(s => s.coins);
  const level = useGame(s => s.level);
  const online = useGame(s => s.mode === 'online');
  const halisahaDays = useGame(s => s.halisahaDays);
  const bought = useBought();
  const show = lifeShowcase(bought, LIFE);
  const owns = (i: LifestyleItem) => bought.includes(i.id) || (i.price === 0 && level >= i.unlockLevel);
  const home = ITEMS.find(i => i.id === show.ev)!;
  const ride = ITEMS.find(i => i.id === show.ulasim);
  const next = ITEMS.find(i => !owns(i));
  const income = bought.includes('halisaha') ? halisahaPayout(halisahaDays, LIFE) : null;

  // The shop read carries the items and the halısaha days; fresh each time the tab opens.
  useFocusEffect(useCallback(() => { void useGame.getState().refreshShop(); }, []));

  // Collected coins fly from the halısaha card into the coin pill; the pill counts up as they land.
  const root = useRef<Host>(null);
  const pill = useRef<Host>(null);
  const pitch = useRef<Host>(null);
  const [fly, setFly] = useState<{ id: number; from: Point; to: Point; gain: number; before: number } | null>(null);
  const [landed, setLanded] = useState(0);
  const FLY = 6;
  const shownCoins = fly ? fly.before + Math.round((fly.gain * landed) / FLY) : coins;

  async function collect() {
    const before = useGame.getState().coins;
    const paid = await useGame.getState().claimHalisaha();
    if (paid === null) { toast(t('life.claimFailed'), 'error'); return; }
    if (paid <= 0) return;
    const boxes = !still && root.current && pill.current && pitch.current
      ? await Promise.all([measure(root.current), measure(pitch.current), measure(pill.current)]) : null;
    if (!boxes || boxes.some(b => !b)) { sfx('coin_count'); buzz('success'); toast(t('life.claimed', { n: num(paid) }), 'success'); return; }
    const [r, a, b] = boxes as { x: number; y: number; w: number; h: number }[];
    setLanded(0);
    setFly({
      id: Date.now(), gain: paid, before,
      from: { x: a!.x - r!.x + a!.w - 56, y: a!.y - r!.y + a!.h / 2 },
      to: { x: b!.x - r!.x + 26, y: b!.y - r!.y + b!.h / 2 },
    });
  }
  const coinLanded = (n: number) => {
    buzz('light'); setLanded(n);
    if (n < FLY) return;
    sfx('coin_count'); buzz('success');
    setTimeout(() => { setFly(null); setLanded(0); }, 600);
  };

  function open(i: LifestyleItem) {
    const s = useGame.getState();
    const check = owns(i) ? 'owned' : lifeBuyCheck(i.id, { level: s.level, coins: s.coins, bought }, LIFE);
    const locked = check === 'locked';
    const status =
      check === 'owned' ? t('life.ownedText')
        : !online ? t('life.offlineText')
          : check === 'locked' ? t('life.lockedText', { n: i.unlockLevel })
            : check === 'needs' ? t('life.needsText')
              : check === 'no_coin' ? t('life.noCoinText', { n: num(i.price - s.coins) })
                : t('life.afterText', { n: num(s.coins - i.price) });
    openSheet(
      <>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Ico name={LIFE_ICON[i.id]!} size={136} />
          <H3>{name(i)}</H3>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
          {i.price > 0 && check !== 'owned' && <Amount icon="coin" size={26} textSize={18}>{num(i.price)}</Amount>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name={locked ? 'lock' : 'check'} size={18} color={locked ? colors.g200 : colors.l600} />
            <T w={600} size={18} color={locked ? colors.g200 : colors.l600}>{t('life.level', { n: i.unlockLevel })}</T>
          </View>
        </View>
        {i.id === 'halisaha' && <SheetText>{t('life.halisahaIncome', { n: LIFE.halisahaIncomePerDay, d: LIFE.halisahaMaxAccrualDays })}</SheetText>}
        <SheetText>{status}</SheetText>
        {online && check === 'ok' ? (
          <>
            <Cta onPress={() => void buy(i)}>{t('life.buy', { n: num(i.price) })}</Cta>
            <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
          </>
        ) : <Cta onPress={closeSheet}>{t('common.ok')}</Cta>}
      </>,
    );
  }

  async function buy(i: LifestyleItem) {
    openSheet(<><H3>{name(i)}</H3><Spinner /></>);
    const r = await useGame.getState().buyLife(i.id);
    if (r !== 'ok' && r !== 'owned') {
      closeSheet();
      toast(t(r === 'no_coin' ? 'life.noCoin' : r === 'needs' ? 'life.needs' : r === 'locked' ? 'life.locked' : 'life.buyFailed'), 'error');
      return;
    }
    sfx('unlock'); buzz('success');
    openSheet(
      <>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Glow size={168}><Ico name={LIFE_ICON[i.id]!} size={160} /></Glow>
          <H3 color={colors.l600}>{t('life.boughtTitle', { name: name(i) })}</H3>
        </View>
        <SheetText>{i.id === 'halisaha' ? t('life.boughtHalisaha', { n: LIFE.halisahaIncomePerDay }) : t('life.boughtText')}</SheetText>
        <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
      </>,
    );
  }

  return (
    <View ref={root} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <H1>{t('tab.life')}</H1>
          <View ref={pill} accessibilityLabel={`${num(coins)} coin`} style={{ height: 40, paddingLeft: 8, paddingRight: 12, borderRadius: 20, backgroundColor: colors.s2, justifyContent: 'center' }}>
            <Amount icon="coin" size={26}>{num(shownCoins)}</Amount>
          </View>
        </View>
        <HintBubble id="lifeTab" text={t('hint.lifeTab')} />

        <Showcase home={home} ride={ride} next={next} level={level} onPress={() => open(home)} />

        {income !== null && (
          <View ref={pitch} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingLeft: 12, paddingRight: 12, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}>
            <Ico name="halisaha" size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <T w={600} size={16}>{t('life.pitchTitle')}</T>
              <T size={13} color={colors.g200}>
                {income > 0 ? t('life.pitchReady', { n: num(income) }) : t('life.pitchTomorrow', { n: LIFE.halisahaIncomePerDay })}
              </T>
            </View>
            {income > 0 && (
              <Cta onPress={() => void collect()} disabled={!!fly} style={{ minHeight: 44, paddingHorizontal: 16 }}
                accessibilityLabel={t('life.collectLabel', { n: num(income) })}>
                {t('life.collect')}
              </Cta>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ITEMS.map(i => {
            const mine = owns(i);
            const locked = level < i.unlockLevel;
            const needs = !mine && !locked && !!i.requires && !bought.includes(i.requires);
            const short = !mine && !locked && !needs && coins < i.price;
            return (
              <Tile
                key={i.id} onPress={() => open(i)} style={{ width: '48%', flexGrow: 1, minHeight: 152, gap: 4 }}
                label={`${name(i)}, ${mine ? t('life.owned') : locked ? t('life.level', { n: i.unlockLevel }) : needs ? t('life.needsShort') : `${num(i.price)} coin`}`}
              >
                <Ico name={LIFE_ICON[i.id]!} size={88} dim={locked} />
                <T w={600} size={15} color={locked ? colors.g200 : colors.g100} numberOfLines={1} style={{ marginTop: 4 }}>{name(i)}</T>
                {mine ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="check" size={16} color={colors.l600} />
                    <T w={500} size={13} color={colors.l600}>{t('life.owned')}</T>
                  </View>
                ) : locked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="lock" size={14} color={colors.g200} />
                    <T w={500} size={13} color={colors.g200}>{t('life.level', { n: i.unlockLevel })}</T>
                  </View>
                ) : needs ? (
                  <T w={500} size={13} color={colors.g200}>{t('life.needsShort')}</T>
                ) : (
                  <Amount icon="coin" size={16} textSize={13} color={short ? colors.g300 : colors.g100}>{num(i.price)}</Amount>
                )}
              </Tile>
            );
          })}
        </View>
      </ScrollView>
      {fly && (
        <CurrencyFly key={fly.id} icon="coin" from={fly.from} to={fly.to} count={FLY} size={22} onLanded={coinLanded} />
      )}
    </View>
  );
}

/** A soft lime floor glow under a picture (the showcase and the "it's yours" sheet). */
function Glow({ size, children }: { size: number; children: ReactNode }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size / 4} style={{ position: 'absolute', bottom: 4 }}>
        <Defs>
          <RadialGradient id={`glow${size}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={colors.l600} stopOpacity={0.28} />
            <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={size / 2} cy={size / 8} rx={size / 2} ry={size / 8} fill={`url(#glow${size})`} />
      </Svg>
      {children}
    </View>
  );
}

/**
 * The screen's one lit card: the player's home on a lime floor glow, their ride, and the next
 * item to aim for. Status only, like the rest of Yaşam.
 */
function Showcase({ home, ride, next, level, onPress }: { home: LifestyleItem; ride: LifestyleItem | undefined; next: LifestyleItem | undefined; level: number; onPress: () => void }) {
  const nextLocked = !!next && level < next.unlockLevel;
  return (
    <PressableScale
      accessibilityRole="button" onPress={onPress} to={0.98}
      accessibilityLabel={`${t('life.home')}: ${name(home)}${ride ? `. ${t('life.ride')}: ${name(ride)}` : ''}${next ? `. ${t('life.next')}: ${name(next)}` : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 168, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}
    >
      <View>
        <Glow size={148}><Ico name={LIFE_ICON[home.id]!} size={140} /></Glow>
        {ride && <Ico name={LIFE_ICON[ride.id]!} size={64} style={{ position: 'absolute', right: -12, bottom: 0 }} />}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Caps>{t('life.home')}</Caps>
        <T w={600} size={22}>{name(home)}</T>
        {ride && <T w={500} size={15} color={colors.g200}>{name(ride)}</T>}
        {next && <>
          <Caps style={{ marginTop: 12 }}>{t('life.next')}</Caps>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {nextLocked
              ? <><Icon name="lock" size={14} color={colors.g200} /><T w={600} size={15}>{name(next)} · {t('life.level', { n: next.unlockLevel })}</T></>
              : <><Amount icon="coin" size={18} textSize={15}>{num(next.price)}</Amount><T w={600} size={15}>· {name(next)}</T></>}
          </View>
        </>}
      </View>
    </PressableScale>
  );
}
