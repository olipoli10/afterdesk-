// Local campaign guard, not an OS firewall or a claim of adversarial isolation.
/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preloads are intentionally CommonJS. */
const net = require('node:net');
const dns = require('node:dns');
const { syncBuiltinESMExports } = require('node:module');
function local(host) {
  const value = String(host ?? 'localhost').replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(value)) {
    if(process.env.CAMPAIGN_NETWORK_DIAGNOSTICS==='1')console.error(`NETWORK_DENIED_HOST=${/^[A-Za-z0-9.:-]+$/.test(value)?value:'REDACTED_UNSAFE_HOST'}`);
    throw new Error('CAMPAIGN_EXTERNAL_NETWORK_DENIED');
  }
}
const connect = net.Socket.prototype.connect;
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const first=args[0];
  // Installed port-probe libraries enumerate LAN interfaces. Restrict every
  // IP listener to loopback instead of authorizing those interfaces. Outbound
  // connect/fetch/DNS policy remains unchanged and denies non-loopback targets.
  const boundHost=()=> '127.0.0.1';
  if(first&&typeof first==='object'&&!first.path&&!first.handle&&first.fd===undefined) {
    args[0]={...first,host:boundHost(first.host)};
  } else if(typeof first==='number'||(typeof first==='string'&&/^\d+$/.test(first))) {
    if(typeof args[1]==='string')args[1]=boundHost(args[1]);
    else args.splice(1,0,'127.0.0.1');
  }
  return listen.apply(this,args);
};
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
