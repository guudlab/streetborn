import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { setMusic } from '../audio/audio.ts';
import {
  cleanNick, DEFAULT_CHARACTER, DREAMS, HERO_IMAGE, JERSEYS, NICK_MAX, NICK_MIN, POSITIONS, TRAITS,
  type Character, type Dream, type Hero, type Jersey, type Position, type Trait,
} from '../game/character.ts';
import { useGame } from '../game/store.ts';
import { colors } from '../theme.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { buzz, Caps, CoachLine, Cta, H1, T, tap } from '../ui/kit.tsx';
import { Enter, PressableScale } from '../ui/motion.tsx';
import { Model3D } from '../ui/Model3D.tsx';
import { t, type Key } from '../i18n/index.ts';

// New-player flow, shown after the first tap on the sign-in screen:
// 0 Burak abi welcomes, 1-3 his three questions, 4 look (hero + jersey colour), 5 nickname.
// The choices stay on the device for now; the server still decides every number.

const BURAK = require('../../assets/meshy/burak.webp');
const BURAK_MODEL = require('../../assets/models/burak-yuruyus.glb');
const LAST = 5;

const POS_ICON: Record<Position, IconName> = { bitirici: 'ball', oyunKurucu: 'train', kanat: 'bolt' };
const DREAM_ICON: Record<Dream, IconName> = { milli: 'trophy', avrupa: 'star', saha: 'home' };
const SUGGEST: Key[] = ['char.nick.s1', 'char.nick.s2', 'char.nick.s3', 'char.nick.s4', 'char.nick.s5', 'char.nick.s6'];

export default function Karakter() {
  const insets = useSafeAreaInsets();
  const createCharacter = useGame(s => s.createCharacter);
  const [step, setStep] = useState(0);
  const [c, setC] = useState<Character>(DEFAULT_CHARACTER);
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMusic('menu'); }, []);
  // Android back goes one step back instead of leaving the flow.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      setStep(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const next = () => setStep(s => Math.min(LAST, s + 1));
  async function finish() {
    if (busy || nick.trim().length < NICK_MIN) return;
    setBusy(true);
    try { await createCharacter(c, nick); } finally { setBusy(false); }
  }

  const pad = { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 8 };

  if (step === 0) {
    return (
      <View style={[{ flex: 1, paddingHorizontal: 20, gap: 18 }, pad]}>
        <Enter>
          <Caps>{t('char.welcome.caps')}</Caps>
          <H1 style={{ marginTop: 6 }}>{t('char.welcome.title')}</H1>
        </Enter>
        <View style={{ flex: 1, minHeight: 260 }}>
          <Glow width={260} />
          <Model3D model={BURAK_MODEL} fallback={BURAK} loop style={{ flex: 1 }} label={t('coach.name')} />
        </View>
        <Enter i={2}><Panel><CoachLine text={t('char.welcome.line')} /></Panel></Enter>
        <Cta onPress={() => { buzz(); next(); }}>{t('char.welcome.cta')}</Cta>
      </View>
    );
  }

  if (step === 4) {
    return (
      <View style={[{ flex: 1, paddingHorizontal: 20, gap: 14 }, pad]}>
        <Steps n={step} />
        <View><Caps>{t('char.step', { n: step })}</Caps><H1 style={{ marginTop: 6 }}>{t('char.look.title')}</H1></View>
        <Look c={c} onChange={setC} />
        <Cta onPress={() => { buzz(); next(); }}>{t('common.continue')}</Cta>
      </View>
    );
  }

  return (
    <View style={[{ flex: 1, paddingHorizontal: 20, gap: 16 }, pad]}>
      <Steps n={step} />
      {step === 5 ? (
        <Nick nick={nick} onChange={setNick} busy={busy} onDone={finish} />
      ) : (
        <Question step={step} c={c} onChange={setC} onNext={next} />
      )}
    </View>
  );
}

/* ---------- Steps ---------- */

function Steps({ n }: { n: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={t('char.step', { n })}>
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= n ? colors.l600 : colors.s3 }} />
      ))}
    </View>
  );
}

const Panel = ({ children }: { children: ReactNode }) => (
  <View style={{ borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line, padding: 16 }}>{children}</View>
);

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
  const line = step === 1 ? t('char.q1.line') : step === 2 ? t('char.q2.line') : t('char.q3.line');
  return (
    <>
      <Enter key={step}>
        <Caps>{t('char.step', { n: step })}</Caps>
        <H1 style={{ marginTop: 6 }}>{title}</H1>
      </Enter>
      <Enter key={`c${step}`} i={1}><CoachLine text={line} /></Enter>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingVertical: 2 }} showsVerticalScrollIndicator={false}>
        {step === 1 && POSITIONS.map((p, i) => (
          <Enter key={p} i={i + 2}>
            <Big
              icon={POS_ICON[p]} selected={c.position === p}
              title={t(`char.pos.${p}`)} sub={t(`char.pos.${p}.sub`)} tag={t(`char.pos.${p}.role`)}
              onPress={() => onChange({ ...c, position: p })}
            />
          </Enter>
        ))}
        {step === 2 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {TRAITS.map((k: Trait) => (
              <Chip key={k} selected={c.trait === k} onPress={() => onChange({ ...c, trait: k })}>{t(`char.trait.${k}`)}</Chip>
            ))}
          </View>
        )}
        {step === 3 && DREAMS.map((d, i) => (
          <Enter key={d} i={i + 2}>
            <Row icon={DREAM_ICON[d]} title={t(`char.dream.${d}`)} sub={t(`char.dream.${d}.sub`)} selected={c.dream === d} onPress={() => onChange({ ...c, dream: d })} />
          </Enter>
        ))}
      </ScrollView>
      <Cta onPress={() => { buzz(); onNext(); }}>{t('common.continue')}</Cta>
    </>
  );
}

function Big({ icon, title, sub, tag, selected, onPress }: { icon: IconName; title: string; sub: string; tag: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { tap(); onPress(); }} to={0.98}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22,
        backgroundColor: selected ? 'rgba(63,77,24,.4)' : colors.s1, borderWidth: 1.5, borderColor: selected ? colors.l600 : colors.line,
      }}
    >
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={colors.l600} size={26} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T w={600} size={17}>{title}</T>
        <T w={500} size={13} color={colors.g200}>{sub}</T>
        <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(63,77,24,.55)' }}>
          <T w={600} size={12} color={colors.l500}>{tag}</T>
        </View>
      </View>
    </PressableScale>
  );
}

function Row({ icon, title, sub, selected, onPress }: { icon: IconName; title: string; sub: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { tap(); onPress(); }} to={0.98}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16,
        backgroundColor: selected ? 'rgba(63,77,24,.4)' : colors.s2, borderWidth: 1.5, borderColor: selected ? colors.l600 : 'transparent',
      }}
    >
      <Icon name={icon} color={colors.l600} />
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <T w={600} size={15}>{title}</T>
        <T w={500} size={13} color={colors.g200}>{sub}</T>
      </View>
    </PressableScale>
  );
}

function Chip({ children, selected, onPress }: { children: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { tap(); onPress(); }}
      style={{
        height: 44, paddingHorizontal: 18, borderRadius: 22, justifyContent: 'center',
        backgroundColor: selected ? 'rgba(63,77,24,.4)' : colors.s2, borderWidth: 1.5, borderColor: selected ? colors.l600 : 'transparent',
      }}
    >
      <T w={600} size={15} color={selected ? colors.l500 : colors.g100}>{children}</T>
    </PressableScale>
  );
}

/* ---------- Look (hero + jersey colour) ---------- */

function Look({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const pickHero = (hero: Hero) => onChange({ ...c, hero });
  const pickJersey = (jersey: Jersey) => onChange({ ...c, jersey });
  return (
    <View style={{ flex: 1, minHeight: 300 }}>
      <Glow width={260} />
      <Image source={HERO_IMAGE[c.hero][c.jersey]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} contentFit="contain" accessibilityLabel={t(c.hero === 'street' ? 'char.look.hero1' : 'char.look.hero2')} />

      <View style={{ position: 'absolute', left: 0, top: 4, gap: 2 }}>
        <Caps>{t('char.look.pos')}</Caps>
        <T w={700} size={30} style={{ lineHeight: 34 }}>{t(`char.pos.${c.position}.role`)}</T>
      </View>

      <View
        accessibilityRole="radiogroup"
        style={{ position: 'absolute', right: 0, top: 0, gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 30, backgroundColor: colors.s1, borderWidth: 1, borderColor: colors.line }}
      >
        {JERSEYS.map(j => (
          <PressableScale
            key={j.key} accessibilityRole="radio" accessibilityLabel={t(`char.jersey.${j.key}`)} accessibilityState={{ selected: c.jersey === j.key }}
            onPress={() => { tap(); pickJersey(j.key); }} hitSlop={4}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: j.color, borderWidth: 2.5, borderColor: c.jersey === j.key ? colors.g100 : colors.line }}
          />
        ))}
      </View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        <Mini hero="street" selected={c.hero === 'street'} jersey={c.jersey} onPress={() => pickHero('street')} label={t('char.look.hero1')} />
        <Mini hero="pro" selected={c.hero === 'pro'} jersey={c.jersey} onPress={() => pickHero('pro')} label={t('char.look.hero2')} />
        <Mini hero="street" locked />
        <Mini hero="pro" locked />
      </View>
    </View>
  );
}

function Mini({ hero, jersey = 'lime', selected, locked, onPress, label }: { hero: Hero; jersey?: Jersey; selected?: boolean; locked?: boolean; onPress?: () => void; label?: string }) {
  return (
    <PressableScale
      disabled={locked} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: !!selected, disabled: !!locked }}
      onPress={() => { tap(); onPress?.(); }} to={0.94}
      style={{
        width: 70, height: 84, borderRadius: 20, overflow: 'hidden', opacity: locked ? 0.5 : 1,
        backgroundColor: selected ? 'rgba(63,77,24,.4)' : colors.s1, borderWidth: 1.5, borderColor: selected ? colors.l600 : colors.line,
      }}
    >
      <Image
        source={HERO_IMAGE[hero][locked ? 'lime' : jersey]} contentFit="contain" tintColor={locked ? '#000000' : undefined}
        style={{ position: 'absolute', left: -20, right: -20, top: -4, height: 100, opacity: locked ? 0.55 : 1 }}
        accessibilityElementsHidden importantForAccessibility="no"
      />
      {locked && <T w={600} size={10} color={colors.g300} style={{ position: 'absolute', bottom: 5, left: 0, right: 0, textAlign: 'center' }}>{t('char.look.soon')}</T>}
    </PressableScale>
  );
}

/* ---------- Nickname ---------- */

function Nick({ nick, onChange, busy, onDone }: { nick: string; onChange: (s: string) => void; busy: boolean; onDone: () => void }) {
  const ok = nick.trim().length >= NICK_MIN;
  return (
    <>
      <Enter>
        <Caps>{t('char.step', { n: LAST })}</Caps>
        <H1 style={{ marginTop: 6 }}>{t('char.nick.title')}</H1>
      </Enter>
      <CoachLine text={t('char.nick.line')} />
      <View style={{ gap: 8 }}>
        <TextInput
          value={nick} onChangeText={s => onChange(cleanNick(s))} maxLength={NICK_MAX} autoCorrect={false} autoCapitalize="words"
          returnKeyType="done" onSubmitEditing={onDone} placeholder={t('char.nick.s1')} placeholderTextColor={colors.g400}
          accessibilityLabel={t('char.nick.a11y')} selectionColor={colors.l600}
          style={{
            height: 60, borderRadius: 18, backgroundColor: colors.s1, borderWidth: 1.5, borderColor: colors.l600,
            paddingHorizontal: 16, color: colors.g100, fontFamily: 'Inter_600SemiBold', fontSize: 22,
          }}
        />
        <T w={500} size={13} color={colors.g300} style={{ paddingHorizontal: 4 }}>{t('char.nick.hint')}</T>
      </View>
      <View style={{ gap: 8 }}>
        <Caps>{t('char.nick.suggest')}</Caps>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SUGGEST.map(k => <Chip key={k} selected={nick === t(k)} onPress={() => onChange(t(k))}>{t(k)}</Chip>)}
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <Cta off={!ok} disabled={!ok || busy} onPress={onDone}>{t('char.nick.cta')}</Cta>
    </>
  );
}
