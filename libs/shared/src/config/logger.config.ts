import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import type { LoggerModuleAsyncParams, Params } from 'nestjs-pino';
import type {
  redactOptions,
  SerializedRequest,
  SerializedResponse,
} from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import type { EnvTypes } from './env.config';

const REQUEST_ID_HEADER = 'x-request-id';

/** Paths that would drown prod noise if every probe were logged. */
const IGNORED_HTTP_PATH_PREFIXES = ['/api/v1/health', '/docs'] as const;

export const LOGGING_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.Authorization',
  'req.headers.cookie',
  'req.headers.Cookie',
  'req.headers["x-api-key"]',
  'headers.authorization',
  'headers.Authorization',
  'headers.cookie',
] as const;

type ExpressLikeRequest = IncomingMessage & {
  id?: string;
  requestId?: string;
};

/** Strip query/hash so HTTP success lines stay short and cache-friendly. */
export const extractPath = (url: string): string => {
  const match = url.match(/^[^?#]+/);
  return match ? match[0] : '';
};

export const shouldIgnoreHttpPath = (url: string | undefined): boolean => {
  if (!url) return false;
  const path = extractPath(url);
  return IGNORED_HTTP_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
};

export const redactionOpts: redactOptions = {
  paths: [...LOGGING_REDACT_PATHS],
  censor: '***MASKED***',
};

export const customHttpLogLevel: PinoHttpOptions['customLogLevel'] = (
  _req,
  res,
  err,
) => {
  if (res.statusCode >= 400 && res.statusCode < 500) {
    return 'warn';
  }
  if (res.statusCode >= 500 || err) {
    return 'error';
  }
  return 'info';
};

const serializers = {
  req: (req: SerializedRequest) => {
    const headers = req.headers || {};
    return {
      id: req.id,
      remoteAddress: req.remoteAddress,
      method: req.method,
      path: extractPath(req.url),
      headers: {
        host: headers.host,
        userAgent: headers['user-agent'],
        accept: headers.accept,
        origin: headers.origin,
      },
    };
  },
  res: (res: SerializedResponse) => ({
    statusCode: res.statusCode,
    contentLength: Number(res?.headers?.['content-length']),
  }),
};

/** Prefer inbound/middleware id so audit + HTTP logs share one correlation key. */
export const generateRequestId = (
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
): string => {
  const expressReq = req as ExpressLikeRequest;
  const headerValue = req.headers[REQUEST_ID_HEADER];
  const fromHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const existing = expressReq.requestId ?? expressReq.id ?? fromHeader;

  const id = existing ? String(existing) : randomUUID();
  expressReq.requestId = id;
  req.headers[REQUEST_ID_HEADER] = id;
  if (!res.getHeader('X-Request-Id')) {
    res.setHeader('X-Request-Id', id);
  }
  return id;
};

const getReqLogMsg = (req: IncomingMessage) =>
  `${req.method} ${extractPath(req.url ?? '')}`;

export const getPinoParams = (
  configService: ConfigService<EnvTypes, true>,
  appName: string,
): Params => {
  const logging = configService.get('logging', { infer: true });
  const nodeEnv = configService.get('nodeEnv', { infer: true });

  const transport =
    nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined;

  const pinoHttp: PinoHttpOptions = {
    level: logging.level,
    redact: redactionOpts,
    customLogLevel: customHttpLogLevel,
    customSuccessMessage: getReqLogMsg,
    customErrorMessage: getReqLogMsg,
    autoLogging: logging.requestLoggerEnabled
      ? {
          ignore: (req) => shouldIgnoreHttpPath(req.url),
        }
      : false,
    serializers,
    genReqId: generateRequestId,
    quietReqLogger: true,
    customAttributeKeys: { reqId: 'requestId' },
    customProps: () => ({ context: 'RequestLogger', app: appName }),
    ...(transport ? { transport } : {}),
  };

  return { pinoHttp };
};

/** Nest LoggerModule.forRootAsync factory bound to app name. */
export const createLoggerModuleOpts = (
  appName = 'aurora-server',
): LoggerModuleAsyncParams => ({
  inject: [ConfigService],
  useFactory: (configService: ConfigService<EnvTypes, true>) =>
    getPinoParams(configService, appName),
});
