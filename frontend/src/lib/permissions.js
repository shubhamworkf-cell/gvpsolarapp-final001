import { useAuth } from "@/context/AuthContext";

/**
 * Returns true if the current user has the given page+action permission.
 * Admin always returns true. Falls back to false for unknown pages.
 */
const PROJ_EXEC_TABS = ["verification", "approval", "reject", "project_assignment", "retry"];

export function usePermission(page, action = "view") {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === "Admin") return true;
  const p = (user.permissions || {})[page];
  if (!p) return false;
  if (page === "project_execution" && PROJ_EXEC_TABS.includes(action) && p[action] === undefined) {
    return !!p.view;
  }
  return !!p[action];
}

/**
 * <Can page="clients" action="create"> renders children only if user has perm.
 * Optional `fallback` for view-only hint.
 */
export function Can({ page, action = "view", fallback = null, children }) {
  const ok = usePermission(page, action);
  return ok ? children : fallback;
}
