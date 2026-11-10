/**
 * Charts for the Money tab: a donut (category split), a month bar chart, and a budget meter.
 * Text always uses normal text colours; the coloured dot/segment next to it carries the category.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { kr } from '../../lib/money';
import { C } from '../ui';

/**
 * Donut of `data` ([{ key, color, value }]). Tap a slice (or a legend row) to select it;
 * the others fade back. `children` is drawn in the hole.
 */
export function Donut({ data, size = 210, thickness = 28, selected, onSelect, children }) {
  const r = (size - thickness) / 2 - 6;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((a, d) => a + d.value, 0);
  const gap = data.length > 1 ? 3 : 0; // thin surface gap between slices
  // Where each slice starts along the ring (running total of the earlier slices).
  const starts = data.reduce((out, d, i) => [...out, i ? out[i - 1] + (data[i - 1].value / total) * circ : 0], []);
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {total === 0 && <Circle cx={size / 2} cy={size / 2} r={r} stroke="#eceef1" strokeWidth={thickness} fill="none" />}
          {data.map((d, i) => {
            const len = (d.value / total) * circ;
            const dash = Math.max(len - gap, 0.8);
            const offset = -starts[i];
            const isSel = selected === d.key;
            const faded = selected && !isSel;
            return (
              <Circle
                key={d.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={isSel ? thickness + 8 : thickness}
                strokeOpacity={faded ? 0.25 : 1}
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={offset}
                onPress={() => onSelect?.(isSel ? null : d.key)}
              />
            );
          })}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, st.hole]} pointerEvents="none">{children}</View>
    </View>
  );
}

/**
 * Vertical bars for monthly totals ([{ key, label, total }]). The selected month is solid,
 * the rest are faded; an optional dashed budget line. Tap a bar to pick that month.
 */
export function MonthBars({ data, selectedKey, onSelect, budget, color = '#2a78d6', height = 130 }) {
  const [w, setW] = useState(0);
  const max = Math.max(budget || 0, ...data.map((d) => d.total), 1);
  const scale = (v) => (v / max) * height;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ height: height + 20, flexDirection: 'row', alignItems: 'flex-end' }}>
        {!!budget && w > 0 && (
          <View pointerEvents="none" style={[st.budgetLine, { bottom: scale(budget) }]}>
            <Text style={st.budgetTag}>budget</Text>
          </View>
        )}
        {data.map((d) => {
          const sel = d.key === selectedKey;
          const over = !!budget && d.total > budget;
          return (
            <TouchableOpacity key={d.key} style={st.slot} onPress={() => onSelect?.(d.key)} activeOpacity={0.7}
              accessibilityLabel={`${d.label}: ${kr(d.total)}`}>
              {sel && <Text style={st.barValue} numberOfLines={1}>{kr(d.total)}</Text>}
              <View style={[st.bar, {
                height: Math.max(scale(d.total), d.total ? 3 : 0),
                backgroundColor: color,
                opacity: sel ? 1 : 0.28,
              }]} />
              {over && <View style={[st.overDot, { opacity: sel ? 1 : 0.5 }]} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={st.axis} />
      <View style={{ flexDirection: 'row' }}>
        {data.map((d) => (
          <Text key={d.key} style={[st.month, d.key === selectedKey && st.monthSel]}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

/** Horizontal budget meter with an optional "even pace" tick for the current month. */
export function BudgetMeter({ ratio, pace, over }) {
  const fill = Math.min(ratio, 1);
  const fg = over ? '#d6336c' : ratio > (pace ?? 1) + 0.05 ? '#eda100' : '#1baf7a';
  return (
    <View style={st.meter}>
      <View style={[st.meterFill, { width: `${fill * 100}%`, backgroundColor: fg }]} />
      {pace != null && <View style={[st.paceTick, { left: `${Math.min(pace, 1) * 100}%` }]} />}
    </View>
  );
}

/** A thin share bar used in the category legend. */
export const ShareBar = ({ share, color, faded }) => (
  <View style={st.shareTrack}>
    <View style={[st.shareFill, { width: `${Math.max(share * 100, 1.5)}%`, backgroundColor: color, opacity: faded ? 0.3 : 1 }]} />
  </View>
);

const st = StyleSheet.create({
  hole: { alignItems: 'center', justifyContent: 'center' },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '52%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barValue: { fontSize: 11, fontWeight: '700', color: C.text, marginBottom: 4 },
  overDot: { position: 'absolute', top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: '#d6336c' },
  axis: { height: StyleSheet.hairlineWidth, backgroundColor: '#c9ccd2' },
  month: { flex: 1, textAlign: 'center', fontSize: 11, color: C.sub, marginTop: 5 },
  monthSel: { color: C.text, fontWeight: '700' },
  budgetLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#9aa0a8' },
  budgetTag: { position: 'absolute', right: 0, top: -15, fontSize: 10, color: C.sub },
  meter: { height: 10, borderRadius: 5, backgroundColor: '#eceef1', overflow: 'visible', marginTop: 10 },
  meterFill: { height: '100%', borderRadius: 5 },
  paceTick: { position: 'absolute', top: -3, width: 2, height: 16, marginLeft: -1, backgroundColor: '#444', borderRadius: 1 },
  shareTrack: { height: 6, borderRadius: 3, backgroundColor: '#eceef1', marginTop: 5 },
  shareFill: { height: '100%', borderRadius: 3 },
});
