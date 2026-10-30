import { createContext, useContext, type ReactNode } from 'react';

import { useLive } from './data';
import { openOf, storageName } from './instruction-rules';
import { supabase } from './supabase';

export const INSTRUCTION_BUCKET = 'arbeitsanweisungen';
/** Höchstgröße einer Datei (so auch im Speicher-Bucket eingestellt). */
export const MAX_FILE_MB = 25;

export type Instruction = {
  id: number;
  title: string;
  body: string;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
  archived_at: string | null;
  /** Verkäufer: eigene Bestätigung (null = noch offen). */
  confirmed_at: string | null;
  /** Vorab erzeugter Link zur Datei (1 Stunde gültig), damit sie beim Tippen sofort aufgeht. */
  file_url: string | null;
};

async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(INSTRUCTION_BUCKET).createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}

/** Aktive Anweisungen (Admin: alle) mit der eigenen Bestätigung, offene zuerst. */
export async function fetchInstructions(opts: { includeArchived?: boolean } = {}): Promise<Instruction[]> {
  let q = supabase
    .from('work_instructions')
    .select('id, title, body, file_path, file_name, created_at, archived_at, instruction_acks(user_id, confirmed_at)')
    .order('created_at', { ascending: false });
  if (!opts.includeArchived) q = q.is('archived_at', null);
  const [{ data, error }, { data: user }] = await Promise.all([q, supabase.auth.getUser()]);
  if (error) throw error;
  const me = user.user?.id;
  const rows = (data ?? []) as (Omit<Instruction, 'confirmed_at' | 'file_url'> & { instruction_acks: { user_id: string; confirmed_at: string }[] })[];
  const urls = await signedUrls(rows.flatMap((r) => (r.file_path ? [r.file_path] : []))).catch(() => ({}) as Record<string, string>);
  return rows.map(({ instruction_acks, ...r }) => ({
    ...r,
    confirmed_at: instruction_acks.find((a) => a.user_id === me)?.confirmed_at ?? null,
    file_url: r.file_path ? urls[r.file_path] ?? null : null,
  }));
}

export async function confirmInstruction(id: number) {
  const { error } = await supabase.from('instruction_acks').insert({ instruction_id: id });
  // Schon bestätigt (z. B. doppelt getippt) ist kein Fehler.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export type AckRow = { instruction_id: number; user_id: string; full_name: string; confirmed_at: string | null };

/** Admin: je Anweisung alle aktiven Verkäufer mit Bestätigung oder offen. */
export async function fetchInstructionStatus(): Promise<Record<number, AckRow[]>> {
  const { data, error } = await supabase.rpc('instruction_status');
  if (error) throw error;
  const out: Record<number, AckRow[]> = {};
  for (const r of (data ?? []) as AckRow[]) (out[r.instruction_id] ??= []).push(r);
  return out;
}

/**
 * Lädt die Datei direkt hoch (nicht über den Supabase-Client: dessen 15-Sekunden-Grenze
 * reicht für größere PDFs im Mobilfunk nicht).
 */
async function uploadFile(file: File): Promise<string> {
  const path = storageName(file.name);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${INSTRUCTION_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Hochladen fehlgeschlagen (${res.status})`);
  return path;
}

export async function publishInstruction(input: { title: string; body: string; file: File | null }) {
  const file_path = input.file ? await uploadFile(input.file) : null;
  const { error } = await supabase.from('work_instructions').insert({
    title: input.title.trim(),
    body: input.body.trim(),
    file_path,
    file_name: input.file?.name ?? null,
  });
  if (error) {
    if (file_path) await supabase.storage.from(INSTRUCTION_BUCKET).remove([file_path]).catch(() => undefined);
    throw new Error(error.message);
  }
}

export async function setArchived(id: number, archived: boolean) {
  const { error } = await supabase
    .from('work_instructions')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteInstruction(i: Pick<Instruction, 'id' | 'file_path'>) {
  const { error } = await supabase.from('work_instructions').delete().eq('id', i.id);
  if (error) throw new Error(error.message);
  if (i.file_path) await supabase.storage.from(INSTRUCTION_BUCKET).remove([i.file_path]).catch(() => undefined);
}

type Gate = { list: Instruction[] | null; open: Instruction[]; reload: () => void };
const GateContext = createContext<Gate>({ list: null, open: [], reload: () => {} });

/**
 * Hält für Verkäufer die Anweisungen aktuell (live, jede Minute, beim Zurückkehren in die App).
 * Klappt das Laden nicht (kein Netz), wird nichts gesperrt: Verkäufe eintragen geht immer.
 */
export function InstructionGateProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { data, reload } = useLive(async () => (enabled ? fetchInstructions() : []), [enabled]);
  const list = data ?? null;
  return <GateContext.Provider value={{ list, open: list ? openOf(list) : [], reload }}>{children}</GateContext.Provider>;
}

export const useInstructionGate = () => useContext(GateContext);

export { isGateFree, openOf } from './instruction-rules';
