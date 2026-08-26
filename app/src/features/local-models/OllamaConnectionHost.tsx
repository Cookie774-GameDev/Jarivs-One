/**
 * Authenticated app lifecycle host.
 *
 * Ollama is intentionally never started from a global mount, focus event, or
 * background timer. Starting a local runtime is a material user action and is
 * owned by the explicit Local Models/download/local-send flows. Keeping this
 * host inert also prevents an unrelated child WebView focus or Context restore
 * from launching a daemon and loading a model behind the user's back.
 */
export function OllamaConnectionHost() {
  return null;
}
