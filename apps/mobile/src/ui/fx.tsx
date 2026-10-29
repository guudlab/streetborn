import { View } from 'react-native';

import { effectText, num } from '../game/format.ts';
import { colors } from '../theme.ts';
import { Icon, type IconName } from './Icon.tsx';
import { T } from './kit.tsx';
import { t } from '../i18n/index.ts';

// What a choice does, as small chips: a picture and a plain phrase, green when it
// helps and red when it costs. The pre-match choice and the phone answers share them.

export type FxKind = 'shoot' | 'morale' | 'respect' | 'trust' | 'injury' | 'coin';
export type Fx = { kind: FxKind; n: number };

const ICON: Record<FxKind, IconName> = { shoot: 'ball', morale: 'smile', respect: 'city', trust: 'whistle', injury: 'shield', coin: 'coin' };

/** Less injury is good; for everything else more is good. */
const good = (f: Fx) => (f.kind === 'injury' ? f.n < 0 : f.n > 0);

export function fxText(f: Fx) {
  if (f.kind === 'coin') return t('phone.fx.coin', { n: f.n > 0 ? `+${num(f.n)}` : num(f.n) });
  if (f.kind === 'injury') return t('choice.fx.injury');
  return effectText(f.kind, f.n);
}

export const fxLabel = (fx: Fx[]) => fx.map(fxText).join(', ');

export function FxChips({ fx, big, center }: { fx: Fx[]; big?: boolean; center?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: center ? 'center' : 'flex-start' }}>
      {fx.filter(f => f.n !== 0).map(f => {
        const ok = good(f);
        const color = ok ? colors.l500 : colors.bad;
        return (
          <View
            key={f.kind}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: big ? 6 : 4, paddingLeft: big ? 8 : 6, paddingRight: big ? 12 : 8, height: big ? 32 : 24,
              borderRadius: big ? 16 : 12, backgroundColor: ok ? 'rgba(207,253,92,.12)' : 'rgba(255,122,102,.14)',
            }}
          >
            <Icon name={ICON[f.kind]} size={big ? 18 : 14} color={color} />
            <T w={700} size={big ? 14 : 12} color={color}>{fxText(f)}</T>
          </View>
        );
      })}
    </View>
  );
}
