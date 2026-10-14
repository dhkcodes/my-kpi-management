import { apiFetch } from "./apiFetch";
import type { AuthSession } from "./authSession";
export const profileLanguages = [
 { value: "en", label: "English" }, { value: "ko", label: "Korean" },
 { value: "ja", label: "Japanese" }, { value: "zh", label: "Chinese" }
] as const;
export type ProfilePreferences = Readonly<{ displayName: string; languageCode: string; avatarDataUrl: string | null }>;
export const MAX_AVATAR_BYTES = 256 * 1024;
function parse(value: unknown): ProfilePreferences {
 if (!value || typeof value !== "object") throw new Error("Invalid profile response.");
 const p = value as Record<string, unknown>;
 if (typeof p.displayName !== "string" || !p.displayName.trim() || p.displayName.length > 120
   || !profileLanguages.some(l => l.value === p.languageCode)
   || (p.avatarDataUrl !== null && (typeof p.avatarDataUrl !== "string"
     || p.avatarDataUrl.length > 349560 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(p.avatarDataUrl)))) {
   throw new Error("Invalid profile response.");
 }
 return { displayName: p.displayName, languageCode: p.languageCode as string, avatarDataUrl: p.avatarDataUrl as string | null };
}
export async function fetchProfilePreferences(fetchImpl: typeof fetch = fetch): Promise<ProfilePreferences> {
 const response = await apiFetch("/api/v1/profile", { headers: { Accept: "application/json" } }, fetchImpl);
 if (!response.ok) throw new Error("Unable to load your profile. Please retry.");
 return parse(await response.json());
}
export async function saveProfilePreferences(p: ProfilePreferences, fetchImpl: typeof fetch = fetch): Promise<ProfilePreferences> {
 const response = await apiFetch("/api/v1/profile", { method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(p) }, fetchImpl);
 if (!response.ok) throw new Error(response.status === 400 ? "Check the display name, language and image format/size." : "Your profile could not be saved. Please retry.");
 return parse(await response.json());
}
export function mergeProfilePreferences(session: AuthSession, preferences: ProfilePreferences): AuthSession {
 return { ...session, displayName: preferences.displayName, languageCode: preferences.languageCode, avatarDataUrl: preferences.avatarDataUrl };
}
export function readAvatarFile(file: File): Promise<string> {
 if (!["image/png", "image/jpeg"].includes(file.type) || file.size === 0 || file.size > MAX_AVATAR_BYTES) return Promise.reject(new Error("Choose a PNG or JPEG no larger than 256 KiB and 1024 × 1024 pixels."));
 return new Promise((resolve,reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Unable to read this image."));
  reader.onload = () => {
   const value = String(reader.result);
   const image = new Image();
   image.onerror = () => reject(new Error("The file is not a valid image."));
   image.onload = () => image.naturalWidth > 1024 || image.naturalHeight > 1024
     ? reject(new Error("Choose an image no larger than 1024 × 1024 pixels.")) : resolve(value);
   image.src = value;
  };
  reader.readAsDataURL(file);
 });
}
