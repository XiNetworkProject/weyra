"use client";
import type { Observation } from "./content";

export type LocalRecord = Observation & {
  kind: string;
  scope: string;
  createdAt: number;
  name: string;
  area: string;
  bio: string;
  zone: string;
  text: string;
  date: string;
  quiet: boolean;
  notifyLocal: boolean;
  notifyCommunity: boolean;
  reason: string;
};
const DATABASE = "weyra-horizon-local-v1";
const STORE = "records";
let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = undefined;
        reject(new Error("Le stockage local est indisponible."));
      };
    });
  return database;
}
async function recordsRequest<T>(mode: IDBTransactionMode, perform: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode),
      request = perform(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () =>
      reject(new Error("Enregistrement local impossible. Vérifiez l’espace disponible dans ce navigateur."));
    tx.onerror = () => reject(new Error("Enregistrement local impossible."));
  });
}
export async function loadLocalWorkspace() {
  const records = await recordsRequest<LocalRecord[]>("readonly", (store) => store.getAll());
  return {
    user: { id: "local-observer", name: "Observateur" },
    records: records.sort((a, b) => b.createdAt - a.createdAt),
  };
}
export async function saveLocalRecord(kind: string, data: Partial<LocalRecord>, scope = "", id = crypto.randomUUID()) {
  const now = Date.now();
  const record: LocalRecord = {
    title: "",
    description: "",
    phenomenon: "Nuages",
    place: "",
    lat: 0,
    lon: 0,
    image: "",
    author: "Observateur",
    time: new Date(now).toISOString(),
    intensity: 1,
    name: "",
    area: "",
    bio: "",
    zone: "",
    text: "",
    date: "",
    quiet: false,
    notifyLocal: false,
    notifyCommunity: false,
    reason: "",
    ...data,
    id,
    kind,
    scope,
    createdAt: now,
  };
  if (kind === "observation") {
    if (
      !record.title.trim() ||
      !record.place.trim() ||
      !Number.isFinite(record.lat) ||
      !Number.isFinite(record.lon) ||
      Math.abs(record.lat) > 85 ||
      Math.abs(record.lon) > 180
    )
      throw new Error("Vérifiez le titre et le lieu de votre observation.");
    record.lat = Math.round(record.lat * 100) / 100;
    record.lon = Math.round(record.lon * 100) / 100;
    record.demo = false;
    record.owner = true;
    record.time = new Date(now).toISOString();
    record.intensity = Math.max(1, Math.min(5, Number(record.intensity) || 1));
    // Local test data never becomes a remote/public contribution implicitly.
    record.visibility = "private";
  }
  await recordsRequest("readwrite", (store) => store.put(record));
  return record;
}
export async function deleteLocalRecord(id: string) {
  await recordsRequest("readwrite", (store) => store.delete(id));
}
export function localPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Photo illisible."));
    reader.readAsDataURL(file);
  });
}
