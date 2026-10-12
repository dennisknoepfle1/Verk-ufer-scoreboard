import { Redirect } from 'expo-router';

import { Button, Card, H1, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function Pending() {
  const { session, profile, loading, refreshProfile, signOut } = useAuth();
  if (!loading && !session) return <Redirect href="/login" />;
  if (profile?.status === 'active') return <Redirect href="/" />;

  const inactive = profile?.status === 'inactive';
  if (!profile && !loading) {
    return (
      <Screen maxWidth={420}>
        <H1>Konto nicht gefunden</H1>
        <Card>
          <Muted>Dein Profil konnte nicht geladen werden. Prüfe deine Verbindung und versuche es noch einmal.</Muted>
          <Button title="Erneut prüfen" onPress={refreshProfile} />
          <Button variant="ghost" title="Abmelden" onPress={signOut} />
        </Card>
      </Screen>
    );
  }
  return (
    <Screen maxWidth={420}>
      <H1>{inactive ? 'Konto deaktiviert' : 'Fast geschafft'}</H1>
      <Card>
        <Muted>
          {inactive
            ? 'Dein Konto ist derzeit deaktiviert. Wende dich an die Verkaufsleitung.'
            : `Hallo ${profile?.full_name || ''}, dein Konto ist angelegt. Sobald die Verkaufsleitung dich freigibt, siehst du hier das Scoreboard.`}
        </Muted>
        <Button title="Erneut prüfen" onPress={refreshProfile} />
        <Button variant="ghost" title="Abmelden" onPress={signOut} />
      </Card>
    </Screen>
  );
}
