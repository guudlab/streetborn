import { Image } from 'expo-image';
import { checkName } from '@streetborn/economy';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { setMusic } from '../audio/audio.ts';
import {
  cleanNick, DEFAULT_CHARACTER, DREAMS, HERO_IMAGE, HERO_MODEL, HERO_PORTRAIT, JERSEYS, jerseyTint, NICK_MAX, NICK_MIN, POSITIONS,
  STARTERS, TRAITS,
  type Character, type Dream, type Hero, type Jersey, type Position, type Trait,
} from '../game/character.ts';
import { useGame } from '../game/store.ts';
import { ApiError } from '../net/api.ts';
import { colors, MAX_FONT_SCALE } from '../theme.ts';
import { buzz, Cta, T, tap } from '../ui/kit.tsx';
import { Enter, PressableScale } from '../ui/motion.tsx';
import { Bubble, Ico, Segments, Tile, type IconAsset } from '../ui/sade.tsx';
import { Model3D, preloadModels } from '../ui/Model3D.tsx';
import { SetupBack, SetupBar } from '../ui/setup.tsx';
import { t, type Key } from '../i18n/index.ts';

// New-player flow, shown after the first tap on the sign-in screen:
// 0 Burak abi welcomes, 1-3 his three questions, 4 look (hero + jersey colour), 5 nickname.
// The choices stay on the device for now; the server still decides every number.

const BURAK = require('../../assets/meshy/burak.webp');
const BURAK_MODEL = require('../../assets/models/burak.glb');
const BURAK_FIDGET = { clips: ['wave'], seconds: 9 };
const LAST = 5;

const POS_ICON: Record<Position, IconAsset> = { bitirici: 'sut', oyunKurucu: 'pas', kanat: 'calim' };
const DREAM_ICON: Record<Dream, IconAsset> = { milli: 'milliForma', avrupa: 'cup', saha: 'halisaha' };
const TRAIT_EMOJI: Record<Trait, string> = { hirsli: '🔥', sakin: '🧊', caliskan: '🛠️', sovmen: '✨', lider: '👑', sert: '💥' };
const SUGGEST: Key[] = ['char.nick.s1', 'char.nick.s2', 'char.nick.s3', 'char.nick.s4', 'char.nick.s5', 'char.nick.s6'];

export default function Karakter() {
  const insets = useSafeAreaInsets();
  const createCharacter = useGame(s => s.createCharacter);
  const [step, setStep] = useState(0);
  const [c, setC] = useState<Character>(DEFAULT_CHARACTER);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMusic('menu'); preloadModels(STARTERS.map(h => HERO_MODEL[h])); }, []);
  // Android back goes one step back instead of leaving the flow.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      if (!busy) setStep(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step, busy]);

  const next = () => setStep(s => Math.min(LAST, s + 1));
  const back = () => { if (!busy) { setError(null); setStep(s => Math.max(0, s - 1)); } };
  async function finish() {
    if (busy || nick.trim().length < NICK_MIN) return;
    const problem = checkName(nick, 'nick');
    if (problem) { setError(t(`name.err.${problem}`)); return; }
    setBusy(true);
    try {
      await createCharacter(c, nick);
    } catch (e) {
      // The server's check can be stricter than the app's.
      const code = e instanceof ApiError ? e.code.replace(/^nick_/, '') : '';
      setError(t(`name.err.${code === 'too_short' || code === 'too_long' || code === 'bad_chars' ? code : 'blocked'}`));
    } finally { setBusy(false); }
  }

  const pad = { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 8 };

  if (step === 0) {
    return (
      <View style={[{ flex: 1, paddingHorizontal: 20, gap: 18 }, pad]}>
        <SetupBar />
        <View style={{ flex: 1, minHeight: 260 }}>
          <Glow width={260} />
          <Model3D model={BURAK_MODEL} fallback={BURAK} clip="idle" intro="wave" fidget={BURAK_FIDGET} headroom={0.12} style={{ flex: 1 }} label={t('coach.name')} />
        </View>
        <Enter i={2}><Bubble text={t('char.welcome.short')} size={48} /></Enter>
        <Cta onPress={() => { buzz(); next(); }}>{t('char.welcome.cta')}</Cta>
      </View>
    );
  }

  if (step === 4) {
    return (
      <View style={[{ flex: 1, paddingHorizontal: 20, gap: 14 }, pad]}>
        <Steps n={step} onBack={back} />
        <Look c={c} onChange={setC} />
        <Cta onPress={() => { buzz(); next(); }}>{t('common.continue')}</Cta>
      </View>
    );
  }

  return (
    // The nickname step: the keyboard pushes the button up instead of covering it (iOS).
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[{ flex: 1, paddingHorizontal: 20, gap: 16 }, pad]}>
      <Steps n={step} onBack={back} />
      {step === 5 ? (
        <Nick nick={nick} onChange={(s) => { setNick(s); setError(null); }} busy={busy} onDone={finish} error={error} />
      ) : (
        <Question step={step} c={c} onChange={setC} onNext={next} />
      )}
    </KeyboardAvoidingView>
  );
}

/* ---------- Steps ---------- */

function Steps({ n, onBack }: { n: number; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <SetupBack onPress={onBack} />
      <View accessible accessibilityLabel={t('char.step', { n })} style={{ flex: 1 }}><Segments n={n} of={LAST} /></View>
    </View>
  );
}

function Glow({ width }: { width: number }) {
  return (
    <Svg width={width} height={46} style={{ position: 'absolute', bottom: 6, alignSelf: 'center' }}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={colors.l600} stopOpacity={0.32} />
          <Stop offset="1" stopColor={colors.l600} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width / 2} cy={23} rx={width / 2} ry={23} fill="url(#glow)" />
    </Svg>
  );
}

/* ---------- Questions 1-3 ---------- */

function Question({ step, c, onChange, onNext }: { step: number; c: Character; onChange: (c: Character) => void; onNext: () => void }) {
  const title = step === 1 ? t('char.q1.title') : step === 2 ? t('char.q2.title') : t('char.q3.title');
  return (
    <>
      <Enter key={step}><Bubble text={title} size={48} /></Enter>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 10, paddingVertical: 2 }} showsVerticalScrollIndicator={false}>
        {step === 1 && POSITIONS.map((p, i) => (
          <Enter key={p} i={i + 1}>
            <Tile row role="radio" selected={c.position === p} label={`${t(`char.pos.${p}`)}, ${t(`char.pos.${p}.role`)}`} onPress={() => onChange({ ...c, position: p })} style={{ minHeight: 88 }}>
              <Ico name={POS_ICON[p]} size={60} />
              <T w={700} size={18} style={{ flex: 1 }}>{t(`char.pos.${p}`)}</T>
            </Tile>
          </Enter>
        ))}
        {step === 2 && (
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {TRAITS.map((k: Trait, i) => (
              <Enter key={k} i={i + 1} style={{ width: '48%', flexGrow: 1 }}>
                <Tile role="radio" selected={c.trait === k} label={t(`char.trait.${k}`)} onPress={() => onChange({ ...c, trait: k })} style={{ minHeight: 92 }}>
                  <T size={28} accessibilityElementsHidden importantForAccessibility="no">{TRAIT_EMOJI[k]}</T>
                  <T w={700} size={16}>{t(`char.trait.${k}`)}</T>
                </Tile>
              </Enter>
            ))}
          </View>
        )}
        {step === 3 && DREAMS.map((d, i) => (
          <Enter key={d} i={i + 1}>
            <Tile row role="radio" selected={c.dream === d} label={t(`char.dream.${d}`)} onPress={() => onChange({ ...c, dream: d })} style={{ minHeight: 88 }}>
              <Ico name={DREAM_ICON[d]} size={60} />
              <T w={700} size={18} style={{ flex: 1 }}>{t(`char.dream.${d}`)}</T>
            </Tile>
          </Enter>
        ))}
      </ScrollView>
      <Cta onPress={() => { buzz(); onNext(); }}>{t('common.continue')}</Cta>
    </>
  );
}

function Chip({ children, selected, onPress }: { children: string; selected: boolean; onPress: () => void }) {
  return (
    <Tile role="radio" selected={selected} label={children} onPress={onPress} style={{ width: '31%', flexGrow: 1, height: 48, paddingVertical: 0, borderRadius: 16 }}>
      <T w={700} size={15} color={selected ? colors.l500 : colors.g100}>{children}</T>
    </Tile>
  );
}

/* ---------- Look (hero + jersey colour) ---------- */

function Look({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  // Every new pick gets a little celebration from the 3D player.
  const [cheer, setCheer] = useState<{ name: string; key: number } | null>(null);
  const n = useRef(0);
  const celebrate = () => setCheer({ name: 'cheer', key: ++n.current });
  const pickHero = (hero: Hero) => { if (hero !== c.hero) { onChange({ ...c, hero }); celebrate(); } };
  const pickJersey = (jersey: Jersey) => { if (jersey !== c.jersey) { onChange({ ...c, jersey }); celebrate(); } };
  const name = (h: Hero) => t('char.look.hero', { n: STARTERS.indexOf(h) + 1 });
  return (
    <View style={{ flex: 1, minHeight: 360 }}>
      <Model3D
        model={HERO_MODEL[c.hero]} fallback={HERO_IMAGE[c.hero][c.jersey]} clip="idle" action={cheer} tint={jerseyTint(c.jersey)}
        rotatable headroom={0.16} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 148 }} label={name(c.hero)}
      />

      <View
        accessibilityRole="radiogroup"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 98, flexDirection: 'row', justifyContent: 'center', gap: 12 }}
      >
        {JERSEYS.map(j => (
          <PressableScale
            key={j.key} accessibilityRole="radio" accessibilityLabel={t(`char.jersey.${j.key}`)} accessibilityState={{ selected: c.jersey === j.key }}
            onPress={() => { tap(); pickJersey(j.key); }} hitSlop={4}
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: j.color, borderWidth: 3, borderColor: c.jersey === j.key ? colors.g100 : colors.line }}
          />
        ))}
      </View>

      <View accessibilityRole="radiogroup" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {STARTERS.map(h => <Mini key={h} hero={h} selected={c.hero === h} onPress={() => pickHero(h)} label={name(h)} />)}
      </View>
    </View>
  );
}

function Mini({ hero, selected, onPress, label }: { hero: Hero; selected: boolean; onPress: () => void; label: string }) {
  return (
    <PressableScale
      accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }}
      onPress={() => { tap(); onPress(); }} to={0.94}
      style={{
        width: 70, height: 84, borderRadius: 20, overflow: 'hidden',
        backgroundColor: selected ? 'rgba(63,77,24,.4)' : colors.s1, borderWidth: 1.5, borderColor: selected ? colors.l600 : colors.line,
      }}
    >
      <Image
        source={HERO_PORTRAIT[hero]} contentFit="cover" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        accessibilityElementsHidden importantForAccessibility="no"
      />
    </PressableScale>
  );
}

/* ---------- Nickname ---------- */

function Nick({ nick, onChange, busy, onDone, error }: { nick: string; onChange: (s: string) => void; busy: boolean; onDone: () => void; error: string | null }) {
  const ok = nick.trim().length >= NICK_MIN;
  return (
    <>
      <Enter><Bubble text={t('char.nick.title')} size={48} /></Enter>
      <View style={{ gap: 8 }}>
        <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE}
          value={nick} onChangeText={s => onChange(cleanNick(s))} maxLength={NICK_MAX} autoCorrect={false} autoCapitalize="words"
          returnKeyType="done" onSubmitEditing={onDone} placeholder={t('char.nick.s1')} placeholderTextColor={colors.g400}
          accessibilityLabel={t('char.nick.a11y')} selectionColor={colors.l600}
          style={{
            height: 68, borderRadius: 20, backgroundColor: colors.s1, borderWidth: 1.5, borderColor: error ? colors.bad : colors.l600,
            paddingHorizontal: 16, color: colors.g100, fontFamily: 'Inter_700Bold', fontSize: 26, textAlign: 'center',
          }}
        />
        {error && <T w={500} size={13} color={colors.bad} style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">{error}</T>}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('char.nick.suggest')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SUGGEST.map(k => <Chip key={k} selected={nick === t(k)} onPress={() => onChange(t(k))}>{t(k)}</Chip>)}
      </View>
      <View style={{ flex: 1 }} />
      <Cta off={!ok} disabled={!ok} busy={busy} onPress={onDone}>{t('char.nick.cta')}</Cta>
    </>
  );
}
