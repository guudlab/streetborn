import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import type { MahalleColor, MahalleEmblem } from '../net/api.ts';

/** Fill and line colour of each mahalle colour (from the mahalle mockups). */
export const MAHALLE_COLORS: Record<MahalleColor, { fill: string; line: string }> = {
  lime: { fill: '#3F4D18', line: '#DEFE83' },
  blue: { fill: '#2E3A52', line: '#C9D6F0' },
  red: { fill: '#4A1F1A', line: '#FFB3A6' },
  purple: { fill: '#3A2A4D', line: '#D9C6FF' },
  teal: { fill: '#1F3D3A', line: '#9FF0E1' },
  white: { fill: '#262626', line: '#FFFFFF' },
};
export const MAHALLE_COLOR_LIST = Object.keys(MAHALLE_COLORS) as MahalleColor[];
export const MAHALLE_EMBLEM_LIST: MahalleEmblem[] = ['shield', 'circle', 'diamond'];

const SHAPE: Record<MahalleEmblem, string> = {
  shield: 'M24 3 42 9v14c0 11-8 19-18 22C14 42 6 34 6 23V9z',
  circle: '',
  diamond: 'M24 4 44 24 24 44 4 24z',
};

/** The crest of a mahalle: a shape in the mahalle colour with the first letters of its name. */
export function Emblem({ shape, color, name, size = 48 }: { shape: MahalleEmblem; color: MahalleColor; name?: string; size?: number }) {
  const c = MAHALLE_COLORS[color];
  const label = (name ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toLocaleUpperCase('tr');
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      {shape === 'circle'
        ? <Circle cx={24} cy={24} r={20} fill={c.fill} stroke={c.line} strokeWidth={2} />
        : <Path d={SHAPE[shape]} fill={c.fill} stroke={c.line} strokeWidth={2} strokeLinejoin="round" />}
      {label !== '' && <SvgText x={24} y={28.5} textAnchor="middle" fontFamily="Inter_700Bold" fontWeight="700" fontSize={label.length > 2 ? 11 : 13} fill={c.line}>{label}</SvgText>}
    </Svg>
  );
}
