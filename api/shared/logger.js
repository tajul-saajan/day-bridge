// Structured JSON logging (WSD-001).
// One JSON line per call, emitted to stdout/stderr via context.log. Required
// fields: timestamp, serviceName, serviceVersion, serviceEnvironment,
// correlationId, level, message. Never logs secrets, tokens, or request bodies.
// ERROR is reserved for alert-level failures only.

const SERVICE_NAME = 'daybridge-api';

function serviceVersion() {
  return process.env.RELEASE_VERSION || process.env.GIT_HASH || 'dev';
}

function serviceEnvironment() {
  return process.env.SERVICE_ENVIRONMENT
    || process.env.AZURE_FUNCTIONS_ENVIRONMENT
    || process.env.NODE_ENV
    || 'unknown';
}

function makeLogger(context, { traceId } = {}) {
  const sink = (context && typeof context.log === 'function')
    ? context.log.bind(context)
    : console.log.bind(console);

  function emit(level, message, extra) {
    const entry = {
      timestamp:          new Date().toISOString(),
      serviceName:        SERVICE_NAME,
      serviceVersion:     serviceVersion(),
      serviceEnvironment: serviceEnvironment(),
      correlationId:      traceId || null,
      level,
      message,
    };
    if (extra && typeof extra === 'object') entry.extra = extra;
    sink(JSON.stringify(entry));
  }

  return {
    debug: (m, e) => emit('DEBUG', m, e),
    info:  (m, e) => emit('INFO',  m, e),
    warn:  (m, e) => emit('WARN',  m, e),
    error: (m, e) => emit('ERROR', m, e),
  };
}

module.exports = { makeLogger, SERVICE_NAME };
