import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');
const pretty = process.env.LOG_PRETTY === '1' || !isProd;
const useColor = process.stdout.isTTY && process.env.NO_COLOR !== '1';

// Secrets / PII we never want in logs.
const redactPaths = [
  'password', '*.password',
  'passwordHash', '*.passwordHash',
  'passwordResetTokenHash', '*.passwordResetTokenHash',
  'token', '*.token',
  'authorization', '*.authorization',
  'cookie', '*.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'res.headers["set-cookie"]',
  'subscription.keys',
  '*.subscription.keys',
];

const baseOptions = {
  level,
  redact: { paths: redactPaths, censor: '[Redacted]' },
  base: { service: 'protokol-lab-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

// ---- Pretty formatter (option C: pipe-separated single line) ----

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

const LEVEL_STYLE = {
  trace: ANSI.gray,
  debug: ANSI.gray,
  info: ANSI.cyan,
  warn: ANSI.yellow,
  error: ANSI.red,
  fatal: ANSI.magenta + ANSI.bold,
};

const LEVEL_LABEL = {
  trace: 'TRACE',
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  fatal: 'FATAL',
};

const HIDDEN_KEYS = new Set([
  'level', 'time', 'msg', 'module', 'service', 'pid', 'hostname', 'v',
]);

function color(s, code) {
  if (!useColor || !code) return s;
  return code + s + ANSI.reset;
}

function formatTime(iso) {
  // Extract HH:mm:ss.SSS from ISO string; fall back to whole thing.
  const m = /T(\d{2}:\d{2}:\d{2}\.\d{3})/.exec(iso || '');
  return m ? m[1] : (iso || '');
}

function stringifyVal(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') {
    // Quote if contains spaces or pipe chars so it reads cleanly.
    return /[\s|"=]/.test(v) ? JSON.stringify(v) : v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatRecord(rec) {
  const lvl = rec.level || 'info';
  const time = formatTime(rec.time);
  const mod = rec.module || '-';
  const msg = rec.msg || '';

  const levelStr = color(LEVEL_LABEL[lvl] || lvl.toUpperCase(), LEVEL_STYLE[lvl]);
  const modStr = color(`[${mod}]`, ANSI.bold);
  const timeStr = color(time, ANSI.gray);

  // Pull err separately so stack renders on its own line.
  let err = null;
  const metaParts = [];
  for (const [k, v] of Object.entries(rec)) {
    if (HIDDEN_KEYS.has(k)) continue;
    if (k === 'err' && v && typeof v === 'object') { err = v; continue; }
    metaParts.push(`${k}=${stringifyVal(v)}`);
  }

  let line = `${timeStr} ${levelStr} ${modStr} ${msg}`;
  if (metaParts.length) {
    const meta = metaParts.join(' | ');
    line += '  ' + color('| ' + meta, ANSI.dim);
  }

  if (err) {
    const parts = [];
    if (err.name) parts.push(`name=${stringifyVal(err.name)}`);
    if (err.message) parts.push(`message=${stringifyVal(err.message)}`);
    if (err.code) parts.push(`code=${stringifyVal(err.code)}`);
    if (err.status) parts.push(`status=${err.status}`);
    if (parts.length) line += '  ' + color('| ' + parts.join(' | '), ANSI.dim);
    if (err.stack) {
      line += '\n' + color(String(err.stack).split('\n').map((l) => '    ' + l).join('\n'), ANSI.gray);
    }
  }

  return line + '\n';
}

function prettyStream() {
  return new Writable({
    write(chunk, encoding, cb) {
      const text = chunk.toString();
      // Pino may batch multiple records per write — split on newlines.
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          const rec = JSON.parse(line);
          process.stdout.write(formatRecord(rec));
        } catch {
          process.stdout.write(line + '\n');
        }
      }
      cb();
    },
  });
}

export const logger = pretty
  ? pino(baseOptions, prettyStream())
  : pino(baseOptions);

export function childLogger(moduleName, bindings = {}) {
  return logger.child({ module: moduleName, ...bindings });
}

export const httpLogger = pinoHttp({
  logger: logger.child({ module: 'http' }),
  genReqId: (req, res) => {
    const hdr = req.headers['x-request-id'];
    if (typeof hdr === 'string' && hdr.length > 0 && hdr.length < 200) return hdr;
    const id = crypto.randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (req.url === '/api/health') return 'debug';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} ${res.statusCode} — ${err.message}`,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      userId: req.raw?.userId ? String(req.raw.userId) : undefined,
      remoteAddress: req.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export function errContext(err) {
  if (!err) return {};
  return {
    err: {
      message: err.message,
      name: err.name,
      code: err.code,
      status: err.status || err.statusCode,
      stack: err.stack,
    },
  };
}
