// One QueryClient per mount of ./App, never at module level (ADR 0001). HTTP, including retries, stays in the
// SDK ApiClient: it already retries a safe call (GET, PUT, DELETE) twice on a network fault, a timeout, 429,
// 502, 503 and 504, honouring Retry-After, and never a 409 or 422. TanStack Query therefore retries nothing
// (a second layer would multiply the attempts) and owns caching, de-duplication and invalidation. Refetch on
// focus is off.
import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}
