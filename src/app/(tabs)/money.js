/**
 * Money tab — log expenses and see where the money goes: monthly total, budget meter,
 * a category donut, the last 6 months, and the list of expenses (tap to edit).
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, Card, IconBtn, SectionTitle, Empty, Btn, C, shadow } from '../../components/ui';
import { Donut, MonthBars, BudgetMeter, ShareBar } from '../../components/money/Charts';
import { ExpenseSheet, BudgetSheet } from '../../components/money/MoneySheets';
import { usePersisted, KEYS } from '../../lib/storage';
import {
  EXP_CAT, kr, monthKey, shiftMonth, monthLong, monthShort, inMonth, sum, byCategory,
  monthTotals, groupByDay, budgetStatus, daysInMonth,
} from '../../lib/money';
import { fmtDay, ymd, parseYmd } from '../../lib/dates';

const ACCENT = C.primary;

export default function MoneyScreen() {
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = usePersisted(KEYS.expenses, []);
  const [settings, setSettings] = usePersisted(KEYS.moneySettings, { budget: 0, lastCat: 'groceries' });

  const thisMonth = monthKey();
  const [month, setMonth] = useState(thisMonth);
  const [selCat, setSelCat] = useState(null);
  const [edit, setEdit] = useState(null); // null | 'new' | expense
  const [showBudget, setShowBudget] = useState(false);
  const [opens, setOpens] = useState(0); // bumps each time a sheet opens → fresh form
  const openEdit = (e) => { setOpens((n) => n + 1); setEdit(e); };
  const openBudget = () => { setOpens((n) => n + 1); setShowBudget(true); };

  const list = useMemo(() => inMonth(expenses, month), [expenses, month]);
  const spent = sum(list);
  const prevSpent = useMemo(() => sum(inMonth(expenses, shiftMonth(month, -1))), [expenses, month]);
  const cats = useMemo(() => byCategory(list), [list]);
  const trend = useMemo(() => monthTotals(expenses, month < thisMonth ? shiftMonth(month, Math.min(2, monthDiff(month, thisMonth))) : month, 6), [expenses, month, thisMonth]);
  const status = budgetStatus(spent, settings.budget, month);
  const shown = selCat ? list.filter((e) => e.cat === selCat) : list;
  const days = useMemo(() => groupByDay(shown), [shown]);
  const sel = selCat ? cats.find((c) => c.key === selCat) : null;

  const isNow = month === thisMonth;
  const daysSoFar = isNow ? parseYmd(ymd()).getDate() : daysInMonth(month);
  const perDay = spent / daysSoFar;
  const change = prevSpent ? (spent - prevSpent) / prevSpent : null;

  const pickMonth = (k) => { setMonth(k); setSelCat(null); };
  const save = (e) => {
    setExpenses((all) => (all.some((x) => x.id === e.id) ? all.map((x) => (x.id === e.id ? e : x)) : [...all, e]));
    setSettings((s) => ({ ...s, lastCat: e.cat }));
    if (monthKey(e.date) !== month) pickMonth(monthKey(e.date));
    setEdit(null);
  };
  const remove = (id) => { setExpenses((all) => all.filter((x) => x.id !== id)); setEdit(null); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title="Money" subtitle={expenses.length ? `${kr(spent)} spent in ${monthLong(month).split(' ')[0]}` : 'Track what you spend'}
        right={<IconBtn label="🎯" onPress={openBudget} />} />

      <View style={st.monthRow}>
        <TouchableOpacity hitSlop={10} onPress={() => pickMonth(shiftMonth(month, -1))}><Text style={st.arrow}>‹</Text></TouchableOpacity>
        <Text style={st.monthTitle}>{monthLong(month)}</Text>
        <TouchableOpacity hitSlop={10} disabled={isNow} onPress={() => pickMonth(shiftMonth(month, 1))}>
          <Text style={[st.arrow, isNow && { opacity: 0.2 }]}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {expenses.length === 0 ? (
          <Card>
            <Empty emoji="💸" title="No expenses yet" text="Tap + to log what you spend. You'll get a breakdown by category, a monthly budget and a 6-month trend.">
              <Btn label="Add first expense" kind="primary" color={ACCENT} style={{ marginTop: 14 }} onPress={() => openEdit('new')} />
            </Empty>
          </Card>
        ) : (
          <>
            {/* ── Headline ── */}
            <Card>
              <Text style={st.kicker}>Spent {isNow ? 'so far' : `in ${monthShort(month)}`}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={st.hero}>{kr(spent)}</Text>
                {status && <Text style={st.heroOf}>  of {kr(settings.budget)}</Text>}
              </View>
              {status ? (
                <>
                  <BudgetMeter ratio={status.ratio} pace={status.pace} over={status.over} />
                  <Text style={[st.meterText, status.over && { color: C.danger }]}>
                    {status.over
                      ? `${kr(-status.left)} over budget`
                      : `${kr(status.left)} left${isNow ? ` · ${kr(status.perDay)}/day for ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'}` : ''}`}
                  </Text>
                </>
              ) : (
                <TouchableOpacity onPress={openBudget}><Text style={st.link}>Set a monthly budget →</Text></TouchableOpacity>
              )}
              <View style={st.tiles}>
                <Tile label="Per day" value={kr(perDay)} />
                <Tile label="Expenses" value={String(list.length)} />
                <Tile label={`vs ${monthShort(shiftMonth(month, -1))}`}
                  value={change == null ? '—' : `${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${Math.abs(Math.round(change * 100))}%`}
                  tone={change == null ? null : change > 0 ? C.danger : '#0f8a5f'} />
              </View>
            </Card>

            {/* ── Category donut + legend ── */}
            <SectionTitle right={selCat && <TouchableOpacity onPress={() => setSelCat(null)}><Text style={st.link}>Show all</Text></TouchableOpacity>}>
              Where it went
            </SectionTitle>
            <Card>
              {cats.length === 0 ? (
                <Text style={st.muted}>Nothing logged in {monthLong(month)}.</Text>
              ) : (
                <>
                  <Donut data={cats} selected={selCat} onSelect={setSelCat}>
                    <Text style={st.holeLabel} numberOfLines={1}>{sel ? `${sel.emoji} ${sel.label}` : 'Total'}</Text>
                    <Text style={st.holeValue}>{kr(sel ? sel.value : spent)}</Text>
                    {sel && <Text style={st.holeSub}>{Math.round(sel.share * 100)}% of the month</Text>}
                  </Donut>
                  <View style={{ marginTop: 14 }}>
                    {[...cats].sort((a, b) => b.value - a.value).map((c) => {
                      const on = selCat === c.key;
                      return (
                        <TouchableOpacity key={c.key} style={st.legendRow} onPress={() => setSelCat(on ? null : c.key)}>
                          <View style={[st.dot, { backgroundColor: c.color }]} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row' }}>
                              <Text style={[st.legendLabel, on && { fontWeight: '700' }]} numberOfLines={1}>{c.emoji} {c.label}</Text>
                              <Text style={st.legendValue}>{kr(c.value)}</Text>
                              <Text style={st.legendPct}>{Math.round(c.share * 100)}%</Text>
                            </View>
                            <ShareBar share={c.share} color={c.color} faded={selCat && !on} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </Card>

            {/* ── Trend ── */}
            <SectionTitle>Last 6 months</SectionTitle>
            <Card>
              <MonthBars data={trend} selectedKey={month} onSelect={pickMonth} budget={settings.budget} color="#2a78d6" />
              <Text style={st.hint}>Tap a month to see its breakdown.</Text>
            </Card>

            {/* ── List ── */}
            <SectionTitle>{sel ? `${sel.emoji} ${sel.label}` : 'Expenses'}</SectionTitle>
            {days.length === 0 ? (
              <Card><Text style={st.muted}>No expenses here.</Text></Card>
            ) : days.map((g) => (
              <Card key={g.day} style={{ paddingVertical: 8 }}>
                <View style={st.dayHead}>
                  <Text style={st.day}>{fmtDay(g.day)}{g.day === ymd() ? ' · today' : ''}</Text>
                  <Text style={st.dayTotal}>{kr(g.total, { decimals: true })}</Text>
                </View>
                {g.items.map((e) => {
                  const c = EXP_CAT[e.cat] || EXP_CAT.other;
                  return (
                    <TouchableOpacity key={e.id} style={st.row} onPress={() => openEdit(e)}>
                      <View style={[st.rowIcon, { backgroundColor: c.color + '22' }]}><Text style={{ fontSize: 17 }}>{c.emoji}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.rowTitle} numberOfLines={1}>{e.note || c.label}</Text>
                        {!!e.note && <Text style={st.rowSub}>{c.label}</Text>}
                      </View>
                      <Text style={st.rowAmount}>{kr(e.amount, { decimals: true })}</Text>
                    </TouchableOpacity>
                  );
                })}
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={[st.fab, { bottom: 18 + Math.max(insets.bottom - 30, 0) }]} onPress={() => openEdit('new')} accessibilityLabel="Add expense">
        <Text style={st.fabText}>＋</Text>
      </TouchableOpacity>

      <ExpenseSheet key={'e' + opens} expense={edit} lastCat={settings.lastCat} defaultDay={isNow ? ymd() : `${month}-01`}
        onSave={save} onDelete={remove} onClose={() => setEdit(null)} />
      <BudgetSheet key={'b' + opens} visible={showBudget} budget={settings.budget}
        onSave={(b) => { setSettings((s) => ({ ...s, budget: b })); setShowBudget(false); }}
        onClose={() => setShowBudget(false)} />
    </View>
  );
}

/** Months from a to b ('YYYY-MM'). */
function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

const Tile = ({ label, value, tone }) => (
  <View style={st.tile}>
    <Text style={st.tileLabel}>{label}</Text>
    <Text style={[st.tileValue, tone && { color: tone }]} numberOfLines={1}>{value}</Text>
  </View>
);

const st = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: 8, gap: 18 },
  arrow: { fontSize: 28, color: C.text, paddingHorizontal: 8, lineHeight: 30 },
  monthTitle: { fontSize: 16, fontWeight: '700', color: C.text, minWidth: 140, textAlign: 'center' },
  kicker: { fontSize: 13, color: C.sub, fontWeight: '600' },
  hero: { fontSize: 36, fontWeight: '800', color: C.text, marginTop: 2 },
  heroOf: { fontSize: 15, color: C.sub, fontWeight: '600' },
  meterText: { fontSize: 13, color: C.sub, marginTop: 7 },
  link: { color: C.primary, fontSize: 14, fontWeight: '600', marginTop: 6 },
  tiles: { flexDirection: 'row', marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.line, paddingTop: 12 },
  tile: { flex: 1 },
  tileLabel: { fontSize: 12, color: C.sub },
  tileValue: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 2 },
  holeLabel: { fontSize: 13, color: C.sub, maxWidth: 120, textAlign: 'center' },
  holeValue: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 2 },
  holeSub: { fontSize: 11, color: C.sub, marginTop: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  legendLabel: { flex: 1, fontSize: 14, color: C.text },
  legendValue: { fontSize: 14, fontWeight: '600', color: C.text },
  legendPct: { width: 42, textAlign: 'right', fontSize: 13, color: C.sub },
  hint: { fontSize: 12, color: C.sub, marginTop: 10, textAlign: 'center' },
  muted: { color: C.sub, fontSize: 14 },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  day: { fontSize: 13, fontWeight: '700', color: '#888' },
  dayTotal: { fontSize: 13, fontWeight: '600', color: '#888' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rowTitle: { fontSize: 15, color: C.text, fontWeight: '500' },
  rowSub: { fontSize: 12, color: C.sub, marginTop: 1 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: C.text },
  fab: {
    position: 'absolute', right: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: ACCENT,
    alignItems: 'center', justifyContent: 'center', ...shadow, shadowOpacity: 0.25,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '600', marginTop: -2 },
});
