import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MonthPicker } from '@/components/MonthPicker';
import { Button, Card, colors, H1, H2, Muted, Notice, Screen } from '@/components/ui';
import type { Profile } from '@/lib/auth';
import { fetchLeaderboard, fetchTeamProgress, useLive } from '@/lib/data';
import { monthStart } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function Team() {
  const [month, setMonth] = useState(monthStart());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [teamDraft, setTeamDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useLive(
    async () => {
      const [{ data: profiles, error: e }, board, team] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, status').order('full_name'),
        fetchLeaderboard(month),
        fetchTeamProgress(month),
      ]);
      if (e) throw e;
      return { profiles: (profiles ?? []) as Profile[], board, team };
    },
    [month],
  );

  async function setStatus(id: string, status: Profile['status']) {
    const { error: e } = await supabase.from('profiles').update({ status }).eq('id', id);
    setError(e ? 'Ändern hat nicht geklappt.' : null);
    reload();
  }

  async function saveGoal(sellerId: string) {
    const raw = drafts[sellerId];
    if (raw === undefined) return;
    const target = Math.max(0, parseInt(raw, 10) || 0);
    const { error: e } = await supabase
      .from('monthly_goals')
      .upsert({ seller_id: sellerId, month, target_vehicles: target });
    if (e) setError('Ziel konnte nicht gespeichert werden.');
    else {
      setError(null);
      setSaved(sellerId);
      setDrafts(({ [sellerId]: _, ...rest }) => rest);
      reload();
    }
  }

  async function saveTeamGoal() {
    if (teamDraft === null) return;
    const { error: e } =
      teamDraft === ''
        ? await supabase.from('team_goals').delete().eq('month', month)
        : await supabase.from('team_goals').upsert({ month, target_vehicles: Math.max(0, parseInt(teamDraft, 10) || 0) });
    if (e) setError('Teamziel konnte nicht gespeichert werden.');
    else {
      setError(null);
      setSaved('team');
      setTeamDraft(null);
      reload();
    }
  }

  const profiles = data?.profiles ?? [];
  const team = data?.team;
  const goalSum = (data?.board ?? []).reduce((a, r) => a + (r.target_vehicles ?? 0), 0);
  const pending = profiles.filter((p) => p.status === 'pending');
  const sellers = profiles.filter((p) => p.status !== 'pending' && p.role === 'seller');

  return (
    <Screen maxWidth={800}>
      <H1>Team und Ziele</H1>
      {error && <Notice tone="danger">{error}</Notice>}

      {pending.length > 0 && (
        <Card>
          <H2>Warten auf Freigabe</H2>
          {pending.map((p) => (
            <View key={p.id} style={styles.row}>
              <Text style={styles.name}>{p.full_name || 'Ohne Namen'}</Text>
              <Button small title="Freigeben" onPress={() => setStatus(p.id, 'active')} />
              <Button small variant="ghost" title="Ablehnen" onPress={() => setStatus(p.id, 'inactive')} />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <View style={styles.head}>
          <H2>Monatsziele</H2>
          <MonthPicker month={month} onChange={(m) => { setMonth(m); setDrafts({}); setTeamDraft(null); }} />
        </View>
        <View style={[styles.row, styles.teamRow]}>
          <Text style={styles.name}>Teamziel (ganzes Haus)</Text>
          <Text style={styles.stand}>{team?.vehicles ?? 0} verkauft</Text>
          <TextInput
            accessibilityLabel="Teamziel für den Monat"
            style={[styles.goal, saved === 'team' && { borderColor: colors.good }]}
            keyboardType="number-pad"
            placeholder="–"
            placeholderTextColor={colors.muted}
            value={teamDraft ?? (team?.target_vehicles != null ? String(team.target_vehicles) : '')}
            onChangeText={(t) => setTeamDraft(t.replace(/\D/g, ''))}
            onBlur={saveTeamGoal}
            onSubmitEditing={saveTeamGoal}
          />
        </View>
        {goalSum > 0 && <Muted>Zum Vergleich: Die Einzelziele ergeben zusammen {goalSum} Fahrzeuge.</Muted>}
        <Muted>Ziel an verkauften Fahrzeugen. Speichert, sobald du das Feld verlässt.</Muted>
        {sellers.map((p) => {
          const b = data?.board.find((r) => r.seller_id === p.id);
          const value = drafts[p.id] ?? (b?.target_vehicles != null ? String(b.target_vehicles) : '');
          return (
            <View key={p.id} style={styles.row}>
              <Text style={[styles.name, p.status === 'inactive' && { color: colors.muted }]} numberOfLines={1}>
                {p.full_name}
                {p.status === 'inactive' ? ' (deaktiviert)' : ''}
              </Text>
              {p.status === 'active' && (
                <>
                  <Text style={styles.stand}>{b?.vehicles ?? 0} verkauft</Text>
                  <TextInput
                    accessibilityLabel={`Monatsziel ${p.full_name}`}
                    style={[styles.goal, saved === p.id && { borderColor: colors.good }]}
                    keyboardType="number-pad"
                    placeholder="–"
                    placeholderTextColor={colors.muted}
                    value={value}
                    onChangeText={(t) => setDrafts((d) => ({ ...d, [p.id]: t.replace(/\D/g, '') }))}
                    onBlur={() => saveGoal(p.id)}
                    onSubmitEditing={() => saveGoal(p.id)}
                  />
                </>
              )}
              <Button
                small
                variant="ghost"
                title={p.status === 'active' ? 'Deaktivieren' : 'Aktivieren'}
                onPress={() => setStatus(p.id, p.status === 'active' ? 'inactive' : 'active')}
              />
            </View>
          );
        })}
        {data && sellers.length === 0 && <Muted>Noch keine freigegebenen Verkäufer.</Muted>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line },
  teamRow: { backgroundColor: colors.accentSoft, borderRadius: 6, paddingHorizontal: 8, borderBottomWidth: 0, marginTop: 4 },
  name: { flex: 1, minWidth: 140, fontWeight: '600', color: colors.fg },
  stand: { color: colors.muted, fontVariant: ['tabular-nums'] },
  goal: { width: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, textAlign: 'right', fontSize: 16, color: colors.fg, backgroundColor: colors.surface },
});
