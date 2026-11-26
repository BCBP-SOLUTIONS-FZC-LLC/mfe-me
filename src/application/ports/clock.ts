/** The current time, injectable so rules and use cases stay deterministic in tests. */
export interface Clock {
  now(): Date
}
