/**
 * A lightweight Redis-powered caching layer for async functions.
 *
 * @param {Object} [options] Global/default options.
 * @param {Object} options.client Redis-like client instance (must implement get/set/del).
 * @param {string} [options.prefix] Key prefix used for all cache entries.
 * @param {string|Function} [options.key] Default key or key generator for functions.
 * @param {number} [options.ttl] Default TTL in milliseconds for cached values.
 * @param {Function} [options.get] Custom getter `(redis, key) => any`.
 * @param {Function} [options.set] Custom setter `(redis, key, value, ttl) => any`.
 * @returns {(fn: Function, fnOptions?: Object|number) => Function} Memoized function factory.
 */
export default function Memoize (options = {}) {
  assert(typeof options === 'object' && options !== null, '`options` must be object!')

  /**
   * Wrap a function with Redis-backed caching.
   *
   * @param {Function} fn Target function to memoize.
   * @param {Object|number} [fnOptions] Per-function options or numeric TTL in ms.
   * @param {Object} [fnOptions.client] Redis client override.
   * @param {string} [fnOptions.prefix] Key prefix override.
   * @param {string|Function} [fnOptions.key] Key or key generator override.
   * @param {number} [fnOptions.ttl] TTL in milliseconds for this function.
   * @param {Function} [fnOptions.get] Custom getter for this function.
   * @param {Function} [fnOptions.set] Custom setter for this function.
   * @returns {Function} Memoized function with `.raw/.get/.set/.clear` helpers.
   */
  return function memoize (fn, fnOptions = {}) {
    if (typeof fnOptions !== 'object') {
      fnOptions = { ttl: fnOptions }
    }
    const opts = Object.assign({}, options, fnOptions)

    const redis = opts.client
    const prefix = opts.prefix || ''
    const ttl = opts.ttl
    const keyGenerator = opts.key || fn.name
    const getter = typeof opts.get === 'function' ? opts.get : defaultGet
    const setter = typeof opts.set === 'function' ? opts.set : defaultSet

    assert(redis && typeof redis.get === 'function' && typeof redis.set === 'function' && typeof redis.del === 'function', '`client` must be a redis-like client with get/set/del methods')
    assert(typeof prefix === 'string', '`prefix` must be a string')
    assert(keyGenerator && ((typeof keyGenerator === 'string') || (typeof keyGenerator === 'function')), '`key` must be string or function!')
    assert(Number.isFinite(ttl) && ttl > 0, '`ttl` must be a positive number of milliseconds')

    async function computeKey (args) {
      if (typeof keyGenerator === 'string') {
        return prefix + keyGenerator
      }
      const _key = await keyGenerator.apply(fn, args)
      if (_key === false) {
        return false
      }
      assert(typeof _key === 'string', '`key` function must return a string or false')
      return prefix + _key
    }

    async function raw (...args) {
      return fn.apply(this, args)
    }

    async function cache (...args) {
      const cacheKey = await computeKey(args)

      if (cacheKey === false) {
        return fn.apply(this, args)
      }

      let result = await getter(redis, cacheKey)

      if (result !== undefined) {
        return result
      }

      result = await fn.apply(this, args)

      await setter(redis, cacheKey, result, ttl)

      return result
    }

    async function get (...args) {
      const cacheKey = await computeKey(args)

      if (cacheKey === false) {
        return
      }

      return getter(redis, cacheKey)
    }

    async function set (...argsAndValue) {
      assert(argsAndValue.length >= 1, 'set requires at least one argument (value)')
      const value = argsAndValue[argsAndValue.length - 1]
      const args = argsAndValue.slice(0, -1)
      const cacheKey = await computeKey(args)

      if ((cacheKey === false) || (value === undefined)) {
        return
      }

      return setter(redis, cacheKey, value, ttl)
    }

    async function clear (...args) {
      const cacheKey = await computeKey(args)

      if (cacheKey === false) {
        return
      }

      return redis.del(cacheKey)
    }

    cache.raw = raw
    cache.get = get
    cache.set = set
    cache.clear = clear

    return cache
  }
}

function assert (condition, message) {
  if (!condition) throw new TypeError(message)
}

/**
 * Default Redis getter: JSON.parse on value, null treated as cache miss.
 *
 * @param {Object} redis Redis-like client.
 * @param {string} cacheKey Fully-qualified cache key.
 * @returns {Promise<unknown|undefined>} Parsed value or undefined on miss/error.
 */
async function defaultGet (redis, cacheKey) {
  try {
    const text = await redis.get(cacheKey)
    // null -> treat as undefined (cache miss)
    if (text === null) return
    return JSON.parse(text)
  } catch (_) {
    // If stored value isn't valid JSON, treat as miss
  }
}

/**
 * Default Redis setter: JSON.stringify value and set with PX TTL.
 *
 * @param {Object} redis Redis-like client.
 * @param {string} cacheKey Fully-qualified cache key.
 * @param {unknown} result Value to cache; undefined is not stored.
 * @param {number} ms TTL in milliseconds.
 * @returns {Promise<void>} Resolves when the value is written or error ignored.
 */
async function defaultSet (redis, cacheKey, result, ms) {
  // Do not save `undefined` value, `null` is ok
  if (result === undefined) return
  try {
    await redis.set(cacheKey, JSON.stringify(result), 'PX', ms)
  } catch (_) {}
}
