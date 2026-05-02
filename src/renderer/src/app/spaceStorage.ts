import { invoke } from '@tauri-apps/api/core';

export interface SpaceInfo {
  name: string;
  path: string;
}

export interface NoteEntry {
  name: string;
  path: string;
}

export interface SpaceSnapshot {
  space: SpaceInfo;
  notes: NoteEntry[];
  active_note: NoteEntry;
  content: string;
}

export async function loadSpace(): Promise<SpaceSnapshot> {
  return await invoke<SpaceSnapshot>('load_space');
}

export async function openSpace(path: string): Promise<SpaceSnapshot> {
  return await invoke<SpaceSnapshot>('open_space', { path });
}

export async function createNote(name: string): Promise<SpaceSnapshot> {
  return await invoke<SpaceSnapshot>('create_note', { name });
}

export async function readNote(path: string): Promise<SpaceSnapshot> {
  return await invoke<SpaceSnapshot>('read_note', { path });
}

export async function writeNote(path: string, content: string): Promise<void> {
  await invoke('write_note', { path, content });
}

export async function deleteNote(path: string): Promise<SpaceSnapshot> {
  return await invoke<SpaceSnapshot>('delete_note', { path });
}
