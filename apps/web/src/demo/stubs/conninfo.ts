// Stands in for `@hono/node-server/conninfo` in the demo build: there is no socket in a browser,
// every request of the demo comes from its single visitor.

export function getConnInfo() {
  return { remote: { address: 'demo' } };
}
