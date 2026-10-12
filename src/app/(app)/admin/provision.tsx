import { useEffect, useState } from 'react';

import { Button, Card, Field, H1, Muted, Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchCurrentRates, type RatesRow } from '@/lib/data';
import { dateLabel, eurCents } from '@/lib/format';
import { calcCommission, parseEuro } from '@/lib/scoring';
import { supabase } from '@/lib/supabase';

const FIELDS = [
  { key: 'base_amount', label: 'Grundprovision je Fahrzeug (€)' },
  { key: 'bank_pct', label: 'Anteil an der Bankprovision (%)' },
  { key: 'winter_wheels_pct', label: 'Winterräder (% vom Verkaufspreis)' },
  { key: 'registration_pct', label: 'Zulassung (% vom Verkaufspreis)' },
] as const;

type Key = (typeof FIELDS)[number]['key'];

export default function Provision() {
  const { profile } = useAuth();
  const [current, setCurrent] = useState<RatesRow | null>(null);
  const [form, setForm] = useState<Record<Key, string>>({ base_amount: '', bank_pct: '', winter_wheels_pct: '', registration_pct: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);

  async function load() {
    const r = await fetchCurrentRates();
    setCurrent(r);
    if (r) setForm({
      base_amount: String(r.base_amount),
      bank_pct: String(r.bank_pct),
      winter_wheels_pct: String(r.winter_wheels_pct),
      registration_pct: String(r.registration_pct),
    });
  }
  useEffect(() => {
    load();
  }, []);

  const values = Object.fromEntries(FIELDS.map((f) => [f.key, parseEuro(form[f.key])])) as Record<Key, number>;
  const example = calcCommission({ bank_commission: 500, winter_wheels_price: 900, registration_price: 180 }, values);

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
        Provision = Grundprovision + Bankprovision gesamt × Anteil + Preis Winterräder × Satz + Preis Zulassung × Satz.
        Bereits gespeicherte Verkäufe behalten die Sätze, mit denen sie gerechnet wurden.
      </Muted>
      <Card>
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} keyboardType="decimal-pad" value={form[f.key]} onChangeText={(t) => setForm((s) => ({ ...s, [f.key]: t }))} />
        ))}
        <Notice>Beispiel: 500 € Bankprovision, Winterräder für 900 €, Zulassung für 180 € ergibt {eurCents(example)}.</Notice>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button title="Neue Sätze speichern" onPress={save} busy={busy} />
        {current && <Muted>Aktuell gültig seit {dateLabel(current.valid_from)}.</Muted>}
      </Card>
    </Screen>
  );
}
