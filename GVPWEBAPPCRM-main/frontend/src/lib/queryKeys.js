/**
 * Centralized query key factory.
 * Using objects/functions ensures keys are always consistent across
 * useQuery calls and queryClient.invalidateQueries calls.
 */
export const queryKeys = {
  clients: {
    all: () => ["clients"],
    list: (filters = {}) => ["clients", "list", filters],
    detail: (id) => ["clients", id],
    stats: () => ["clients", "stats"],
  },
  projects: {
    all: () => ["projects"],
    list: (filters = {}) => ["projects", "list", filters],
    detail: (id) => ["projects", id],
  },
  inventory: {
    all: () => ["inventory"],
    products: (filters = {}) => ["inventory", "products", filters],
    stats: () => ["inventory", "stats"],
    inward: (filters = {}) => ["inventory", "inward", filters],
    outward: (filters = {}) => ["inventory", "outward", filters],
  },
  tasks: {
    all: () => ["tasks"],
    list: (filters = {}) => ["tasks", "list", filters],
    detail: (id) => ["tasks", id],
  },
  complaints: {
    all: () => ["complaints"],
    list: (filters = {}) => ["complaints", "list", filters],
    detail: (id) => ["complaints", id],
  },
  dashboard: {
    stats: () => ["dashboard", "stats"],
  },
  team: {
    list: () => ["team"],
    detail: (id) => ["team", id],
  },
  clientData: {
    list: (filters = {}) => ["client-data", "list", filters],
    detail: (id) => ["client-data", id],
    tab: (id, tab) => ["client-data", id, tab],
  },
  materialRequests: {
    all: () => ["material-requests"],
    list: (filters = {}) => ["material-requests", "list", filters],
    detail: (id) => ["material-requests", id],
  },
  highValueAssets: {
    list: () => ["high-value-assets"],
  },
  notifications: {
    list: () => ["notifications"],
  },
  company: {
    detail: () => ["company"],
  },
  activityLogs: {
    list: () => ["activity-logs"],
  },
  templates: {
    list: () => ["templates"],
  },
  salesDocuments: {
    list: () => ["sales-documents"],
  },
};

