import { useEffect, useState } from 'react';

import { Button, Card, Field, H1, Muted, Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchCurrentRates, type RatesRow } from '@/lib/data';
import { dateLabel, eurCents } from '@/lib/format';
import { calcCommission, CERTIFIED, parseEuro } from '@/lib/scoring';
import { supabase } from '@/lib/supabase';

// Seit November 2026: fester Betrag je Fahrzeug + Anteil am zertifizierten Gebrauchtwagen.
// Anteile an Bankprovision, Winterrädern und Zulassung gibt es nicht mehr (werden mit 0 gespeichert).
const FIELDS = [
  { key: 'base_amount', label: 'Provision je Fahrzeug (€ brutto)' },
  { key: 'certified_pct', label: 'Zertifizierter Gebrauchtwagen (% vom Verkaufspreis)' },
] as const;

type Key = (typeof FIELDS)[number]['key'];

export default function Provision() {
  const { profile } = useAuth();
  const [current, setCurrent] = useState<RatesRow | null>(null);
  const [form, setForm] = useState<Record<Key, string>>({ base_amount: '', certified_pct: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);

  async function load() {
    const r = await fetchCurrentRates();
    setCurrent(r);
    if (r) setForm({
      base_amount: String(r.base_amount),
      certified_pct: String(r.certified_pct),
    });
  }
  useEffect(() => {
    load();
  }, []);

  const values = { ...(Object.fromEntries(FIELDS.map((f) => [f.key, parseEuro(form[f.key])])) as Record<Key, number>), bank_pct: 0, winter_wheels_pct: 0, registration_pct: 0 };
  const example = calcCommission({ bank_commission: 500, winter_wheels_price: 900, registration_price: 180, certified_price: 549 }, values);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from('commission_rates').insert({ ...values, created_by: profile?.id });
    setBusy(false);
    setMsg(error ? { tone: 'danger', text: 'Speichern hat nicht geklappt.' } : { tone: 'good', text: 'Gespeichert. Die neuen Sätze gelten ab sofort für neue Verkäufe.' });
    if (!error) load();
  }

  return (
    <Screen>
      <H1>Provisionssätze</H1>
      <Muted>
        Provision = fester Betrag je Fahrzeug + Anteil am Verkaufspreis des zertifizierten Gebrauchtwagens
        ({CERTIFIED.map((c) => `${c.label} ${eurCents(c.price)}`).join(', ')}). Für Bankprovision, Winterräder und Zulassung gibt es kein
        Einzelgeld; sie werden weiter für Quoten und Umsätze erfasst. Bereits gespeicherte Verkäufe behalten die Sätze, mit denen sie gerechnet wurden.
      </Muted>
      <Card>
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} keyboardType="decimal-pad" value={form[f.key]} onChangeText={(t) => setForm((s) => ({ ...s, [f.key]: t }))} />
        ))}
        <Notice>Beispiel: Fahrzeug mit Finanzierung, Winterrädern, Zulassung und zertifiziertem Gebrauchtwagen Mittelklasse (549 €) ergibt {eurCents(example)} brutto.</Notice>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button title="Neue Sätze speichern" onPress={save} busy={busy} />
        {current && <Muted>Aktuell gültig seit {dateLabel(current.valid_from)}.</Muted>}
      </Card>
    </Screen>
  );
}
