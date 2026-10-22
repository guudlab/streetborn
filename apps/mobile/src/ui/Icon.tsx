import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '../theme.ts';

// Ported from the prototype icon set (icons.js): 24x24, stroke = currentColor.
export type IconName =
  | 'home' | 'train' | 'bag' | 'mail' | 'bolt' | 'coin' | 'gem' | 'pause' | 'clock' | 'lock'
  | 'info' | 'check' | 'x' | 'chev' | 'back' | 'play' | 'trophy' | 'ad' | 'whistle' | 'ball' | 'star'
  | 'sound' | 'mute' | 'music';

const SHADE = 'rgba(0,0,0,.45)';

function paths(name: IconName, c: string) {
  switch (name) {
    case 'home': return <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />;
    case 'train': return <><Path d="M3 17l6-6 4 4 8-8" /><Path d="M14 7h7v7" /></>;
    case 'bag': return <><Path d="M5 8h14l-1 12H6z" /><Path d="M9 8V7a3 3 0 0 1 6 0v1" /></>;
    case 'mail': return <><Rect x={3} y={5} width={18} height={14} rx={2} /><Path d="M3 7l9 6 9-6" /></>;
    case 'bolt': return <Path d="M13 2L4 14h7l-1 8 9-12h-7z" fill={c} stroke="none" />;
    case 'coin': return <><Circle cx={12} cy={12} r={9} fill={c} stroke="none" /><Circle cx={12} cy={12} r={5.5} fill="none" stroke={SHADE} strokeWidth={1.8} /></>;
    case 'gem': return <><Path d="M6 4h12l3 5-9 11L3 9z" fill={c} stroke="none" /><Path d="M3 9h18M9 4l3 16M15 4l-3 16" stroke="rgba(0,0,0,.35)" strokeWidth={1.2} /></>;
    case 'pause': return <><Rect x={6.5} y={5} width={3.5} height={14} rx={1} fill={c} stroke="none" /><Rect x={14} y={5} width={3.5} height={14} rx={1} fill={c} stroke="none" /></>;
    case 'clock': return <><Circle cx={12} cy={12} r={9} /><Path d="M12 7v5l3 2" /></>;
    case 'lock': return <><Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></>;
    case 'info': return <><Circle cx={12} cy={12} r={9} /><Path d="M12 11v6M12 7.5v.5" /></>;
    case 'check': return <Path d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'x': return <Path d="M6 6l12 12M18 6L6 18" />;
    case 'chev': return <Path d="M9 5l7 7-7 7" />;
    case 'back': return <Path d="M15 5l-7 7 7 7" />;
    case 'play': return <Path d="M7 4.5v15l13-7.5z" fill={c} stroke="none" />;
    case 'trophy': return <><Path d="M7 4h10v5a5 5 0 0 1-10 0z" /><Path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8" /></>;
    case 'ad': return <><Rect x={3} y={5} width={18} height={14} rx={2} /><Path d="M10 9.5v5l4.5-2.5z" fill={c} /></>;
    case 'whistle': return <><Circle cx={9} cy={14} r={5} /><Path d="M13 10.5L21 7v4l-6 2" /></>;
    case 'ball': return <><Circle cx={12} cy={12} r={9} /><Path d="M12 7.5l4 3-1.5 4.5h-5L8 10.5z" /></>;
    case 'sound': return <><Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><Path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>;
    case 'mute': return <><Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><Path d="M16 9.5l5 5M21 9.5l-5 5" /></>;
    case 'music': return <><Path d="M9 18V6l11-2v12" /><Circle cx={6.5} cy={18} r={2.5} /><Circle cx={17.5} cy={16} r={2.5} /></>;
    case 'star': return <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />;
  }
}

export function Icon({ name, size = 24, color = colors.g100, label }: { name: IconName; size?: number; color?: string; label?: string }) {
  // Accessibility props live on the wrapper: react-native-svg passes them to the
  // DOM on web, where a boolean `accessible` is an invalid attribute.
  return (
    <View
      style={{ width: size, height: size }} pointerEvents="none"
      accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined}
    >
      <Svg
        width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round"
      >
        {paths(name, color)}
      </Svg>
    </View>
  );
}
