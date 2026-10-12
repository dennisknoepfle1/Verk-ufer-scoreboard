import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { BrandBar, Button, Card, Field, H1, Muted, Notice, Screen } from '@/components/ui';
import { fetchCurrentRates, type RatesRow } from '@/lib/data';
import { eurCents } from '@/lib/format';
import { calcCommission, parseEuro } from '@/lib/scoring';
import { useAuth } from '@/lib/auth';
import { enqueue, newClientId, type PendingSale } from '@/lib/offline';
import { isOnline, kv, sendSale } from '@/lib/pending';

export default function NewSale() {
  const { profile } = useAuth();
  const [rates, setRates] = useState<RatesRow | null>(null);
  const [vehicle, setVehicle] = useState('');
  const [bank, setBank] = useState('');
  const [winter, setWinter] = useState('');
  const [registration, setRegistration] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentRates().then(setRates).catch(() => setRates(null));
  }, []);

  const input = {
    bank_commission: parseEuro(bank),
    winter_wheels_price: parseEuro(winter),
    registration_price: parseEuro(registration),
  };
  const preview = rates ? calcCommission(input, rates) : null;

  async function save() {
    setError(null);
    if (!vehicle.trim()) {
      setError('Bitte das Fahrzeug angeben.');
      return;
    }
    if (!profile) return;
    const now = new Date();
    const sale: PendingSale = {
      client_id: newClientId(),
      user_id: profile.id,
      vehicle: vehicle.trim(),
      ...input,
      // Verkaufstag ist der Tag der Eingabe, auch wenn erst später übertragen wird.
      sold_on: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      queued_at: now.toISOString(),
    };
    setBusy(true);
    const result = isOnline() ? await sendSale(sale) : 'offline';
    setBusy(false);
    if (result === 'ok' || result === 'duplicate') {
      router.replace({ pathname: '/', params: { saved: String(preview ?? '') } });
    } else if (result === 'offline') {
      // Kein Netz: im Handy speichern und später automatisch übertragen.
      enqueue(kv, sale);
      router.replace({ pathname: '/', params: { queued: '1' } });
    } else {
      setError('Speichern hat nicht geklappt. Bitte prüfe die Angaben und versuche es noch einmal.');
    }
  }

  return (
    <Screen>
      <BrandBar />
      <H1>Verkauf eintragen</H1>
      <Card>
        <Field label="Fahrzeug" placeholder="z. B. VW Golf 8 Life" value={vehicle} onChangeText={setVehicle} />
        <Field
          label="Bankprovision gesamt (€)"
          hint="Inklusive Provision der Zusatzprodukte. 0, wenn ohne Finanzierung."
          keyboardType="decimal-pad"
          placeholder="0"
          value={bank}
          onChangeText={setBank}
        />
        <Field label="Verkaufspreis Winterräder (€)" hint="0, wenn nicht verkauft." keyboardType="decimal-pad" placeholder="0" value={winter} onChangeText={setWinter} />
        <Field label="Verkaufspreis Zulassung (€)" hint="0, wenn nicht verkauft." keyboardType="decimal-pad" placeholder="0" value={registration} onChangeText={setRegistration} />
        {preview != null ? (
          <Notice tone="good">Deine Provision für diesen Verkauf: {eurCents(preview)}</Notice>
        ) : (
          <Muted>Die Provision wird beim Speichern berechnet.</Muted>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button title="Speichern" onPress={save} busy={busy} />
        <Button variant="ghost" title="Abbrechen" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </Card>
    </Screen>
  );
}
