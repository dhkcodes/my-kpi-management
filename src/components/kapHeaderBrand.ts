export const KAP_HEADER_VARIANT_STORAGE_KEY = "kap.header.variant.v2";

export const KAP_HEADER_LOGOS = [
  { variant: "gold", src: "styles/images/kap-header-gold.png", iconSrc: "styles/images/kap-header-gold-icon.png" },
  { variant: "purple", src: "styles/images/kap-header-purple.png", iconSrc: "styles/images/kap-header-purple-icon.png" },
  { variant: "blue", src: "styles/images/kap-header-blue.png", iconSrc: "styles/images/kap-header-blue-icon.png" },
  { variant: "coral", src: "styles/images/kap-header-coral.png", iconSrc: "styles/images/kap-header-coral-icon.png" }
] as const;

export type KapHeaderLogo = typeof KAP_HEADER_LOGOS[number];
type BrandStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const getBrowserStorage = (): BrandStorage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const selectKapHeaderLogo = (randomValue = Math.random()): KapHeaderLogo =>
  KAP_HEADER_LOGOS[Math.min(KAP_HEADER_LOGOS.length - 1, Math.floor(Math.max(0, randomValue) * KAP_HEADER_LOGOS.length))];

export function readKapHeaderLogo(storage: BrandStorage | null = getBrowserStorage()): KapHeaderLogo | null {
  if (!storage) return null;
  try {
    const variant = storage.getItem(KAP_HEADER_VARIANT_STORAGE_KEY);
    return KAP_HEADER_LOGOS.find((logo) => logo.variant === variant) ?? null;
  } catch {
    return null;
  }
}

export function getOrCreateKapHeaderLogo(
  storage: BrandStorage | null = getBrowserStorage(),
  randomValue = Math.random()
): KapHeaderLogo {
  const stored = readKapHeaderLogo(storage);
  if (stored) return stored;
  const selected = selectKapHeaderLogo(randomValue);
  if (!storage) return selected;
  try {
    storage.setItem(KAP_HEADER_VARIANT_STORAGE_KEY, selected.variant);
    return readKapHeaderLogo(storage) ?? selected;
  } catch {
    return selected;
  }
}

export function startNewKapHeaderLoginSession(
  storage: BrandStorage | null = getBrowserStorage(),
  randomValue = Math.random()
): KapHeaderLogo {
  const selected = selectKapHeaderLogo(randomValue);
  try {
    storage?.setItem(KAP_HEADER_VARIANT_STORAGE_KEY, selected.variant);
  } catch {
    // Branding persistence must never block authentication.
  }
  return selected;
}

export function clearKapHeaderLoginSession(storage: BrandStorage | null = getBrowserStorage()): void {
  try {
    storage?.removeItem(KAP_HEADER_VARIANT_STORAGE_KEY);
  } catch {
    // Branding cleanup must never block logout or session-expiry handling.
  }
}
