// Local campaign guard, not an OS firewall or a claim of adversarial isolation.
/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preloads are intentionally CommonJS. */
const net = require('node:net');
const dns = require('node:dns');
const { syncBuiltinESMExports } = require('node:module');
function local(host) {
  const value = String(host ?? 'localhost').replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(value)) throw new Error('CAMPAIGN_EXTERNAL_NETWORK_DENIED');
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = args[0];
  // Node internally passes a normalized [options, callback] pair.
  const options = Array.isArray(first) ? first[0] : first;
  if (typeof options === 'object') {
    if (!options.path) local(options.host ?? options.hostname);
  } else if (typeof args[1] === 'string') local(args[1]);
  return connect.apply(this, args);
};
for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  const original = dns[name];
  dns[name] = function (hostname, ...rest) { local(hostname); return original.call(this, hostname, ...rest); };
}
if (globalThis.fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = function (input, ...rest) {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    local(target.hostname);
    return original.call(this, input, ...rest);
  };
}
syncBuiltinESMExports();
