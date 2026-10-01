import { AsyncLocalStorage } from 'async_hooks';

export type RequestContextStore = {
  requestId: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
};

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

export function currentRequestContext(): RequestContextStore | undefined {
  return requestContext.getStore();
}
