import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, Muted } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { FeedItem } from '@/lib/data';
import { firstName } from '@/lib/format';
import { supabase } from '@/lib/supabase';

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `heute ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
};

/** Neueste Verkäufe mit Daumen und kurzem Kommentar. Eigene Verkäufe kann man nicht selbst loben. */
export function KudosFeed({ items, onChange }: { items: FeedItem[]; onChange: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function toggleLike(item: FeedItem) {
    const { error: e } = item.liked
      ? await supabase.from('kudos').delete().eq('sale_id', item.sale_id).eq('user_id', profile!.id)
      : await supabase.from('kudos').insert({ sale_id: item.sale_id });
    setError(e ? 'Hat nicht geklappt.' : null);
    onChange();
  }

  async function sendComment(item: FeedItem) {
    const comment = draft.trim().slice(0, 140);
    if (!comment) return;
    const { error: e } = await supabase.from('kudos').upsert({ sale_id: item.sale_id, user_id: profile!.id, comment });
    setError(e ? 'Kommentar konnte nicht gespeichert werden.' : null);
    if (!e) {
      setDraft('');
      setOpen(null);
    }
    onChange();
  }

  if (items.length === 0) return <Muted>Noch keine Verkäufe.</Muted>;

  return (
    <View>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {items.map((it) => {
        const mine = it.seller_id === profile?.id;
        return (
          <View key={it.sale_id} style={styles.item}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {it.full_name} <Text style={styles.vehicle}>· {it.vehicle}</Text>
                </Text>
                <Text style={styles.when}>{when(it.created_at)}</Text>
              </View>
              {mine ? (
                it.likes > 0 && <Text style={styles.count}>👍 {it.likes}</Text>
              ) : (
                <>
                  <Pressable
                    onPress={() => toggleLike(it)}
                    accessibilityRole="button"
                    accessibilityLabel={it.liked ? 'Lob zurücknehmen' : `${firstName(it.full_name)} loben`}
                    style={[styles.like, it.liked && styles.likeOn]}
                  >
                    <Text style={[styles.likeText, it.liked && { color: '#fff' }]}>👍 {it.likes || ''}</Text>
                  </Pressable>
                  <Pressable onPress={() => { setOpen(open === it.sale_id ? null : it.sale_id); setDraft(''); }} accessibilityRole="button" style={styles.like}>
                    <Text style={styles.likeText}>💬</Text>
                  </Pressable>
                </>
              )}
            </View>
            {it.comments.map((c, i) => (
              <Text key={i} style={styles.comment}>
                <Text style={{ fontWeight: '700' }}>{firstName(c.name)}:</Text> {c.comment}
              </Text>
            ))}
            {open === it.sale_id && (
              <View style={styles.compose}>
                <TextInput
                  autoFocus
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={140}
                  placeholder={`Glückwunsch an ${firstName(it.full_name)} …`}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  onSubmitEditing={() => sendComment(it)}
                  accessibilityLabel="Kommentar"
                />
                <Pressable onPress={() => sendComment(it)} accessibilityRole="button" style={[styles.like, styles.likeOn]}>
                  <Text style={[styles.likeText, { color: '#fff' }]}>Senden</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '700', color: colors.fg },
  vehicle: { fontWeight: '400', color: colors.muted },
  when: { fontSize: 12, color: colors.muted },
  count: { color: colors.muted, fontWeight: '600' },
  like: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 10, backgroundColor: colors.surface },
  likeOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  likeText: { fontWeight: '700', color: colors.fg },
  comment: { color: colors.fg, paddingLeft: 10, borderLeftWidth: 3, borderColor: colors.accentSoft },
  compose: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10, color: colors.fg, backgroundColor: colors.surface },
});
