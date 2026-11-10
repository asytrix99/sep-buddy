/**
 * Add/edit an expense, and set the monthly budget.
 * The parent gives each sheet a `key` that changes when it opens, so the form starts fresh
 * from props (no syncing state in effects).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { Sheet, Field, Label, Btn, DateTimeField, C } from '../ui';
import { EXP_CATS, parseAmount } from '../../lib/money';
import { parseYmd, ymd, uid } from '../../lib/dates';

export function ExpenseSheet({ expense, defaultDay, lastCat, onSave, onDelete, onClose }) {
  const visible = !!expense;
  const isNew = expense === 'new';
  const existing = visible && !isNew ? expense : null;
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [cat, setCat] = useState(existing ? existing.cat : lastCat || 'groceries');
  const [note, setNote] = useState(existing?.note || '');
  const [date, setDate] = useState(() => parseYmd(existing ? existing.date : defaultDay || ymd()));

  const save = () => {
    const a = parseAmount(amount);
    if (!(a > 0)) return Alert.alert('Amount needed', 'Type how much you spent, e.g. 89 or 89.50.');
    onSave({ id: isNew ? uid() : expense.id, amount: a, cat, note: note.trim(), date: ymd(date) });
  };

  return (
    <Sheet visible={visible} title={isNew ? 'New expense' : 'Edit expense'} onClose={onClose} onSave={save}>
      <View style={st.amountRow}>
        <TextInput
          style={st.amount}
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor="#c4c7cc"
          keyboardType="decimal-pad"
          autoFocus={isNew}
          maxLength={9}
        />
        <Text style={st.currency}>kr</Text>
      </View>

      <Label>Category</Label>
      <View style={st.grid}>
        {EXP_CATS.map((c) => {
          const on = c.key === cat;
          return (
            <Text key={c.key} onPress={() => setCat(c.key)} suppressHighlighting
              style={[st.cat, on && { borderColor: c.color, backgroundColor: c.color + '1a' }]}>
              {c.emoji}{'\n'}<Text style={[st.catLabel, on && { color: C.text, fontWeight: '700' }]}>{c.label}</Text>
            </Text>
          );
        })}
      </View>

      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. ICA Maxi, SJ ticket" returnKeyType="done" />
      <DateTimeField label="Date" mode="date" value={date} onChange={setDate} />

      {!isNew && (
        <Btn label="Delete expense" kind="danger" style={{ marginTop: 12 }}
          onPress={() => Alert.alert('Delete this expense?', undefined, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(expense.id) },
          ])} />
      )}
    </Sheet>
  );
}

export function BudgetSheet({ visible, budget, onSave, onClose }) {
  const [v, setV] = useState(budget ? String(budget) : '');
  const save = () => {
    if (!v.trim()) return onSave(0);
    const a = parseAmount(v);
    if (!(a > 0)) return Alert.alert('Budget', 'Type a monthly amount, e.g. 6000 — or leave it empty for no budget.');
    onSave(a);
  };
  return (
    <Sheet visible={visible} title="Monthly budget" onClose={onClose} onSave={save}>
      <Field label="How much do you want to spend per month? (kr)" value={v} onChangeText={setV}
        keyboardType="decimal-pad" placeholder="e.g. 6000" autoFocus />
      <Text style={st.help}>
        The Money tab then shows how much is left, a daily allowance for the rest of the month, and a marker for where
        you would be if you spent evenly. Leave it empty to turn the budget off.
      </Text>
    </Sheet>
  );
}

const st = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginVertical: 18 },
  amount: { fontSize: 52, fontWeight: '800', color: C.text, minWidth: 80, textAlign: 'right' },
  currency: { fontSize: 26, fontWeight: '700', color: C.sub, marginLeft: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  cat: {
    width: '31.4%', textAlign: 'center', fontSize: 22, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', overflow: 'hidden',
  },
  catLabel: { fontSize: 12, color: C.sub },
  help: { fontSize: 13, color: C.sub, lineHeight: 19 },
});
