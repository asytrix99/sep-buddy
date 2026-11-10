import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Modal, ScrollView, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { GlassView, isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';

/**
 * App theme — light blue. Change colours here and every screen follows.
 * primary passes 4.9:1 with white text; sky is for fills without text on them.
 */
export const C = {
  bg: '#e8f4fd', // page background (light blue)
  card: '#fff',
  text: '#0f2a3f', // deep navy
  sub: '#52697d',
  line: '#cfe3f3',
  primary: '#1a74b8', // buttons, links, active tab
  sky: '#5bb4ee', // highlights, today circle, meters
  soft: '#d6ebfb', // tinted chips, segmented controls, soft buttons
  tabBar: '#f4faff',
  danger: '#d6336c',
};

export const shadow = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 };

/**
 * Apple Liquid Glass (iOS 26+). Falls back to a frosted-looking plain View on older iOS,
 * on Android, or when the API is missing. Never animate opacity on/above a GlassView
 * (Apple: it stops rendering) — animate transforms instead.
 */
export const HAS_GLASS = (() => {
  if (Platform.OS !== 'ios') return false;
  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

export function Glass({ style, tint, interactive, clear, fallback = 'rgba(255,255,255,0.94)', children, ...rest }) {
  if (HAS_GLASS) {
    return (
      <GlassView style={style} glassEffectStyle={clear ? 'clear' : 'regular'} tintColor={tint}
        isInteractive={!!interactive} colorScheme="light" {...rest}>
        {children}
      </GlassView>
    );
  }
  return <View style={[{ backgroundColor: tint || fallback }, shadow, style]} {...rest}>{children}</View>;
}

/** Height of the floating glass tab bar, and how much room to leave under scrolling content. */
export const TAB_BAR_H = 62;
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_H + Math.max(insets.bottom - 6, 10) + 10;
}

/**
 * A pressable glass button. Gives feedback by shrinking a little — never by fading, because
 * opacity on a GlassView's parent makes the glass glitch (ghost copies, or it vanishes).
 * Keep its children the same while it's on screen; swapping them mid-press also ghosts.
 */
export function GlassButton({ onPress, disabled, style, glassStyle, tint, interactive, accessibilityLabel, children }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [style, pressed && { transform: [{ scale: 0.95 }] }]}>
      <Glass tint={tint} interactive={interactive} style={glassStyle}>{children}</Glass>
    </Pressable>
  );
}

/** Round glass ＋ button that floats just above the tab bar. */
export function Fab({ onPress, label = '＋', accessibilityLabel }) {
  const space = useTabBarSpace();
  return (
    <GlassButton onPress={onPress} accessibilityLabel={accessibilityLabel} interactive tint={C.primary}
      style={[s.fabWrap, { bottom: space + 4 }]} glassStyle={s.fab}>
      <Text style={s.fabText}>{label}</Text>
    </GlassButton>
  );
}

export function ScreenHeader({ title, subtitle, right }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.hTitle}>{title}</Text>
        {!!subtitle && <Text style={s.hSub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export const Card = ({ style, children }) => <View style={[s.card, style]}>{children}</View>;

export const SectionTitle = ({ children, right }) => (
  <View style={s.sectionRow}>
    <Text style={s.section}>{children}</Text>
    {right}
  </View>
);

export function Btn({ label, onPress, kind = 'plain', style, small, disabled, color }) {
  const primary = kind === 'primary';
  const bg = primary ? color || C.primary : kind === 'danger' ? '#fde8ef' : C.soft;
  const fg = primary ? '#fff' : kind === 'danger' ? C.danger : color || C.text;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}
      style={[s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : 1 }, style]}>
      <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, on, onPress, color = C.primary, style }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, on && { backgroundColor: color, borderColor: color }, style]}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export const IconBtn = ({ label, onPress, style }) => (
  <TouchableOpacity onPress={onPress} style={[s.iconBtn, style]} hitSlop={8}>
    <Text style={{ fontSize: 20 }}>{label}</Text>
  </TouchableOpacity>
);

export function Field({ label, style, ...props }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {!!label && <Text style={s.label}>{label}</Text>}
      <TextInput placeholderTextColor="#999" style={[s.input, style]} {...props} />
    </View>
  );
}

export const Label = ({ children }) => <Text style={s.label}>{children}</Text>;

/** Bottom-sheet style modal with a title and Done/Cancel. */
export function Sheet({ visible, title, onClose, onSave, saveLabel = 'Save', children }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheetHead}>
          <TouchableOpacity onPress={onClose}><Text style={s.sheetBtn}>{onSave ? 'Cancel' : 'Done'}</Text></TouchableOpacity>
          <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text>
          {onSave ? <TouchableOpacity onPress={onSave}><Text style={[s.sheetBtn, { fontWeight: '700' }]}>{saveLabel}</Text></TouchableOpacity> : <View style={{ width: 50 }} />}
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Date + time picker that behaves the same on iOS (inline compact) and Android (dialogs). */
export function DateTimeField({ label, value, onChange, mode = 'datetime' }) {
  const v = value || new Date();
  if (Platform.OS === 'ios') {
    return (
      <View style={[s.dtRow, { marginBottom: 12 }]}>
        {!!label && <Text style={[s.label, { flex: 1, marginBottom: 0 }]}>{label}</Text>}
        <DateTimePicker value={v} mode={mode} display="compact" minuteInterval={5} onChange={(_, d) => d && onChange(d)} />
      </View>
    );
  }
  const open = (m) => DateTimePickerAndroid.open({
    value: v, mode: m, is24Hour: true,
    onChange: (e, d) => { if (e.type === 'set' && d) onChange(d); },
  });
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <View style={{ marginBottom: 12 }}>
      {!!label && <Text style={s.label}>{label}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {mode !== 'time' && <Btn label={`📅 ${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`} onPress={() => open('date')} />}
        {mode !== 'date' && <Btn label={`🕒 ${pad(v.getHours())}:${pad(v.getMinutes())}`} onPress={() => open('time')} />}
      </View>
    </View>
  );
}

export const Empty = ({ emoji, title, text, children }) => (
  <View style={s.empty}>
    <Text style={{ fontSize: 34 }}>{emoji}</Text>
    <Text style={s.emptyTitle}>{title}</Text>
    {!!text && <Text style={s.emptyText}>{text}</Text>}
    {children}
  </View>
);

export function Toggle({ label, sub, value, onChange }) {
  return (
    <TouchableOpacity style={s.toggleRow} onPress={() => onChange(!value)}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        {!!sub && <Text style={s.toggleSub}>{sub}</Text>}
      </View>
      <View style={[s.switch, value && s.switchOn]}><View style={[s.knob, value && s.knobOn]} /></View>
    </TouchableOpacity>
  );
}

export const s = StyleSheet.create({
  fabWrap: { position: 'absolute', right: 18, borderRadius: 30, ...shadow, shadowOpacity: 0.18 },
  fab: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '600', marginTop: -2 },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: C.bg },
  hTitle: { fontSize: 28, fontWeight: '800', color: C.text },
  hSub: { fontSize: 14, color: C.sub, marginTop: 2 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 12, ...shadow },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, marginBottom: 8 },
  section: { flex: 1, fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  btnText: { fontSize: 15, fontWeight: '600' },
  chip: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.line, marginRight: 6, marginBottom: 6 },
  chipText: { fontSize: 13, color: C.text, fontWeight: '500' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 11, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.text },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line, backgroundColor: C.tabBar },
  sheetTitle: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  sheetBtn: { fontSize: 16, color: C.primary, minWidth: 50 },
  dtRow: { flexDirection: 'row', alignItems: 'center' },
  empty: { alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8, color: C.text },
  emptyText: { fontSize: 14, color: C.sub, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  toggleLabel: { fontSize: 15, color: C.text, fontWeight: '500' },
  toggleSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  switch: { width: 46, height: 28, borderRadius: 14, backgroundColor: '#d5d7dd', padding: 3 },
  switchOn: { backgroundColor: C.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 18 }] },
});
