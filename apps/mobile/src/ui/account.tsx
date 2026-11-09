import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useGame } from '../game/store.ts';
import { ApiError } from '../net/api.ts';
import { EMAIL, linkEmail, linkProvider, sendEmailCode, signInProvider, verifyEmailCode, type Provider } from '../net/auth.ts';
import { colors, MAX_FONT_SCALE } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { buzz, Cta, Ghost, H3, T } from './kit.tsx';
import { closeSheet, openSheet, SheetText, toast } from './overlay.tsx';
import { t, type Key } from '../i18n/index.ts';
import { PressableScale } from './motion.tsx';

// Account sheets: link the guest account (email, Google, Apple) so progress
// survives a new phone, or sign in to an existing account ("Hesabım var").

const PROVIDER_NAME: Record<Provider, string> = { apple: 'Apple', google: 'Google' };

const ERRORS: Partial<Record<string, Key>> = {
  identity_already_exists: 'account.err.taken',
  email_exists: 'account.err.emailTaken',
  manual_linking_disabled: 'account.err.off',
  provider_disabled: 'account.err.off',
  validation_failed: 'account.err.off',
  over_email_send_rate_limit: 'account.err.rate',
  over_request_rate_limit: 'account.err.rate',
  otp_disabled: 'account.err.noAccount',
  user_not_found: 'account.err.noAccount',
  otp_expired: 'account.err.code',
  email_address_invalid: 'account.err.email',
};
// Supabase's built-in email sender allows only a few emails per hour, so the app
// never sends twice in a row: one code per address per minute, even if the sheet is reopened.
const RESEND_MS = 60_000;
const lastSent = new Map<string, number>();
const waitLeft = (email: string) => Math.max(0, Math.ceil((RESEND_MS - (Date.now() - (lastSent.get(email.toLowerCase()) ?? 0))) / 1000));

export const accountError = (e: unknown) => t(ERRORS[e instanceof ApiError ? e.code : ''] ?? 'account.err.other');

/** Apple's and Google's own marks on their buttons (both brands ask for them). */
const AppleMark = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24"><Path fill="#000" d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.6zM14.1 5.6c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></Svg>
);
const GoogleMark = () => (
  <Svg width={18} height={18} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <Path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </Svg>
);

/** Apple and Google as full buttons with their marks; email as a plain text button under them. */
function ProviderButtons({ onPick }: { onPick(p: Provider | 'email'): void }) {
  return (
    <View style={{ gap: 8 }}>
      <PressableScale onPress={() => onPick('apple')} accessibilityRole="button" style={{ height: 52, borderRadius: 26, backgroundColor: '#fff', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <AppleMark />
        <T w={600} size={15} color={colors.ink}>{t('account.apple')}</T>
      </PressableScale>
      <PressableScale onPress={() => onPick('google')} accessibilityRole="button" style={{ height: 52, borderRadius: 26, backgroundColor: colors.s3, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <GoogleMark />
        <T w={600} size={15}>{t('account.google')}</T>
      </PressableScale>
      <PressableScale onPress={() => onPick('email')} accessibilityRole="button" style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <T w={600} size={15}>{t('account.email')}</T>
      </PressableScale>
    </View>
  );
}

/** Sheet title with a close cross on the right, in place of a separate close button. */
function SheetHead({ title }: { title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <H3 style={{ flex: 1 }}>{title}</H3>
      <PressableScale
        accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} onPress={() => { buzz(); closeSheet(); }}
        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="x" size={14} color={colors.g200} />
      </PressableScale>
    </View>
  );
}

function Field({ value, onChange, placeholder, label, error, onSubmit, code }: {
  value: string; onChange(s: string): void; placeholder: string; label: string; error: string | null; onSubmit(): void; code?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 52, borderRadius: 14, backgroundColor: colors.s2, borderWidth: 1, borderColor: error ? colors.bad : colors.l600, justifyContent: 'center', paddingHorizontal: 14 }}>
        <TextInput maxFontSizeMultiplier={MAX_FONT_SCALE}
          value={value} onChangeText={onChange} autoFocus autoCorrect={false} autoCapitalize="none"
          keyboardType={code ? 'number-pad' : 'email-address'} autoComplete={code ? 'one-time-code' : 'email'} textContentType={code ? 'oneTimeCode' : 'emailAddress'}
          maxLength={code ? 8 : 120} returnKeyType="done" onSubmitEditing={onSubmit}
          placeholder={placeholder} placeholderTextColor={colors.g400} selectionColor={colors.l600} accessibilityLabel={label}
          style={{ color: colors.g100, fontFamily: 'Inter_500Medium', fontSize: code ? 22 : 17, letterSpacing: code ? 6 : 0, outlineStyle: 'none' } as object}
        />
      </View>
      {error ? <T w={500} size={12} color={colors.bad} accessibilityLiveRegion="polite">{error}</T> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Link the guest account
// ---------------------------------------------------------------------------

async function linkWith(p: Provider) {
  try {
    if (await linkProvider(p) === 'ok') {
      await useGame.getState().refreshAccount();
      closeSheet();
      buzz('medium');
      toast(t('account.linked', { provider: PROVIDER_NAME[p] }), 'success');
    }
  } catch (e) {
    toast(accountError(e), 'error');
  }
}

function LinkEmail() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const v = email.trim();
    if (!EMAIL.test(v)) { setError(t('account.err.email')); return; }
    setBusy(true);
    try { await linkEmail(v); setSent(true); void useGame.getState().refreshAccount(); } catch (e) { setError(accountError(e)); }
    setBusy(false);
  };
  if (sent) {
    return (
      <>
        <H3>{t('account.emailSentTitle')}</H3>
        <SheetText>{t('account.emailSentText', { email: email.trim() })}</SheetText>
        <Cta onPress={closeSheet}>{t('common.ok')}</Cta>
      </>
    );
  }
  return (
    <>
      <H3>{t('account.emailTitle')}</H3>
      <SheetText>{t('account.emailText')}</SheetText>
      <Field value={email} onChange={(s) => { setEmail(s); setError(null); }} placeholder={t('account.emailPlaceholder')} label={t('account.email')} error={error} onSubmit={submit} />
      <Cta onPress={submit} disabled={busy || !email.trim()}>{t('account.emailSend')}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>
  );
}

/** Starts linking the guest account to a provider, or opens the email step. */
export function startLink(p: Provider | 'email') {
  buzz();
  if (p === 'email') openSheet(<LinkEmail />); else void linkWith(p);
}

/** Offers the three ways to keep the guest account. */
export function openLinkSheet() {
  openSheet(
    <>
      <H3>{t('account.linkTitle')}</H3>
      <SheetText>{t('account.linkText')}</SheetText>
      <ProviderButtons onPick={startLink} />
      <Ghost onPress={closeSheet}>{t('post.link.later')}</Ghost>
    </>,
  );
}

// ---------------------------------------------------------------------------
// Sign in to an existing account
// ---------------------------------------------------------------------------

async function signInWith(p: Provider) {
  try {
    if (await signInProvider(p) === 'ok') {
      closeSheet();
      await useGame.getState().signedIn();
    }
  } catch (e) {
    toast(accountError(e), 'error');
  }
}

function SignInEmail() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const sending = useRef(false);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(waitLeft(email.trim())), 1000);
    return () => clearTimeout(id);
  }, [wait, email]);
  const send = async () => {
    const v = email.trim();
    if (sending.current) return;
    if (!EMAIL.test(v)) { setError(t('account.err.email')); return; }
    // A code was sent a moment ago: it is still valid, so go and type it instead of sending another.
    if (waitLeft(v) > 0) { setWait(waitLeft(v)); setStep('code'); setError(null); return; }
    sending.current = true;
    setBusy(true);
    try {
      await sendEmailCode(v);
      lastSent.set(v.toLowerCase(), Date.now());
      setWait(waitLeft(v)); setStep('code'); setError(null);
    } catch (e) {
      const rate = e instanceof ApiError && (e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit');
      setError(rate ? t('account.err.rateEmail') : accountError(e));
    }
    sending.current = false;
    setBusy(false);
  };
  const verify = async () => {
    if (code.length < 6 || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await verifyEmailCode(email.trim(), code);
      closeSheet();
      await useGame.getState().signedIn();
    } catch (e) {
      setError(accountError(e));
      setBusy(false);
    }
    sending.current = false;
  };
  if (step === 'code') {
    return (
      <>
        <H3>{t('account.codeTitle')}</H3>
        <SheetText>{t('account.codeText', { email: email.trim() })}</SheetText>
        <Field code value={code} onChange={(s) => { setCode(s.replace(/\D/g, '')); setError(null); }} placeholder="000000" label={t('account.codeTitle')} error={error} onSubmit={verify} />
        <Cta onPress={verify} disabled={busy || code.length < 6}>{t('account.signIn')}</Cta>
        <Ghost onPress={() => { void send(); }}>{wait > 0 ? t('account.resendIn', { s: String(wait) }) : t('account.resend')}</Ghost>
        <Ghost onPress={() => { setStep('email'); setCode(''); setError(null); }}>{t('account.otherEmail')}</Ghost>
      </>
    );
  }
  return (
    <>
      <H3>{t('account.signInEmailTitle')}</H3>
      <SheetText>{t('account.signInEmailText')}</SheetText>
      <Field value={email} onChange={(s) => { setEmail(s); setError(null); }} placeholder={t('account.emailPlaceholder')} label={t('account.email')} error={error} onSubmit={send} />
      <Cta onPress={send} disabled={busy || !email.trim()}>{t('account.sendCode')}</Cta>
      <Ghost onPress={closeSheet}>{t('common.cancel')}</Ghost>
    </>
  );
}

/** "Hesabım var": sign in with Apple, Google or an email code. */
export function openSignInSheet() {
  openSheet(
    <>
      <SheetHead title={t('account.signInTitle')} />
      <SheetText>{t('account.signInText')}</SheetText>
      <ProviderButtons onPick={(p) => { buzz(); if (p === 'email') openSheet(<SignInEmail />); else void signInWith(p); }} />
    </>,
  );
}

// ---------------------------------------------------------------------------
// Settings row
// ---------------------------------------------------------------------------

/** Account line for the settings sheet: guest (with a link button) or what the account is linked to. */
export function AccountRow() {
  const account = useGame(s => s.account);
  const online = useGame(s => s.mode === 'online');
  if (!online) return null;
  const linked = account && !account.anonymous;
  const label = !account ? t('account.loading')
    : linked ? [account.email, ...account.providers.map(p => PROVIDER_NAME[p])].filter(Boolean).join(' · ')
    : account.pendingEmail ? t('account.pending', { email: account.pendingEmail })
    : t('account.guest');
  return (
    <PressableScale
      accessibilityRole="button" disabled={!!linked || !account} onPress={() => { buzz(); openLinkSheet(); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2 }}
    >
      <Icon name={linked ? 'check' : 'lock'} color={linked ? colors.l600 : colors.g200} />
      <View style={{ flex: 1 }}>
        <T w={600} size={15}>{t('account.title')}</T>
        <T size={13} color={colors.g200} numberOfLines={1}>{label}</T>
      </View>
      {!linked && account ? <T w={600} size={14} color={colors.l600}>{t('account.linkCta')}</T> : null}
    </PressableScale>
  );
}
