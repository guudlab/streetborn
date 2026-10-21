import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OFFERS } from '../../game/rules.ts';
import { useGame } from '../../game/store.ts';
import { colors, TAB_BAR_SPACE } from '../../theme.ts';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { Crest } from '../../ui/hud.tsx';
import { buzz, Caps, Cta, Ghost, H1, H3, T } from '../../ui/kit.tsx';
import { closeSheet, openSheet, SheetText, toast } from '../../ui/overlay.tsx';

const CREST = { kartaltepe: [colors.awayCrest, colors.awayCrestText], bogazici: ['#20323A', '#9ED3E8'] } as Record<string, [string, string]>;

export default function Teklifler() {
  const insets = useSafeAreaInsets();
  const { scouted, signed, trialAccepted } = useGame();
  const [sel, setSel] = useState('kartaltepe');
  const offer = OFFERS.find(o => o.id === sel)!;
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: 20, gap: 16 };

  if (!scouted || signed) {
    const o = OFFERS.find(x => x.id === signed);
    return (
      <View style={{ flex: 1, ...pad }}>
        <View><Caps>Kariyer</Caps><H1 style={{ marginTop: 4 }}>Teklifler</H1></View>
        <Empty
          icon={o ? 'check' : 'mail'}
          title={o ? `${o.club} ile imzaladın` : 'Henüz teklif yok'}
          text={o ? "Sezon sonunda (2 hafta) yeni kulübüne geçiyorsun. O zamana kadar Yıldırımspor'da oynamaya devam."
            : 'Maç notun 6,5 veya üstü olursa izciler rapor yazar ve kulüpler teklif gönderir.'}
        />
      </View>
    );
  }

  const confirm = () => openSheet(
    <>
      <H3>{offer.club}{offer.req ? ' deneme maçı' : ' ile imzala'}</H3>
      <SheetText>
        {offer.req
          ? `Deneme maçı bir sonraki enerjinle oynanır. ${offer.req} gerekir; altında kalırsan teklif kapanır, mevcut kulübün etkilenmez.`
          : "Sezon sonunda Yıldırımspor'dan ayrılırsın. Bu karar geri alınamaz."}
      </SheetText>
      <Cta onPress={() => {
        closeSheet();
        if (offer.req) { useGame.getState().acceptTrial(); toast('Deneme maçı takvime eklendi'); return; }
        useGame.getState().sign(offer.id); toast('İmzalandı'); buzz('success');
      }}>{offer.req ? 'Kabul et' : 'İmzala'}</Cta>
      <Ghost onPress={closeSheet}>Vazgeç</Ghost>
    </>,
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...pad, paddingBottom: TAB_BAR_SPACE + insets.bottom + 90 }}>
        <View><Caps>İzci raporu · Hafta 10</Caps><H1 style={{ marginTop: 4 }}>2 teklif</H1></View>
        <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
          {OFFERS.map(o => {
            const on = o.id === sel;
            const [bg, fg] = CREST[o.id]!;
            return (
              <Pressable
                key={o.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setSel(o.id)}
                style={{ borderRadius: 22, backgroundColor: colors.s1, borderWidth: 1.5, borderColor: on ? colors.l600 : colors.line, padding: 16, gap: 12 }}
              >
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Crest text={o.club.slice(0, 3).toLocaleUpperCase('tr')} bg={bg} fg={fg} />
                  <View style={{ flex: 1 }}>
                    <T w={600} size={17}>{o.club}</T>
                    <T size={13} color={colors.g200}>{o.league}</T>
                  </View>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.l600 : colors.g400, backgroundColor: on ? colors.l600 : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Icon name="check" size={16} color={colors.ink} />}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Term label="Rol"><T w={600} size={15}>{o.role}</T></Term>
                  <Term label="Haftalık">
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="coin" size={16} color={colors.l500} /><T w={600} size={15}>{o.weekly}</T></View>
                  </Term>
                  <Term label="Süre"><T w={600} size={13}>{o.length}</T></Term>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Icon name={o.req ? 'lock' : 'info'} size={18} color={colors.g200} />
                  <T size={13} color={colors.g200} style={{ flex: 1 }}>{o.req ?? o.note}</T>
                </View>
              </Pressable>
            );
          })}
        </View>
        <T size={13} color={colors.g200}>Şu anki kulübün: Yıldırımspor · Rotasyon · 180 coin/hafta</T>
      </ScrollView>
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: TAB_BAR_SPACE + insets.bottom - 8 }}>
        {offer.req && trialAccepted
          ? <Cta off disabled>Deneme maçı takvimde</Cta>
          : <Cta onPress={confirm}>{offer.req ? 'Deneme maçını kabul et' : 'İmzala'}</Cta>}
      </View>
    </View>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.s2, borderRadius: 12, padding: 10, gap: 4 }}>
      <Caps style={{ letterSpacing: 0.7 }}>{label}</Caps>
      {children}
    </View>
  );
}

function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20, gap: 10 }}>
      <Icon name={icon} size={44} color={colors.g400} />
      <H3 style={{ textAlign: 'center' }}>{title}</H3>
      <T size={14} color={colors.g200} style={{ textAlign: 'center', lineHeight: 20 }}>{text}</T>
    </View>
  );
}
