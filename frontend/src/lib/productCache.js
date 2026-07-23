import api from "./api";

let inMemoryCache = null;
let inFlightPromise = null;

/**
 * Synchronous cached product retriever.
 * Returns products array immediately in 0ms if cached in memory or sessionStorage.
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
 * Store updated product list in memory and sessionStorage.
 */
export function setCachedProducts(products) {
  inMemoryCache = products;
  try {
    sessionStorage.setItem("gvp_products_cache_v1", JSON.stringify(products));
  } catch (e) {}
}

/**
 * Deduplicated, cached product fetcher.
 * Ensures only 1 network request runs at a time and returns cached data instantly when available.
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
 * Manually invalidate frontend product cache.
 */
export function invalidateFrontendProductCache() {
  inMemoryCache = null;
  try {
    sessionStorage.removeItem("gvp_products_cache_v1");
  } catch (e) {}
}
