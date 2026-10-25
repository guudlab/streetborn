import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { useGame } from '../../game/store.ts';

// Invite link: streetborn.guudlab.workers.dev/davet/KOD. Keeps the code, then the normal
// start continues (a new player taps to start, then sees the invite instead of the
// mahalle choice; a player who already has a mahalle just lands on the hub).

export default function Davet() {
  const { kod } = useLocalSearchParams<{ kod: string }>();
  const mahalle = useGame(s => s.mahalle);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const code = String(kod ?? '').toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(code) && !mahalle) useGame.getState().setPendingInvite(code);
    setSaved(true);
  }, [kod, mahalle]);
  return saved ? <Redirect href="/" /> : null;
}
