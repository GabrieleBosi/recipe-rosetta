// Everything the app keeps, held in this browser.
//
// There is no server database any more. That means a recipe belongs to one
// browser on one device: clearing site data loses it, and nothing syncs. The
// scan is stored as a blob, which is why this is IndexedDB rather than
// localStorage — a photograph does not fit in the latter.

import type { Recipe } from "./types";

const DB_NAME = "recipe-rosetta";
const DB_VERSION = 1;
const STORE = "recipes";

let connection: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (connection) return connection;

  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "This browser would not open its local database. Private browsing " +
            "and blocked site data both prevent it.",
        ),
      );
  });

  return connection;
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("The local database refused that."));
      }),
  );
}

export function putRecipe(recipe: Recipe): Promise<unknown> {
  return run("readwrite", (store) => store.put(recipe));
}

export function getRecipe(id: string): Promise<Recipe | undefined> {
  return run<Recipe | undefined>("readonly", (store) => store.get(id));
}

export function deleteRecipe(id: string): Promise<unknown> {
  return run("readwrite", (store) => store.delete(id));
}

/** Newest first. */
export async function listRecipes(): Promise<Recipe[]> {
  const all = await run<Recipe[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
