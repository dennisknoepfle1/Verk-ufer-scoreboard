import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, H1, Logo, Muted, Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);

  if (!loading && session) return <Redirect href="/" />;

  async function submit() {
    setMessage(null);
    if (!email.trim() || password.length < 8 || (mode === 'signup' && !name.trim())) {
      setMessage({ tone: 'danger', text: 'Bitte alle Felder ausfüllen. Das Passwort braucht mindestens 8 Zeichen.' });
      return;
    }
    setBusy(true);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage({ tone: 'danger', text: 'E-Mail oder Passwort stimmt nicht.' });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() } },
      });
      if (error) setMessage({ tone: 'danger', text: error.message });
      else if (!data.session)
        setMessage({ tone: 'good', text: 'Fast geschafft: Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir geschickt haben.' });
    }
    setBusy(false);
  }

  return (
    <Screen maxWidth={420}>
      <View style={{ height: 24 }} />
      <View style={{ alignItems: 'center', paddingBottom: 8 }}>
        <Logo height={64} />
      </View>
      <H1>Verkäufer-Scoreboard</H1>
      <Muted>{mode === 'login' ? 'Melde dich mit deinem Konto an.' : 'Lege dein Konto an. Danach schaltet dich die Verkaufsleitung frei.'}</Muted>
      <Card>
        {mode === 'signup' && <Field label="Vor- und Nachname" value={name} onChangeText={setName} autoComplete="name" />}
        <Field label="E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Passwort" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} onSubmitEditing={submit} />
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <Button title={mode === 'login' ? 'Anmelden' : 'Konto anlegen'} onPress={submit} busy={busy} />
        <Button
          variant="ghost"
          title={mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
          onPress={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setMessage(null);
          }}
        />
      </Card>
    </Screen>
  );
}
