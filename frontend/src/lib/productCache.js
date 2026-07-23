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
      // Warm the search cache from full data
      setSearchCache(list.map(slimFields));
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
  searchCache = null;
  searchInFlight = null;
  try {
    sessionStorage.removeItem("gvp_products_cache_v1");
    sessionStorage.removeItem("gvp_products_search_cache_v1");
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH-SPECIFIC SLIM CACHE  (used by ProductAutocompleteInput only)
// Contains only 6 fields. Fetches from the fast /inventory/products/search
// endpoint — NO aggregation on the server, 5-minute server cache.
// ─────────────────────────────────────────────────────────────────────────────
let searchCache = null;        // in-memory: array of slim product objects
let searchInFlight = null;     // deduplication promise

/**
 * Return slim list (id, name, size, unit, high_value_goods, serial_number_required)
 * synchronously from memory/sessionStorage. Returns null if not cached yet.
 */
export function getCachedSearchProducts() {
  if (searchCache) return searchCache;
  try {
    const raw = sessionStorage.getItem("gvp_products_search_cache_v1");
    if (raw) {
      searchCache = JSON.parse(raw);
      return searchCache;
    }
  } catch (e) {}
  return null;
}

export function setSearchCache(list) {
  searchCache = list;
  try {
    sessionStorage.setItem("gvp_products_search_cache_v1", JSON.stringify(list));
  } catch (e) {}
}

/**
 * Fetch the slim search list from the fast backend endpoint.
 * De-duplicates in-flight requests so only 1 network call fires at a time.
 */
export function fetchSearchProducts(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = getCachedSearchProducts();
    if (cached && cached.length > 0) {
      return Promise.resolve(cached);
    }
    // Fallback: derive slim list from full cache if available
    const full = getCachedProducts();
    if (full && full.length > 0) {
      const slim = full.map(slimFields);
      setSearchCache(slim);
      return Promise.resolve(slim);
    }
  }

  if (searchInFlight) return searchInFlight;

  searchInFlight = api.get("/inventory/products/search")
    .then(({ data }) => {
      const list = data || [];
      setSearchCache(list);
      searchInFlight = null;
      return list;
    })
    .catch((err) => {
      searchInFlight = null;
      throw err;
    });

  return searchInFlight;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function slimFields(p) {
  return {
    id: p.id || "",
    name: (p.name || "").toUpperCase(),
    size: p.size || "",
    unit: p.unit || "Nos",
    high_value_goods: Boolean(p.high_value_goods || p.high_value_asset),
    serial_number_required: Boolean(p.serial_number_required),
  };
}
