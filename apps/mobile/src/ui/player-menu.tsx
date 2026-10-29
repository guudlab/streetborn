import { useGame } from '../game/store.ts';
import type { ReportReason } from '../net/api.ts';
import { colors } from '../theme.ts';
import { Cta, Ghost, H3, T } from './kit.tsx';
import { closeSheet, openSheet, SheetText, toast } from './overlay.tsx';
import { t } from '../i18n/index.ts';

const REASONS: { id: ReportReason; label: 'report.abuse' | 'report.harassment' | 'report.spam' | 'report.other' }[] = [
  { id: 'abuse', label: 'report.abuse' },
  { id: 'harassment', label: 'report.harassment' },
  { id: 'spam', label: 'report.spam' },
  { id: 'other', label: 'report.other' },
];

/** Report / block sheet for another player (store rule for apps with player names). */
export function openPlayerMenu(playerId: string, nick: string | null) {
  const blocked = useGame.getState().blocked.includes(playerId);
  const name = nick ?? t('mahalle.home.newPlayer');

  const block = async (value: boolean) => {
    closeSheet();
    try {
      await useGame.getState().setBlocked(playerId, value);
      // Blocking hides a mahalle mate at once, so a mistaken tap gets one tap back.
      toast(t(value ? 'report.blocked' : 'report.unblocked'), { kind: 'success', action: value ? { label: t('common.undo'), onPress: () => void block(false) } : undefined });
    } catch {
      toast(t('report.failed'), 'error');
    }
  };

  const reasons = () => openSheet(
    <>
      <H3>{t('report.title', { name })}</H3>
      <SheetText>{t('report.sub')}</SheetText>
      {REASONS.map(r => (
        <Ghost key={r.id} onPress={async () => {
          closeSheet();
          try {
            await useGame.getState().report(playerId, r.id);
            toast(t('report.sent'), 'success');
          } catch {
            toast(t('report.failed'), 'error');
          }
        }}>{t(r.label)}</Ghost>
      ))}
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );

  openSheet(
    <>
      <H3 numberOfLines={1}>{name}</H3>
      {!blocked && <Cta onPress={() => { closeSheet(); setTimeout(reasons, 250); }}>{t('report.action')}</Cta>}
      <Ghost onPress={() => void block(!blocked)}><T w={600} size={17} color={blocked ? colors.l500 : colors.bad}>{t(blocked ? 'report.unblock' : 'report.block')}</T></Ghost>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>,
  );
}
