import { simulateMatch, type ChanceInput, type ShotOutcome } from '@streetborn/engine';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from './src/theme';

// Temporary skeleton screen: proves the shared engine runs on the device.
// It will be replaced by Expo Router screens and the Skia match scene.
const DEMO_SETUP = { seed: 20261021, chances: 6, shooting: 55, opponentGoalkeeping: 50 };

const OUTCOME_LABEL: Record<ShotOutcome, string> = {
  goal: 'GOL',
  saved: 'Kaleci kurtardı',
  wide: 'Auta gitti',
  over: 'Üstten aştı',
};

export default function App() {
  const [inputs, setInputs] = useState<ChanceInput[]>([]);
  const result = simulateMatch(DEMO_SETUP, inputs);
  const next = inputs.length;
  const last = next > 0 ? result.outcomes[next - 1] : null;

  const shoot = (aim: number) => {
    if (next >= DEMO_SETUP.chances) return;
    setInputs([...inputs, { chance: next, shot: { aim, lift: 400, power: 750 } }]);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>STREETBORN</Text>
      <Text style={styles.score}>{result.goals}</Text>
      <Text style={styles.muted}>
        gol · pozisyon {Math.min(next + 1, DEMO_SETUP.chances)}/{DEMO_SETUP.chances}
      </Text>
      <Text style={[styles.outcome, last === 'goal' && styles.goal]}>{last ? OUTCOME_LABEL[last] : ' '}</Text>

      {next < DEMO_SETUP.chances ? (
        <View style={styles.row}>
          <ShotButton label="Sol köşe" onPress={() => shoot(-800)} />
          <ShotButton label="Orta" onPress={() => shoot(0)} />
          <ShotButton label="Sağ köşe" onPress={() => shoot(800)} />
        </View>
      ) : (
        <ShotButton label="Yeniden oyna" onPress={() => setInputs([])} />
      )}
      <StatusBar style="light" />
    </View>
  );
}

function ShotButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  brand: { color: colors.lime600, fontSize: 16, fontWeight: '800', letterSpacing: 4 },
  score: { color: colors.text, fontSize: 96, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 14 },
  outcome: { color: colors.textMuted, fontSize: 20, fontWeight: '700', marginVertical: 16 },
  goal: { color: colors.lime500 },
  row: { flexDirection: 'row', gap: 8 },
  button: { backgroundColor: colors.lime600, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 18 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
});
