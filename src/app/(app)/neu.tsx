import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandBar, Button, Card, colors, Field, H1, Muted, Notice, Screen } from '@/components/ui';
import { fetchCurrentRates, type RatesRow } from '@/lib/data';
import { eurCents } from '@/lib/format';
import { calcCommission, CERTIFIED, certifiedPrice, isFlatModel, parseEuro, type CertifiedClass } from '@/lib/scoring';
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
  const [certified, setCertified] = useState<CertifiedClass | null>(null);
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
  const certifiedAmount = certifiedPrice(certified);
  const preview = rates ? calcCommission({ ...input, certified_price: certifiedAmount }, rates) : null;
  const flat = rates ? isFlatModel(rates) : false;
  const certifiedBonus = rates ? Math.round(certifiedAmount * rates.certified_pct) / 100 : 0;
  const quoteHint = flat ? 'Zählt für die Quote, gibt aber keine Extra-Provision. ' : '';

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
      ...(certified ? { certified_class: certified, certified_price: certifiedAmount } : {}),
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
          hint={`${quoteHint}Inklusive Provision der Zusatzprodukte. 0, wenn ohne Finanzierung.`}
          keyboardType="decimal-pad"
          placeholder="0"
          value={bank}
          onChangeText={setBank}
        />
        <Field label="Verkaufspreis Winterräder (€)" hint={`${quoteHint}0, wenn nicht verkauft.`} keyboardType="decimal-pad" placeholder="0" value={winter} onChangeText={setWinter} />
        <Field label="Verkaufspreis Zulassung (€)" hint={`${quoteHint}0, wenn nicht verkauft.`} keyboardType="decimal-pad" placeholder="0" value={registration} onChangeText={setRegistration} />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Zertifizierter Gebrauchtwagen</Text>
          <View style={styles.choices}>
            {[{ key: null, label: 'Nicht verkauft', price: 0 }, ...CERTIFIED].map((c) => {
              const on = certified === c.key;
              return (
                <Pressable
                  key={c.key ?? 'none'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCertified(c.key)}
                  style={[styles.choice, on && styles.choiceOn]}
                >
                  <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{c.label}</Text>
                  {c.price > 0 && <Text style={[styles.choicePrice, on && styles.choiceTextOn]}>{eurCents(c.price)}</Text>}
                </Pressable>
              );
            })}
          </View>
          {rates && rates.certified_pct > 0 && <Text style={styles.hint}>Davon bekommst du {String(rates.certified_pct).replace('.', ',')} % Provision.</Text>}
        </View>
        {preview != null && rates ? (
          <Notice tone="good">
            Deine Provision für diesen Verkauf: {eurCents(preview)}
            {flat ? ` brutto (${eurCents(rates.base_amount)} je Fahrzeug${certifiedBonus ? ` + ${eurCents(certifiedBonus)} Zertifizierter Gebrauchtwagen` : ''}). Für Winterräder, Zulassung und Finanzierung gibt es kein Einzelgeld.` : ''}
          </Notice>
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

const styles = StyleSheet.create({
  label: { fontWeight: '600', fontSize: 14, color: colors.fg },
  hint: { fontSize: 12, color: colors.muted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surface, alignItems: 'center' },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  choiceText: { fontWeight: '600', color: colors.fg },
  choicePrice: { fontSize: 12, color: colors.muted },
  choiceTextOn: { color: '#fff' },
});
