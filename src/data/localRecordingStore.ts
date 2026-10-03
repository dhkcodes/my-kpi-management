export type RecordingCapabilityInput = Readonly<{
  hasMediaRecorder: boolean;
  hasGetUserMedia: boolean;
  isSecureContext: boolean;
  isMobile: boolean;
}>;
export type RecordingCapability = Readonly<{ supported: boolean; reason?: string }>;

export function getRecordingCapability(input: RecordingCapabilityInput): RecordingCapability {
  if (input.isMobile) return { supported: false, reason: "Quick recording is unavailable on mobile. Use manual notes instead." };
  if (!input.isSecureContext) return { supported: false, reason: "Recording requires a secure browser context (HTTPS)." };
  if (!input.hasMediaRecorder || !input.hasGetUserMedia) return { supported: false, reason: "Recording is not supported by this browser." };
  return { supported: true };
}

export function getBrowserRecordingCapability(): RecordingCapability {
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return getRecordingCapability({
    hasMediaRecorder: typeof MediaRecorder !== "undefined",
    hasGetUserMedia: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    isSecureContext: typeof window !== "undefined" && window.isSecureContext,
    isMobile
  });
}

const DATABASE_NAME = "kap-local-meeting-recordings";
const STORE_NAME = "recordings";
const VERSION = 1;

export function getLocalRecordingKey(recordingNamespace: string, noteKey: string): string {
  const namespace = recordingNamespace.trim();
  if (!namespace) throw new Error("An authenticated user is required for local recording storage.");
  return JSON.stringify([namespace, noteKey]);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Local recording storage is unavailable."));
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Unable to open local recording storage."));
  });
}

function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const tx = database.transaction(STORE_NAME, mode);
    const request = action(tx.objectStore(STORE_NAME));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => { tx.abort(); };
    tx.oncomplete = () => { database.close(); resolve(result); };
    tx.onabort = () => { database.close(); reject(new Error("Unable to access the local recording.")); };
    tx.onerror = () => { database.close(); reject(new Error("Unable to save the local recording.")); };
  }));
}

export const saveLocalRecording = (recordingNamespace: string, noteKey: string, audio: Blob): Promise<IDBValidKey> =>
  transaction("readwrite", (store) => store.put(audio, getLocalRecordingKey(recordingNamespace, noteKey)));
export const loadLocalRecording = (recordingNamespace: string, noteKey: string): Promise<Blob | undefined> =>
  transaction("readonly", (store) => store.get(getLocalRecordingKey(recordingNamespace, noteKey)));
export const deleteLocalRecording = (recordingNamespace: string, noteKey: string): Promise<undefined> =>
  transaction("readwrite", (store) => store.delete(getLocalRecordingKey(recordingNamespace, noteKey)) as IDBRequest<undefined>);
