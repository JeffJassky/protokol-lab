// Wraps the host-supplied requireAuth middleware so it gets applied to
// every route the suite mounts. Host can pass a single fn or an array of
// middlewares (e.g. [requireAuth, requireAuthUser, requireAdmin]).

export function wrapAuth(requireAuth) {
  const chain = Array.isArray(requireAuth) ? requireAuth : [requireAuth];
  return chain;
}
