import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { sfx } from '../audio/audio.ts';
import { delta, num } from '../game/format.ts';
import { useGame } from '../game/store.ts';
import type { PhoneFx, PhoneView } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { buzz, CoachFace, Cta, Ghost, T } from './kit.tsx';
import { closeSheet, openSheet, toast } from './overlay.tsx';
import { Tile } from './sade.tsx';
import { t, type Key } from '../i18n/index.ts';

// The day's phone event: one row on the hub while it waits, and a sheet with the message,
// two answers and a confirm. The server picks the event and applies the answer; the app
// only shows the texts and the effect chips it was sent.

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

type Chip = { text: string; good: boolean };
/** Effect chips in a fixed order; a coin cost is a cost, everything else by its sign. */
function chips(fx: PhoneFx): Chip[] {
  const out: Chip[] = [];
  if (fx.morale) out.push({ text: t('choice.fx.morale', { n: delta(fx.morale, 0) }), good: fx.morale > 0 });
  if (fx.respect) out.push({ text: t('choice.fx.respect', { n: delta(fx.respect, 0) }), good: fx.respect > 0 });
  if (fx.trust) out.push({ text: t('phone.fx.trust', { n: delta(fx.trust, 0) }), good: fx.trust > 0 });
  if (fx.coin) out.push({ text: t('phone.fx.coin', { n: fx.coin > 0 ? `+${num(fx.coin, 0)}` : `−${num(-fx.coin, 0)}` }), good: fx.coin > 0 });
  return out;
}

function Chips({ fx, big }: { fx: PhoneFx; big?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: big ? 'center' : 'flex-start' }}>
      {chips(fx).map(c => (
        <View key={c.text} style={{ paddingHorizontal: big ? 12 : 8, height: big ? 30 : 22, borderRadius: big ? 15 : 11, justifyContent: 'center', backgroundColor: c.good ? 'rgba(207,253,92,.12)' : 'rgba(255,122,102,.14)' }}>
          <T w={700} size={big ? 14 : 11} color={c.good ? colors.l500 : colors.bad}>{c.text}</T>
        </View>
      ))}
    </View>
  );
}

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
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const [step, setStep] = useState<'pick' | 'confirm' | 'sent'>('pick');
  const [busy, setBusy] = useState(false);
  if (!p) return <Cta onPress={closeSheet}>{t('common.ok')}</Cta>;

  // Answered here or earlier today: the conversation and what it did.
  const answer = step === 'sent' ? picked : p.answer;
  const fxOf = (i: 0 | 1) => (i === 0 ? p.a : p.b);
  const label = (i: 0 | 1) => txt(p, i === 0 ? 'a' : 'b');
  const short = (i: 0 | 1) => fxOf(i).coin < 0 && coins < -fxOf(i).coin;

  const send = async () => {
    if (picked === null) return;
    buzz('medium');
    setBusy(true);
    const r = await useGame.getState().answerPhone(p.key, picked);
    setBusy(false);
    if (r === 'ok') { sfx('unlock'); setStep('sent'); return; }
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
        {answer === null && <T w={600} size={12} color={colors.g300}>{t('phone.until')}</T>}
      </View>
      <Said text={txt(p, 'text')} />

      {answer !== null ? (
        <>
          <Said mine text={label(answer)} />
          <Said text={txt(p, answer === 0 ? 'aReply' : 'bReply')} />
          <Chips fx={fxOf(answer)} big />
          <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
        </>
      ) : step === 'confirm' && picked !== null ? (
        <>
          <View style={{ gap: 6, padding: 14, borderRadius: 20, backgroundColor: colors.s2, borderWidth: 1, borderColor: colors.l700 }}>
            <T w={700} size={16} accessibilityLiveRegion="polite">{t('phone.confirm', { answer: label(picked) })}</T>
            <T w={500} size={13} color={colors.g200}>{t('phone.confirmNote')}</T>
          </View>
          <Cta busy={busy} onPress={() => void send()}>{t('phone.send')}</Cta>
          <Ghost onPress={() => setStep('pick')}>{t('common.cancel')}</Ghost>
        </>
      ) : (
        <>
          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {([0, 1] as const).map(i => {
              const on = picked === i;
              const off = short(i);
              return (
                <Tile
                  key={i} row role="radio" selected={on} disabled={off}
                  onPress={() => { buzz(); setPicked(on ? null : i); }}
                  label={`${label(i)}. ${chips(fxOf(i)).map(c => c.text).join(', ')}${off ? `. ${t('phone.noCoin')}` : ''}`}
                  style={{ minHeight: 72, paddingVertical: 12, gap: 12, opacity: off ? 0.5 : picked !== null && !on ? 0.6 : 1 }}
                >
                  <View style={{ flex: 1, gap: 8 }}>
                    <T w={700} size={16}>{label(i)}</T>
                    <Chips fx={fxOf(i)} />
                    {off && <T w={600} size={12} color={colors.bad}>{t('phone.noCoin')}</T>}
                  </View>
                  <View style={{
                    width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                    borderColor: on ? colors.l600 : colors.g400, backgroundColor: on ? colors.l600 : 'transparent',
                  }}>
                    {on && <Icon name="check" size={15} color={colors.ink} />}
                  </View>
                </Tile>
              );
            })}
          </View>
          {picked !== null
            ? <Cta onPress={() => { buzz(); setStep('confirm'); }}>{t('phone.answer')}</Cta>
            : <Ghost onPress={closeSheet}>{t('phone.later')}</Ghost>}
        </>
      )}
    </>
  );
}
