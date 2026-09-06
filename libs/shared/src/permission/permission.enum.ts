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
}

export { Action, Resource };
