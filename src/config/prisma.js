const { PrismaClient } = require("@prisma/client");

const DEFAULT_CONNECTION_LIMIT = 10;
const DEFAULT_POOL_TIMEOUT = 20;
const DEFAULT_CONNECT_TIMEOUT = 10;
const DEFAULT_TX_MAX_WAIT_MS = 10000;
const DEFAULT_TX_TIMEOUT_MS = 20000;

const parseMs = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const ensureUrlParam = (url, key, value) => {
  if (url.searchParams.has(key)) return;
  url.searchParams.set(key, String(value));
};

const buildDatabaseUrl = (rawUrl) => {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    ensureUrlParam(
      url,
      "connection_limit",
      process.env.DB_CONNECTION_LIMIT || DEFAULT_CONNECTION_LIMIT,
    );
    ensureUrlParam(
      url,
      "pool_timeout",
      process.env.DB_POOL_TIMEOUT || DEFAULT_POOL_TIMEOUT,
    );
    ensureUrlParam(
      url,
      "connect_timeout",
      process.env.DB_CONNECT_TIMEOUT || DEFAULT_CONNECT_TIMEOUT,
    );
    if (
      process.env.DB_SSLMODE &&
      !url.searchParams.has("sslmode")
    ) {
      url.searchParams.set("sslmode", process.env.DB_SSLMODE);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
};

const txMaxWait = parseMs(
  process.env.PRISMA_TX_MAX_WAIT_MS,
  DEFAULT_TX_MAX_WAIT_MS,
);
const txTimeout = parseMs(
  process.env.PRISMA_TX_TIMEOUT_MS,
  DEFAULT_TX_TIMEOUT_MS,
);

const globalForPrisma = globalThis;

const createPrismaClient = () =>
  new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl(process.env.DATABASE_URL),
      },
    },
    transactionOptions: {
      maxWait: txMaxWait,
      timeout: txTimeout,
    },
  });

const prisma = globalForPrisma.__fedarbPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__fedarbPrisma = prisma;
}

const defaultTxOptions = () => ({
  maxWait: txMaxWait,
  timeout: txTimeout,
});

const runTransaction = (fn, options = {}) =>
  prisma.$transaction(fn, {
    ...defaultTxOptions(),
    ...options,
  });

const connectPrisma = async () => {
  try {
    await prisma.$connect();
    return true;
  } catch (error) {
    console.error(
      "[prisma] Failed to connect to database:",
      error?.message || error,
    );
    return false;
  }
};

const pingDatabase = async () => {
  await prisma.$queryRaw`SELECT 1`;
  return true;
};

const isPrismaConnectivityError = (err) => {
  const code = err?.code || err?.meta?.code;
  if (code === "P1001" || code === "P1017" || code === "P1002" || code === "P1008") {
    return true;
  }
  const message = String(err?.message || "");
  return (
    /Can't reach database server/i.test(message) ||
    /Server has closed the connection/i.test(message) ||
    /Connection timed out/i.test(message) ||
    /Timed out fetching a new connection/i.test(message)
  );
};

const isPrismaTransactionTimeoutError = (err) => {
  const code = err?.code;
  if (code === "P2028") return true;
  const message = String(err?.message || "");
  return (
    /Transaction already closed/i.test(message) ||
    /Transaction not found/i.test(message) ||
    /timeout for this transaction/i.test(message)
  );
};

module.exports = prisma;
module.exports.runTransaction = runTransaction;
module.exports.connectPrisma = connectPrisma;
module.exports.pingDatabase = pingDatabase;
module.exports.defaultTxOptions = defaultTxOptions;
module.exports.isPrismaConnectivityError = isPrismaConnectivityError;
module.exports.isPrismaTransactionTimeoutError =
  isPrismaTransactionTimeoutError;
module.exports.buildDatabaseUrl = buildDatabaseUrl;
