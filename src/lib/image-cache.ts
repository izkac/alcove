/** Bounded data-URL storage; misses also count toward the entry limit. */
export class ImageCache {
  private values = new Map<string, { art: string | null; bytes: number }>()
  private bytes = 0
  readonly maxBytes: number
  readonly maxEntries: number
  constructor(maxBytes: number, maxEntries: number) {
    this.maxBytes = maxBytes
    this.maxEntries = maxEntries
  }

  get size() { return this.values.size }
  get byteSize() { return this.bytes }
  has(key: string) { return this.values.has(key) }
  get(key: string) { return this.values.get(key)?.art }

  touch(key: string) {
    const value = this.values.get(key)
    if (value) { this.values.delete(key); this.values.set(key, value) }
  }

  set(key: string, art: string | null) {
    const previous = this.values.get(key)
    if (previous) this.bytes -= previous.bytes
    this.values.delete(key)
    // Conservative UTF-16 accounting, including the path and entry overhead.
    const bytes = (key.length + (art?.length ?? 0)) * 2 + 64
    if (bytes > this.maxBytes) return
    this.values.set(key, { art, bytes })
    this.bytes += bytes
    while (this.bytes > this.maxBytes || this.values.size > this.maxEntries) {
      const oldest = this.values.entries().next().value
      if (!oldest) break
      this.values.delete(oldest[0])
      this.bytes -= oldest[1].bytes
    }
  }
}

type Listener = (art: string | null) => void
type Request = { key: string; listeners: Set<Listener>; started: boolean }

/** Shares requests and discards queued work once all consumers leave. */
export class ImageRequests {
  private requests = new Map<string, Request>()
  private active = 0
  readonly cache: ImageCache
  private concurrency: number
  private load: (key: string) => Promise<string | null>
  constructor(
    cache: ImageCache,
    concurrency: number,
    load: (key: string) => Promise<string | null>,
  ) {
    this.cache = cache
    this.concurrency = concurrency
    this.load = load
  }

  subscribe(key: string, listener: Listener): () => void {
    if (this.cache.has(key)) {
      this.cache.touch(key)
      listener(this.cache.get(key) ?? null)
      return () => undefined
    }
    let request = this.requests.get(key)
    if (!request) {
      request = { key, listeners: new Set(), started: false }
      this.requests.set(key, request)
    }
    request.listeners.add(listener)
    this.pump()
    return () => {
      request.listeners.delete(listener)
      if (!request.started && request.listeners.size === 0) this.requests.delete(key)
    }
  }

  private pump() {
    for (const request of this.requests.values()) {
      if (this.active >= this.concurrency) break
      if (request.started) continue
      request.started = true
      this.active += 1
      void Promise.resolve().then(() => this.load(request.key)).then(
        (art) => { this.cache.set(request.key, art); return art },
        () => null, // transient IPC failures can be retried on the next mount
      ).then((art) => {
        this.requests.delete(request.key)
        this.active -= 1
        for (const listener of request.listeners) listener(art)
        this.pump()
      })
    }
  }
}
