import { H1, Muted, Screen } from '@/components/ui';
import { MobileOfflineCheck } from '@/components/process/MobileOfflineCheck';

/**
 * Prozessboard: überwacht Abläufe, die gerade schieflaufen oder kontrolliert werden müssen.
 * Jede Prüfung ist eine eigene Komponente im Rahmen ProcessCheck (src/components/process/).
 * Neue Prüfung: Komponente anlegen und hier in CHECKS eintragen.
 */
const CHECKS = [MobileOfflineCheck];

export default function Prozessboard() {
  return (
    <Screen maxWidth={1000}>
      <H1>Prozessboard</H1>
      <Muted>Automatische Kontrollen, ob Abläufe sauber erledigt werden. Rot heißt: hier muss jemand etwas tun.</Muted>
      {CHECKS.map((Check, i) => (
        <Check key={i} />
      ))}
    </Screen>
  );
}
