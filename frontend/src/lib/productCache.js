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
  const cached = getCachedProducts();

  if (!forceRefresh && cached && cached.length > 0 && !inFlightPromise) {
    // Initiate background revalidation
    api.get("/inventory/products")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setCachedProducts(list);
      })
      .catch(() => {});
    return Promise.resolve(cached);
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = api.get("/inventory/products")
    .then(({ data }) => {
      const list = Array.isArray(data) ? data : [];
      setCachedProducts(list);
      inFlightPromise = null;
      return list;
    })
    .catch((err) => {
      inFlightPromise = null;
      if (cached && cached.length > 0) {
        return cached;
      }
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
  if (typeof searchCache !== "undefined" && searchCache?.clear) {
    searchCache.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH CACHE SAFE IMPLEMENTATION (Prevents ReferenceError: searchCache is not defined)
// ─────────────────────────────────────────────────────────────────────────────
export const searchCache = {
  _store: new Map(),
  get(key) {
    return this._store.get(key) || null;
  },
  set(key, val) {
    this._store.set(key, val);
  },
  has(key) {
    return this._store.has(key);
  },
  delete(key) {
    return this._store.delete(key);
  },
  clear() {
    this._store.clear();
  },
  invalidate() {
    this.clear();
  }
};

export function invalidateSearchCache() {
  searchCache.clear();
}

if (typeof window !== "undefined") {
  window.searchCache = searchCache;
  window.invalidateSearchCache = invalidateSearchCache;
}
