import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useGame } from '../game/store.ts';
import { ApiError } from '../net/api.ts';
import { EMAIL, linkEmail, linkProvider, sendEmailCode, signInProvider, verifyEmailCode, type Provider } from '../net/auth.ts';
import { colors } from '../theme.ts';
import { Icon } from './Icon.tsx';
import { buzz, Cta, Ghost, H3, T } from './kit.tsx';
import { closeSheet, openSheet, SheetText, toast } from './overlay.tsx';
import { t, type Key } from '../i18n/index.ts';

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

function ProviderButtons({ onPick }: { onPick(p: Provider | 'email'): void }) {
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => onPick('apple')} accessibilityRole="button" style={{ height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <T w={600} size={15} color={colors.ink}>{t('account.apple')}</T>
      </Pressable>
      <Pressable onPress={() => onPick('google')} accessibilityRole="button" style={{ height: 52, borderRadius: 26, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' }}>
        <T w={600} size={15}>{t('account.google')}</T>
      </Pressable>
      <Pressable onPress={() => onPick('email')} accessibilityRole="button" style={{ height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.g400, alignItems: 'center', justifyContent: 'center' }}>
        <T w={600} size={15}>{t('account.email')}</T>
      </Pressable>
    </View>
  );
}

function Field({ value, onChange, placeholder, label, error, onSubmit, code }: {
  value: string; onChange(s: string): void; placeholder: string; label: string; error: string | null; onSubmit(): void; code?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height: 52, borderRadius: 14, backgroundColor: colors.s2, borderWidth: 1, borderColor: error ? colors.bad : colors.l600, justifyContent: 'center', paddingHorizontal: 14 }}>
        <TextInput
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
      toast(t('account.linked', { provider: PROVIDER_NAME[p] }));
    }
  } catch (e) {
    toast(accountError(e));
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
    toast(accountError(e));
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
      <H3>{t('account.signInTitle')}</H3>
      <SheetText>{t('account.signInText')}</SheetText>
      <ProviderButtons onPick={(p) => { buzz(); if (p === 'email') openSheet(<SignInEmail />); else void signInWith(p); }} />
      <Ghost onPress={closeSheet}>{t('common.close')}</Ghost>
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
    <Pressable
      accessibilityRole="button" disabled={!!linked || !account} onPress={() => { buzz(); openLinkSheet(); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.s2 }}
    >
      <Icon name={linked ? 'check' : 'lock'} color={linked ? colors.l600 : colors.g200} />
      <View style={{ flex: 1 }}>
        <T w={600} size={15}>{t('account.title')}</T>
        <T size={13} color={colors.g200} numberOfLines={1}>{label}</T>
      </View>
      {!linked && account ? <T w={600} size={14} color={colors.l600}>{t('account.linkCta')}</T> : null}
    </Pressable>
  );
}
