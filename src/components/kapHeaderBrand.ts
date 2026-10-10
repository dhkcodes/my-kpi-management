export const KAP_HEADER_VARIANT_STORAGE_KEY = "kap.header.variant.v2";

export const KAP_TERRACOTTA_LOGO = {
  variant: "terracotta",
  src: "styles/images/kap-header-terracotta-redwood-v1.png",
  iconSrc: "styles/images/kap-header-terracotta-redwood-v1-icon.png"
} as const;

export const KAP_HEADER_LOGOS = [KAP_TERRACOTTA_LOGO] as const;

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

export const selectKapHeaderLogo = (): KapHeaderLogo => KAP_TERRACOTTA_LOGO;

export function readKapHeaderLogo(_storage: BrandStorage | null = getBrowserStorage()): KapHeaderLogo {
  return KAP_TERRACOTTA_LOGO;
}

export function getOrCreateKapHeaderLogo(
  storage: BrandStorage | null = getBrowserStorage()
): KapHeaderLogo {
  try {
    storage?.setItem(KAP_HEADER_VARIANT_STORAGE_KEY, KAP_TERRACOTTA_LOGO.variant);
  } catch {
    // Branding persistence must never block rendering.
  }
  return KAP_TERRACOTTA_LOGO;
}

export function startNewKapHeaderLoginSession(
  storage: BrandStorage | null = getBrowserStorage()
): KapHeaderLogo {
  return getOrCreateKapHeaderLogo(storage);
}

export function clearKapHeaderLoginSession(storage: BrandStorage | null = getBrowserStorage()): void {
  try {
    storage?.removeItem(KAP_HEADER_VARIANT_STORAGE_KEY);
  } catch {
    // Branding cleanup must never block logout or session-expiry handling.
  }
}
