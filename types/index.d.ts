export interface RedisClient {
  get(key: string): Promise<string | null> | string | null
  set(key: string, value: string, mode: 'PX', ttl: number): Promise<unknown> | unknown
  del(key: string): Promise<number> | number
}

export type KeyGenerator<Args extends any[]> =
  | string
  | ((...args: Args) => string | false | Promise<string | false>)

export type Getter<Result> = (
  redis: RedisClient,
  key: string
) => Promise<Result | undefined> | Result | undefined

export type Setter<Result> = (
  redis: RedisClient,
  key: string,
  value: Result,
  ttl: number
) => Promise<unknown> | unknown

export interface MemoizeOptions<Args extends any[] = any[], Result = any> {
  /** Redis client (must implement get/set/del) */
  client?: RedisClient
  /** Key prefix for all cache entries */
  prefix?: string
  /** Default key or key generator; return false to skip caching */
  key?: KeyGenerator<Args>
  /** Time to live in milliseconds */
  ttl?: number
  /** Custom getter for this memoizer */
  get?: Getter<Result>
  /** Custom setter for this memoizer */
  set?: Setter<Result>
}

export type FnOptions<Args extends any[] = any[], Result = any> = MemoizeOptions<Args, Result>

export interface MemoizedFn<Args extends any[] = any[], Result = any> {
  (...args: Args): Promise<Result>

  /** Call the underlying function without using cache. */
  raw(...args: Args): Promise<Result>

  /** Get cached value for given arguments without calling the function. */
  get(...args: Args): Promise<Result | undefined>

  /** Manually set cached value for given arguments. */
  set(...argsAndValue: [...Args, Result]): Promise<unknown>

  /** Clear cached value for given arguments. */
  clear(...args: Args): Promise<number | undefined>
}

/**
 * Create a memoizer with optional global defaults.
 *
 * Note: either the global options or per-function options must provide `client` and `ttl`.
 */
declare function Memoize<GlobalArgs extends any[] = any[], GlobalResult = any>(
  options?: MemoizeOptions<GlobalArgs, GlobalResult>
): <Args extends any[] = GlobalArgs, Result = GlobalResult>(
  fn: (...args: Args) => Promise<Result> | Result,
  fnOptions?: FnOptions<Args, Result> | number
) => MemoizedFn<Args, Result>

export default Memoize
