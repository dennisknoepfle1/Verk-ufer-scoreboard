import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { ProcessCheck } from '@/components/process/ProcessCheck';
import { Button, colors, Field, H2, Muted, Notice, ui } from '@/components/ui';
import { fetchMobileCheck, fetchMobileCustomers, saveMobileCustomers, syncMobileNow, useLive } from '@/lib/data';
import { eur } from '@/lib/format';
import { matchListings, type Listing, type Match } from '@/lib/mobile-match';

function timeLabel(iso: string | null | undefined) {
  if (!iso) return 'noch nie';
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const dayLabel = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '');
const open = (url: string | null) => (url ? () => Linking.openURL(url) : undefined);

/** Prüfung: Fahrzeuge, die auf mobile.de online sind, in Asana aber nicht mehr im Bestand (verkauft). */
export function MobileOfflineCheck() {
  const { data, error, reload } = useLive(fetchMobileCheck, []);
  const [customers, setCustomers] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    fetchMobileCustomers()
      .then((c) => {
        setCustomers(c);
        setSaved(c);
      })
      .catch(() => setSaved(''));
  }, []);

  const status = data?.status;
  const ready = Boolean(status?.last_success_at);
  const result = useMemo(() => (data && ready ? matchListings(data.listings, data.tasks) : null), [data, ready]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await saveMobileCustomers(customers);
      setSaved(customers.trim());
      setMsg({ tone: 'good', text: 'Gespeichert. Der Abruf startet jetzt, das dauert ein paar Sekunden.' });
      setTimeout(reload, 5000);
    } catch {
      setMsg({ tone: 'danger', text: 'Speichern hat nicht geklappt.' });
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setMsg(null);
    try {
      await syncMobileNow();
      reload();
    } catch {
      setMsg({ tone: 'danger', text: 'Abruf konnte nicht gestartet werden. Er läuft trotzdem alle 15 Minuten automatisch.' });
    } finally {
      setBusy(false);
    }
  }

  const n = result?.offline.length ?? 0;
  const state = !result ? 'unknown' : n > 0 ? 'alarm' : 'ok';
  const stateLabel = !result
    ? error
      ? 'Konnte nicht geladen werden'
      : status?.last_error
        ? 'mobile.de noch nicht verbunden'
        : 'Wartet auf den ersten Abruf von mobile.de'
    : n > 0
      ? `${n} ${n === 1 ? 'Fahrzeug ist' : 'Fahrzeuge sind'} verkauft und noch online`
      : 'Alles sauber: kein verkauftes Fahrzeug online';

  return (
    <ProcessCheck
      title="Verkauft, aber noch auf mobile.de"
      what="Fahrzeuge, die auf mobile.de online sind, in Asana aber nicht mehr im Bestand (alles nach „FZG.-Verkauf (Bestand)“ oder erledigt). Sie müssen sofort offline."
      state={state}
      count={n}
      stateLabel={stateLabel}
    >
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {result && n > 0 && (
        <View>
          {result.offline.map((m) => (
            <MatchRow key={m.listing.ad_id} m={m} alarm />
          ))}
          <Muted>Am längsten online zuerst. Auf den Titel tippen öffnet das Inserat, auf die Asana-Zeile die Aufgabe.</Muted>
        </View>
      )}

      {result && result.unknown.length > 0 && (
        <View style={{ gap: 4 }}>
          <H2>Online, aber in Asana nicht gefunden ({result.unknown.length})</H2>
          {result.unknown.map((l) => (
            <UnknownRow key={l.ad_id} l={l} />
          ))}
          <Muted>Weder die FIN noch die interne Nummer passt zu einer Asana-Aufgabe der letzten 13 Monate. Bitte von Hand prüfen.</Muted>
        </View>
      )}

      {result && (
        <Muted>
          {data!.listings.length} Inserate online · {result.ok.length} davon im Bestand · Stand mobile.de: {timeLabel(status?.last_success_at)}
        </Muted>
      )}

      <View style={styles.setup}>
        <Field
          label="mobile.de-Kundennummer (mehrere mit Komma)"
          value={customers}
          onChangeText={setCustomers}
          placeholder="z. B. 123456"
          keyboardType="numbers-and-punctuation"
          hint="Eure Händler-Kundennummer bei mobile.de (steht z. B. auf der mobile.de-Rechnung). mobile.de wird nur gelesen, hier wird nie etwas geändert."
        />
        <View style={styles.actions}>
          <Button small title="Speichern" onPress={save} busy={busy} disabled={customers.trim() === (saved ?? '')} />
          <Button small variant="ghost" title="Jetzt abrufen" onPress={syncNow} busy={busy} />
        </View>
        <Text style={{ color: colors.fg }}>
          Letzter Abruf: {timeLabel(status?.last_attempt_at)}
          {status?.last_success_at ? ` · zuletzt erfolgreich: ${timeLabel(status.last_success_at)} (${status.listing_count} Inserate)` : ''}
        </Text>
        {status?.last_error ? <Notice tone="danger">Problem beim letzten Abruf: {status.last_error}</Notice> : null}
        {error && !data ? <Notice tone="danger">Prüfung konnte nicht geladen werden: {error}</Notice> : null}
        <Muted>Der Abruf läuft automatisch alle 15 Minuten. Asana wird ebenfalls alle 15 Minuten gelesen.</Muted>
      </View>
    </ProcessCheck>
  );
}

function MatchRow({ m, alarm }: { m: Match; alarm?: boolean }) {
  const { listing: l, task: t } = m;
  return (
    <View style={styles.row} {...ui('row')}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.title, l.url ? { color: colors.accent } : null]} numberOfLines={1} onPress={open(l.url)}>
          {l.title}
          {l.price != null ? ` · ${eur(Number(l.price))}` : ''}
        </Text>
        <Text style={styles.sub} numberOfLines={1} onPress={open(t.permalink_url)}>
          Asana: {t.name}
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={[styles.section, alarm && { color: colors.danger }]} numberOfLines={1}>
          {t.completed ? 'erledigt' : t.section}
        </Text>
        <Text style={styles.sub}>
          {t.sold_on ? `verkauft ${dayLabel(t.sold_on)} · ` : ''}
          {m.by === 'fin' ? 'FIN' : 'Nr.'} {m.by === 'fin' ? (l.vin ?? '').slice(-6) : l.internal_number}
        </Text>
      </View>
    </View>
  );
}

function UnknownRow({ l }: { l: Listing }) {
  return (
    <View style={styles.row} {...ui('row')}>
      <Text style={[styles.title, { flex: 1 }, l.url ? { color: colors.accent } : null]} numberOfLines={1} onPress={open(l.url)}>
        {l.title}
        {l.price != null ? ` · ${eur(Number(l.price))}` : ''}
      </Text>
      <Text style={styles.sub}>
        {l.vin ? `FIN …${l.vin.slice(-6)}` : 'ohne FIN'}
        {l.internal_number ? ` · Nr. ${l.internal_number}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6, borderBottomWidth: 1, borderColor: colors.line },
  title: { color: colors.fg, fontWeight: '700' },
  sub: { color: colors.muted, fontSize: 13 },
  side: { alignItems: 'flex-end', gap: 2, maxWidth: 220 },
  section: { fontWeight: '700', color: colors.fg },
  setup: { gap: 8, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
