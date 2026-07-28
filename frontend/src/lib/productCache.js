import api from "./api";

let inMemoryCache = [];
let inFlightPromise = null;

/**
 * Synchronous cached product retriever.
 * Returns products array immediately in 0ms if cached in memory or sessionStorage.
 */
export function getCachedProducts() {
  if (Array.isArray(inMemoryCache) && inMemoryCache.length > 0) return inMemoryCache;
  try {
    const raw = sessionStorage.getItem("gvp_products_cache_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inMemoryCache = parsed;
        return inMemoryCache;
      }
    }
  } catch (e) {}
  return [];
}

/**
 * Store updated product list in memory and sessionStorage.
 */
export function setCachedProducts(products) {
  inMemoryCache = Array.isArray(products) ? products : [];
  try {
    sessionStorage.setItem("gvp_products_cache_v1", JSON.stringify(inMemoryCache));
  } catch (e) {}
}

/**
 * Deduplicated, cached product fetcher.
 * Ensures only 1 network request runs at a time and returns cached data instantly when available.
 */
export function fetchProductsDeduplicated(forceRefresh = false) {
  if (forceRefresh) {
    invalidateFrontendProductCache();
  } else {
    const cached = getCachedProducts();
    if (Array.isArray(cached) && cached.length > 0) {
      return Promise.resolve(cached);
    }
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
      return [];
    });

  return inFlightPromise;
}

/**
 * Manually invalidate frontend product cache.
 */
export function invalidateFrontendProductCache() {
  inMemoryCache = [];
  inFlightPromise = null;
  try {
    sessionStorage.removeItem("gvp_products_cache_v1");
  } catch (e) {}
}
