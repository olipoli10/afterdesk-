export function safeOutput(value) {
 return String(value)
  .replace(/postgres(?:ql)?:\/\/[^\s"'<>\\]*:[^\s"'<>\\]*@/gi,'postgres://[REDACTED]@')
  .replace(/\bsk-(?:or-v1-|proj-|ant-)[A-Za-z0-9_-]{16,}/g,'[REDACTED_PROVIDER_KEY]')
  .replace(/\bgh[pousr]_[A-Za-z0-9]{30,}/g,'[REDACTED_GITHUB_TOKEN]')
  .replace(/\bAKIA[A-Z0-9]{16}\b/g,'[REDACTED_AWS_KEY]');
}
