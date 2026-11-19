import React from "react";

const TRANSIENT_CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "outdated optimize dep",
  "unable to preload css",
  "error loading dynamically imported module",
  "chunkloaderror",
  "loading chunk",
];

/**
 * Returns true when an error reflects a transient dynamic-import / Vite optimize-dep
 * fetch failure rather than a deterministic runtime crash inside the module.
 */
export function isTransientChunkLoadError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? `${err.name} ${err.message}`
      : typeof err === "string"
        ? err
        : String(err ?? "");
  const lower = message.toLowerCase();
  return TRANSIENT_CHUNK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Executes a dynamic module importer with bounded incremental backoff retries on
 * transient chunk-fetch or Vite `Outdated Optimize Dep` failures.
 */
export async function loadModuleWithRetry<T>(
  importer: () => Promise<T>,
  retries = 2,
  retryDelayMs = 200
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await importer();
    } catch (err) {
      lastError = err;
      if (attempt < retries && isTransientChunkLoadError(err)) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * (attempt + 1))
        );
        continue;
      }
      break;
    }
  }
  throw lastError;
}

/**
 * Wraps `React.lazy` with bounded incremental retry on transient chunk-fetch failures
 * and resets the underlying lazy wrapper after exhaustion so an ErrorBoundary reboot
 * cleanly attempts a fresh dynamic import instead of re-throwing a cached rejection.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  retries = 2,
  retryDelayMs = 200
): React.FC<React.ComponentProps<T>> {
  const createLazyComponent = () =>
    React.lazy(async () => {
      try {
        return await loadModuleWithRetry(importer, retries, retryDelayMs);
      } catch (err) {
        LazyComponent = createLazyComponent();
        throw err;
      }
    });

  let LazyComponent = createLazyComponent();

  const ResilientLazyWrapper: React.FC<React.ComponentProps<T>> = (props) => (
    <LazyComponent {...props} />
  );

  return ResilientLazyWrapper;
}
