/** Share one in-flight operation among concurrent callers. */
export function createSingleFlight() {
  let active: Promise<unknown> | null = null;
  return <T>(operation: () => Promise<T>): Promise<T> => {
    if (active) return active as Promise<T>;
    const current = Promise.resolve().then(operation);
    const shared = current.finally(() => {
      if (active === shared) active = null;
    });
    active = shared;
    return shared as Promise<T>;
  };
}
