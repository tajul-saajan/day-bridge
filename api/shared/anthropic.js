// Thin wrapper around the Anthropic SDK so the summarize function can be
// unit-tested with a stub client (no network, no real API key).

let _factory = defaultFactory;

function defaultFactory(apiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey });
}

function createClient(apiKey) {
  return _factory(apiKey);
}

// Test seam: override the client factory.
function setFactory(fn) { _factory = fn || defaultFactory; }

module.exports = { createClient, setFactory };
