import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { sfx } from '../audio/audio.ts';
import { useGame } from '../game/store.ts';
import type { PhoneFx, PhoneView } from '../net/api.ts';
import { colors } from '../theme.ts';
import { FxChips, fxLabel, type Fx } from './fx.tsx';
import { Icon } from './Icon.tsx';
import { buzz, CoachFace, Cta, Ghost, T } from './kit.tsx';
import { closeSheet, openSheet, toast } from './overlay.tsx';
import { t, type Key } from '../i18n/index.ts';

// The day's phone event: one row on the hub while it waits, and a sheet with the message
// and two big answer buttons; one tap sends. The server picks the event and applies the
// answer; the app only shows the texts and the effect chips it was sent.

const AVATAR: Record<string, string> = {
  kerem: '#2A3550', anne: '#4A2E3A', kardes: '#3A3550', kuzen: '#4A3A2E', gazete: '#2E3B3B', radyo: '#2E3B3B',
  hoca: '#262626', kaptan: '#2A3550', taraftar: '#3F4D18', muhabir: '#2E3B3B', baskan: '#262626', takimArkadasi: '#2A3550', tv: '#2E3B3B',
};

const from = (p: PhoneView) => t(`phone.from.${p.from}` as Key);
const txt = (p: PhoneView, part: 'text' | 'a' | 'b' | 'aReply' | 'bReply') => t(`phone.${p.key}.${part}` as Key);

function Avatar({ p, size }: { p: PhoneView; size: number }) {
  if (p.from === 'burak') return <CoachFace size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR[p.from] ?? colors.s3, alignItems: 'center', justifyContent: 'center' }}>
      <T w={700} size={Math.round(size * 0.42)}>{from(p).charAt(0)}</T>
    </View>
  );
}

const fxList = (fx: PhoneFx): Fx[] => [
  { kind: 'morale', n: fx.morale }, { kind: 'respect', n: fx.respect }, { kind: 'trust', n: fx.trust }, { kind: 'coin', n: fx.coin },
];

function Said({ text, mine }: { text: string; mine?: boolean }) {
  return (
    <View style={{
      alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18,
      borderBottomLeftRadius: mine ? 18 : 6, borderBottomRightRadius: mine ? 6 : 18, backgroundColor: mine ? colors.l900 : colors.s3,
    }}>
      <T w={mine ? 600 : 500} size={15} color={mine ? colors.l500 : colors.g100} style={{ lineHeight: 20 }}>{text}</T>
    </View>
  );
}

/** Hub row for a waiting message; takes the place of Burak abi's line. */
export function PhoneRow({ p }: { p: PhoneView }) {
  const text = txt(p, 'text');
  return (
    <Pressable
      onPress={() => { buzz(); sfx('tab'); openPhoneSheet(); }}
      accessibilityRole="button" accessibilityLabel={t('phone.a11y', { from: from(p), text })}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingLeft: 8, paddingRight: 12,
        borderRadius: 22, backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.line, opacity: pressed ? 0.8 : 1,
      })}
    >
      <View>
        <Avatar p={p} size={40} />
        <View style={{ position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.l600, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="phone" size={12} color={colors.ink} />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700} size={14} numberOfLines={1}>{from(p)}</T>
        <T w={500} size={13} color={colors.g200} numberOfLines={1}>{text}</T>
      </View>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.l600 }} />
    </Pressable>
  );
}

export function openPhoneSheet() {
  openSheet(<PhoneSheet />);
}

function PhoneSheet() {
  const p = useGame(s => s.kariyer?.phone ?? null);
  const coins = useGame(s => s.coins);
  // One tap answers: the picked answer shows a spinner until the server takes it.
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const [sent, setSent] = useState(false);
  if (!p) return <Cta onPress={closeSheet}>{t('common.ok')}</Cta>;

  // Answered here or earlier today: the conversation and what it did.
  const answer = sent ? picked : p.answer;
  const fxOf = (i: 0 | 1) => (i === 0 ? p.a : p.b);
  const label = (i: 0 | 1) => txt(p, i === 0 ? 'a' : 'b');
  const short = (i: 0 | 1) => fxOf(i).coin < 0 && coins < -fxOf(i).coin;

  const send = async (i: 0 | 1) => {
    if (picked !== null) return;
    buzz('medium');
    setPicked(i);
    const r = await useGame.getState().answerPhone(p.key, i);
    if (r === 'ok') { sfx('unlock'); setSent(true); return; }
    setPicked(null);
    toast(t(r === 'no_coin' ? 'phone.noCoin' : r === 'stale' ? 'phone.stale' : 'phone.failed'));
    if (r !== 'error') closeSheet();
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar p={p} size={44} />
        <View style={{ flex: 1 }}>
          <T w={700} size={17}>{from(p)}</T>
          <T w={500} size={12} color={colors.g300}>{t(`phone.role.${p.from}` as Key)}</T>
        </View>
      </View>
      <Said text={txt(p, 'text')} />

      {answer !== null ? (
        <>
          <Said mine text={label(answer)} />
          <Said text={txt(p, answer === 0 ? 'aReply' : 'bReply')} />
          <FxChips fx={fxList(fxOf(answer))} big center />
          <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
        </>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            {([0, 1] as const).map(i => (
              <Answer
                key={i} text={label(i)} fx={fxList(fxOf(i))} short={short(i)}
                busy={picked === i} dim={picked !== null && picked !== i} onPress={() => void send(i)}
              />
            ))}
          </View>
          <Ghost onPress={closeSheet}>{t('phone.later')}</Ghost>
        </>
      )}
    </>
  );
}

/** A big answer button: the words you send, what they do, and a send arrow. */
function Answer({ text, fx, short, busy, dim, onPress }: { text: string; fx: Fx[]; short: boolean; busy: boolean; dim: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress} disabled={short || busy || dim}
      accessibilityRole="button" accessibilityState={{ disabled: short || dim, busy }}
      accessibilityLabel={`${text}. ${fxLabel(fx)}${short ? `. ${t('phone.noCoin')}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 80, paddingVertical: 12, paddingLeft: 16, paddingRight: 12, borderRadius: 22,
        backgroundColor: pressed || busy ? colors.s3 : colors.s2, borderWidth: 1.5, borderColor: pressed || busy ? colors.l700 : colors.line,
        opacity: short || dim ? 0.45 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 8 }}>
        <T w={700} size={17}>{text}</T>
        <FxChips fx={fx} />
        {short && <T w={600} size={12} color={colors.bad}>{t('phone.noCoin')}</T>}
      </View>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: short ? colors.s3 : colors.l600 }}>
        {busy ? <ActivityIndicator color={colors.ink} /> : <Icon name="chev" size={20} color={short ? colors.g300 : colors.ink} />}
      </View>
    </Pressable>
  );
}
