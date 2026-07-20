import axios from "axios";

let BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
// Remove manual localhost override to allow REACT_APP_BACKEND_URL to persist in native builds

if (!BACKEND_URL) {
  console.error(
    "[api.js] REACT_APP_BACKEND_URL is not set. " +
    "All API calls will fail. Check your frontend/.env file."
  );
}

export const API = `${BACKEND_URL}/api`;

// ─── JWT helpers ────────────────────────────────────────────────────────────

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

const isTokenExpired = (token) => {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  // Treat token as expired 30s before actual expiry for safety
  return Date.now() / 1000 + 30 > payload.exp;
};

// ─── Auth-only routes that must NEVER trigger a redirect to /login ─────────
const AUTH_ROUTES = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/forgot-password",
  "/auth/verify-otp",
  "/auth/reset-password",
];

const isAuthRoute = (url = "") =>
  AUTH_ROUTES.some((r) => url.includes(r));

// ─── Axios instance ──────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: API,
  withCredentials: true,
  timeout: 30000,  // 30 second timeout — prevents indefinite hangs
});

// ─── Request interceptor: proactive token refresh ───────────────────────────

api.interceptors.request.use(
  async (config) => {
    // Never intercept auth calls themselves to avoid recursion
    if (isAuthRoute(config.url)) return config;

    let token = localStorage.getItem("solarix_token");
    const refreshToken = localStorage.getItem("solarix_refresh_token");

    if (token && isTokenExpired(token) && refreshToken) {
      try {
        const res = await axios.post(
          `${API}/auth/refresh`,
          { refresh_token: refreshToken },
          { timeout: 15000 }
        );
        if (res.status === 200 && res.data.token) {
          token = res.data.token;
          localStorage.setItem("solarix_token", token);
          if (res.data.refresh_token) {
            localStorage.setItem("solarix_refresh_token", res.data.refresh_token);
          }
          window.dispatchEvent(new Event("solarix:auth-refresh"));
        }
      } catch (err) {
        // Refresh failed — clear tokens and redirect if not on a public page
        localStorage.removeItem("solarix_token");
        localStorage.removeItem("solarix_refresh_token");
        const isPublicPage =
          window.location.pathname === "/login" ||
          window.location.pathname === "/register" ||
          window.location.pathname === "/forgot-password";
        if (!isPublicPage) {
          window.location.href = "/login";
        }
        return Promise.reject(buildNetworkError(err));
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(buildNetworkError(error))
);

// ─── Response interceptor: reactive 401 refresh + uniform error shaping ────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    // If it is NOT an Axios error, pass it through directly (e.g. JS runtime error)
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    // ── Timeout or no-response → give a clear message ───────────────────────
    if (error.code === "ECONNABORTED" || !error.response) {
      const msg =
        error.code === "ECONNABORTED"
          ? "Request timed out. Please check your internet connection and try again."
          : `Cannot reach the server (${error.message || "Connection refused"}). Please make sure the backend is running and try again.`;
      return Promise.reject(new Error(msg));
    }

    const { status } = error.response;

    // ── 401: try token refresh once, then redirect if still failing ─────────
    if (status === 401 && !originalRequest._retry && !isAuthRoute(originalRequest.url)) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("solarix_refresh_token");

      if (refreshToken) {
        try {
          const res = await axios.post(
            `${API}/auth/refresh`,
            { refresh_token: refreshToken },
            { timeout: 15000 }
          );
          if (res.status === 200 && res.data.token) {
            const newToken = res.data.token;
            localStorage.setItem("solarix_token", newToken);
            if (res.data.refresh_token) {
              localStorage.setItem("solarix_refresh_token", res.data.refresh_token);
            }
            window.dispatchEvent(new Event("solarix:auth-refresh"));
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch {
          // Refresh failed — fall through to redirect
        }
      }

      // Clear session and redirect (only if not already on a public page)
      localStorage.removeItem("solarix_token");
      localStorage.removeItem("solarix_refresh_token");
      const isPublicPage =
        window.location.pathname === "/login" ||
        window.location.pathname === "/register" ||
        window.location.pathname === "/forgot-password";
      if (!isPublicPage) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// ─── Build a clean Error from a network-level failure ───────────────────────

function buildNetworkError(err) {
  if (err instanceof Error) return err;
  return new Error("Unexpected network error. Please try again.");
}

export default api;

// ─── Error message extractor used throughout the app ────────────────────────

export function formatApiError(err) {
  // Log the exact response during development (Requirement 6)
  if (process.env.NODE_ENV !== "production") {
    console.log("[API Error Response Log]", err?.response || err);
  }

  // If it's not an Axios error, it's a frontend runtime/JS error or custom string
  if (!axios.isAxiosError(err)) {
    if (err instanceof Error) return err.message || String(err);
    if (typeof err === "string") return err;
    return err?.message || err?.error || JSON.stringify(err) || "An unexpected error occurred.";
  }

  // Timeout or no response (Requirement 5)
  if (!err?.response) {
    if (err?.code === "ECONNABORTED") {
      return "Request timed out. Please check your connection and try again.";
    }
    const reason = err?.message || "Connection refused";
    return `Cannot reach the server (${reason}). Please make sure the backend is running.`;
  }

  const data = err.response.data;
  const status = err.response.status;

  // HTTP 400: Show actual validation message (Requirement 2)
  if (status === 400) {
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.error === "string") return data.error;
    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((e) => {
          const field = e?.loc?.slice(1).join(" → ") || "";
          return field ? `${field}: ${e?.msg}` : e?.msg || JSON.stringify(e);
        })
        .join("; ");
    }
    if (typeof data === "string" && data.length < 300) return data;
    return data?.detail || data?.message || data?.error || "Bad request. Please check your input and try again.";
  }

  // HTTP 401: Show specific invalid credentials message (Requirement 3)
  if (status === 401) {
    return "Invalid email or password.";
  }

  // HTTP 409: Show specific email already exists message (Requirement 4)
  if (status === 409) {
    return "Email already exists.";
  }

  // FastAPI validation errors (422) come as {detail: [{msg, loc, type}, ...]}
  if (Array.isArray(data?.detail)) {
    return data.detail
      .map((e) => {
        const field = e?.loc?.slice(1).join(" → ") || "";
        return field ? `${field}: ${e?.msg}` : e?.msg || JSON.stringify(e);
      })
      .join("; ");
  }

  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  if (typeof data === "string" && data.length < 300) return data;

  // HTTP status fallbacks
  switch (status) {
    case 403: return "You do not have permission to perform this action.";
    case 404: return "The requested resource was not found.";
    case 422: return "Validation error. Please review the form and try again.";
    case 500: return "Server error. Please try again in a moment.";
    case 502: return "Bad gateway. The server is temporarily unavailable.";
    case 503: return "Service unavailable. Please try again later.";
    default:  return `Unexpected error (HTTP ${status}). Please try again.`;
  }
}

export function fileUrl(fileId) {
  if (!fileId) return null;
  const token = localStorage.getItem("solarix_token");
  return `${API}/files/${fileId}${token ? `?auth=${token}` : ""}`;
}
