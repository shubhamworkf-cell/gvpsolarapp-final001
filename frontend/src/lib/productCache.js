import api from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// FULL PRODUCT CACHE  (used by inventory page, balance sheet, reports, etc.)
// ─────────────────────────────────────────────────────────────────────────────
let inMemoryCache = null;
let inFlightPromise = null;

/**
 * Returns the full product list synchronously from memory/sessionStorage (0ms).
 */
export function getCachedProducts() {
  if (inMemoryCache) return inMemoryCache;
  try {
    const raw = sessionStorage.getItem("gvp_products_cache_v1");
    if (raw) {
      inMemoryCache = JSON.parse(raw);
      return inMemoryCache;
    }
  } catch (e) {}
  return null;
}

/**
 * Store updated full product list.
 */
export function setCachedProducts(products) {
  inMemoryCache = products;
  try {
    sessionStorage.setItem("gvp_products_cache_v1", JSON.stringify(products));
  } catch (e) {}
}

/**
 * Deduplicated, cached full-product fetcher.
 */
export function fetchProductsDeduplicated(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedProducts();
    if (cached && cached.length > 0) {
      return Promise.resolve(cached);
    }
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = api.get("/inventory/products")
    .then(({ data }) => {
      const list = data || [];
      setCachedProducts(list);
      inFlightPromise = null;
      return list;
    })
    .catch((err) => {
      inFlightPromise = null;
      throw err;
    });

  return inFlightPromise;
}

/**
 * Invalidate all caches (full + search).
 */
export function invalidateFrontendProductCache() {
  inMemoryCache = null;
  try {
    sessionStorage.removeItem("gvp_products_cache_v1");
  } catch (e) {}
}

// Removed search cache functions to ensure single source of truth for products
