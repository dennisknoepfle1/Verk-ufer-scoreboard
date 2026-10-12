// Erkennt eine neue App-Version am Namen des Programmpakets (rein, testbar).
const BUNDLE = /\/_expo\/static\/js\/web\/[^"'\s>]+\.js/g;

/** Programmpakete aus einer HTML-Seite (rein, testbar). */
export function bundlesOf(html: string): string[] {
  return [...new Set(html.match(BUNDLE) ?? [])].sort();
}

export function isNewVersion(current: string[], latest: string[]): boolean {
  return current.length > 0 && latest.length > 0 && latest.join() !== current.join();
}
