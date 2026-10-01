enum Action {
  READ = 'read',
  LIST = 'list',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage',
}

enum Resource {
  ALL = 'all',
  DASHBOARD = 'dashboard',
  OVERVIEW = 'overview',
  SHOP = 'shop',
  PRODUCT = 'product',
  INVENTORY = 'inventory',
  ORDER = 'order',
  TRACK_ORDER = 'track_order',
  PROCUREMENT = 'procurement',
  QUOTE = 'quote',
  SETTINGS = 'settings',
  USER = 'user',
  TRANSACTION = 'transaction',
  PAYMENT_GATEWAY = 'payment_gateway',
  /** Aurora website / Enter First enrollments */
  ENTER_FIRST = 'enter_first',
  /** Core 3.0 training tracks and prices */
  COURSE = 'course',
  /** Compliance email templates, campaigns, and messages */
  EMAIL = 'email',
  /** Paystack refund requests */
  REFUND = 'refund',
  /** Admin audit log */
  AUDIT = 'audit',
  /** Compliance dashboard, data requests, exports */
  COMPLIANCE = 'compliance',
  /** Unmasked enrollment PII. Absent on compliance_viewer. */
  PII = 'pii',
}

export { Action, Resource };
