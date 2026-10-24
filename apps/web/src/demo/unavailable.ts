/**
 * What needs a real server (creating accounts, passwords, pictures, email): thrown by the demo's
 * repositories and stand-ins, answered `501 not_available_in_demo` by the demo API.
 */
export class DemoUnavailableError extends Error {
  constructor() {
    super('Not available in the demo');
  }
}
