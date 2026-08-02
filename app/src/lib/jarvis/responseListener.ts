/**
 * Compatibility teardown for the pre-kernel greeting interceptor.
 *
 * Protected responses now flow through the canonical runtime so their final
 * message and terminal evidence can be committed atomically. This function is
 * intentionally fieldless: it cannot receive a message repository or create a
 * second canonical writer.
 */
export function startJarvisResponsePolicyListener(): () => void {
  return () => {};
}
