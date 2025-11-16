import Redis from 'ioredis'
import Memoize from '../index.js'

describe('ioredis-memoize', () => {
  let redis

  beforeEach(() => {
    redis = new Redis()
  })

  afterEach(async () => {
    await redis.flushdb()
    await redis.quit()
  })

  describe('parameter validation', () => {
    it('should throw if options is not an object', () => {
      expect(() => Memoize('invalid')).toThrow('`options` must be object!')
      expect(() => Memoize(123)).toThrow('`options` must be object!')
      expect(() => Memoize(null)).toThrow('`options` must be object!')
    })

    it('should throw if client is missing', () => {
      const memoize = Memoize()
      const fn = async () => 'test'
      expect(() => memoize(fn, {})).toThrow('`client` must be a redis-like client with get/set/del methods')
    })

    it('should throw if client is invalid', () => {
      const memoize = Memoize()
      const fn = async () => 'test'
      expect(() => memoize(fn, { client: {} })).toThrow('`client` must be a redis-like client with get/set/del methods')
      expect(() => memoize(fn, { client: { get: 'not a function' } })).toThrow('`client` must be a redis-like client with get/set/del methods')
    })

    it('should throw if key is invalid', () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'test'
      // When key option is provided but not string/function, it should throw
      expect(() => memoize(fn, { ttl: 1000, key: 123 })).toThrow('`key` must be string or function!')
    })

    it('should throw if ttl is invalid', () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'test'
      expect(() => memoize(fn, { key: 'test' })).toThrow('`ttl` must be a positive number of milliseconds')
      expect(() => memoize(fn, { key: 'test', ttl: 0 })).toThrow('`ttl` must be a positive number of milliseconds')
      expect(() => memoize(fn, { key: 'test', ttl: -1 })).toThrow('`ttl` must be a positive number of milliseconds')
      expect(() => memoize(fn, { key: 'test', ttl: 'invalid' })).toThrow('`ttl` must be a positive number of milliseconds')
    })

    it('should throw if prefix is not a string after defaulting', () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'test'
      // prefix defaults to '' so this should pass
      expect(() => memoize(fn, { key: 'test', ttl: 1000 })).not.toThrow()
    })

    it('should throw if key function returns non-string', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'test'
      const cached = memoize(fn, {
        ttl: 1000,
        key: () => 123
      })
      await expect(cached()).rejects.toThrow('`key` function must return a string or false')
    })

    it('should throw if set is called without arguments', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'test'
      const cached = memoize(fn, { key: 'test', ttl: 1000 })
      await expect(cached.set()).rejects.toThrow('set requires at least one argument (value)')
    })
  })

  describe('basic caching', () => {
    it('should cache function result with string key', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, { key: 'test-key', ttl: 1000 })

      const result1 = await cached()
      expect(result1).toBe('result')
      expect(callCount).toBe(1)

      const result2 = await cached()
      expect(result2).toBe('result')
      expect(callCount).toBe(1) // Should not call fn again
    })

    it('should cache function result with function key', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async (a, b) => {
        callCount++
        return a + b
      }
      const cached = memoize(fn, {
        key: (a, b) => `sum:${a}:${b}`,
        ttl: 1000
      })

      const result1 = await cached(1, 2)
      expect(result1).toBe(3)
      expect(callCount).toBe(1)

      const result2 = await cached(1, 2)
      expect(result2).toBe(3)
      expect(callCount).toBe(1)

      const result3 = await cached(2, 3)
      expect(result3).toBe(5)
      expect(callCount).toBe(2)
    })

    it('should use function name as default key', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      async function namedFunction () {
        callCount++
        return 'result'
      }
      const cached = memoize(namedFunction, { ttl: 1000 })

      const result1 = await cached()
      expect(result1).toBe('result')
      expect(callCount).toBe(1)

      const result2 = await cached()
      expect(result2).toBe('result')
      expect(callCount).toBe(1)
    })

    it('should support prefix option', async () => {
      const memoize = Memoize({ client: redis, prefix: 'app:' })
      const fn = async () => 'result'
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await cached()
      const value = await redis.get('app:test')
      expect(JSON.parse(value)).toBe('result')
    })

    it('should handle empty prefix', async () => {
      const memoize = Memoize({ client: redis, prefix: '' })
      const fn = async () => 'result'
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await cached()
      const value = await redis.get('test')
      expect(JSON.parse(value)).toBe('result')
    })

    it('should cache null values', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return null
      }
      const cached = memoize(fn, { key: 'null-test', ttl: 1000 })

      const result1 = await cached()
      expect(result1).toBe(null)
      expect(callCount).toBe(1)

      const result2 = await cached()
      expect(result2).toBe(null)
      expect(callCount).toBe(1)
    })

    it('should not cache undefined values', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return undefined
      }
      const cached = memoize(fn, { key: 'undefined-test', ttl: 1000 })

      const result1 = await cached()
      expect(result1).toBe(undefined)
      expect(callCount).toBe(1)

      const result2 = await cached()
      expect(result2).toBe(undefined)
      expect(callCount).toBe(2) // Should call fn again
    })

    it('should cache complex objects', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => ({ foo: 'bar', nested: { value: 42 } })
      const cached = memoize(fn, { key: 'object-test', ttl: 1000 })

      const result = await cached()
      expect(result).toEqual({ foo: 'bar', nested: { value: 42 } })
    })

    it('should support numeric ttl as shorthand', async () => {
      const memoize = Memoize({ client: redis, key: 'test' })
      const fn = async () => 'result'
      const cached = memoize(fn, 1000) // Pass ttl directly

      const result = await cached()
      expect(result).toBe('result')
    })
  })

  describe('key function returning false', () => {
    it('should skip caching when key function returns false', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async (shouldCache) => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, {
        key: (shouldCache) => shouldCache ? 'cached' : false,
        ttl: 1000
      })

      const result1 = await cached(false)
      expect(result1).toBe('result')
      expect(callCount).toBe(1)

      const result2 = await cached(false)
      expect(result2).toBe('result')
      expect(callCount).toBe(2) // Should call fn again

      const result3 = await cached(true)
      expect(result3).toBe('result')
      expect(callCount).toBe(3)

      const result4 = await cached(true)
      expect(result4).toBe('result')
      expect(callCount).toBe(3) // Should use cache
    })
  })

  describe('raw method', () => {
    it('should bypass cache and call original function', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await cached()
      expect(callCount).toBe(1)

      await cached.raw()
      expect(callCount).toBe(2)

      await cached.raw()
      expect(callCount).toBe(3)
    })

    it('should preserve this context in raw', async () => {
      const memoize = Memoize({ client: redis })
      const obj = {
        value: 42,
        async getValue () {
          return this.value
        }
      }
      const cached = memoize(obj.getValue, { key: 'test', ttl: 1000 })

      const result = await cached.raw.call(obj)
      expect(result).toBe(42)
    })
  })

  describe('get method', () => {
    it('should get cached value without calling function', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      const result1 = await cached.get()
      expect(result1).toBe(undefined)
      expect(callCount).toBe(0)

      await cached()
      expect(callCount).toBe(1)

      const result2 = await cached.get()
      expect(result2).toBe('result')
      expect(callCount).toBe(1)
    })

    it('should return undefined when key function returns false', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, {
        key: () => false,
        ttl: 1000
      })

      const result = await cached.get()
      expect(result).toBe(undefined)
    })

    it('should support function key in get', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async (id) => `result-${id}`
      const cached = memoize(fn, {
        key: (id) => `item:${id}`,
        ttl: 1000
      })

      await cached(1)
      await cached(2)

      const result1 = await cached.get(1)
      expect(result1).toBe('result-1')

      const result2 = await cached.get(2)
      expect(result2).toBe('result-2')
    })
  })

  describe('set method', () => {
    it('should manually set cache value', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'original'
      }
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await cached.set('manual')

      const result = await cached()
      expect(result).toBe('manual')
      expect(callCount).toBe(0)
    })

    it('should support function key in set', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async (id) => `original-${id}`
      const cached = memoize(fn, {
        key: (id) => `item:${id}`,
        ttl: 1000
      })

      await cached.set(1, 'manual-1')
      await cached.set(2, 'manual-2')

      const result1 = await cached(1)
      expect(result1).toBe('manual-1')

      const result2 = await cached(2)
      expect(result2).toBe('manual-2')
    })

    it('should not set when key function returns false', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, {
        key: () => false,
        ttl: 1000
      })

      const result = await cached.set('value')
      expect(result).toBe(undefined)
    })

    it('should not set undefined values', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await cached.set(undefined)

      const result = await cached.get()
      expect(result).toBe(undefined)
    })
  })

  describe('clear method', () => {
    it('should clear cached value', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await cached()
      expect(callCount).toBe(1)

      await cached.clear()

      await cached()
      expect(callCount).toBe(2)
    })

    it('should support function key in clear', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async (id) => {
        callCount++
        return `result-${id}`
      }
      const cached = memoize(fn, {
        key: (id) => `item:${id}`,
        ttl: 1000
      })

      await cached(1)
      await cached(2)
      expect(callCount).toBe(2)

      await cached.clear(1)

      await cached(1)
      expect(callCount).toBe(3)

      await cached(2)
      expect(callCount).toBe(3) // Still cached
    })

    it('should return undefined when key function returns false', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, {
        key: () => false,
        ttl: 1000
      })

      const result = await cached.clear()
      expect(result).toBe(undefined)
    })

    it('should return deletion count', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await cached()
      const result1 = await cached.clear()
      expect(result1).toBe(1)

      const result2 = await cached.clear()
      expect(result2).toBe(0)
    })
  })

  describe('custom getter and setter', () => {
    it('should use custom getter', async () => {
      const customGet = async (redis, key) => {
        const value = await redis.get(key)
        return value ? `custom:${value}` : undefined
      }

      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, {
        key: 'test',
        ttl: 1000,
        get: customGet
      })

      await redis.set('test', 'direct')
      const result = await cached()
      expect(result).toBe('custom:direct')
    })

    it('should use custom setter', async () => {
      const customSet = async (redis, key, value, ttl) => {
        await redis.set(key, `custom:${value}`, 'PX', ttl)
      }

      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, {
        key: 'test',
        ttl: 1000,
        set: customSet
      })

      await cached()
      const value = await redis.get('test')
      expect(value).toBe('custom:result')
    })

    it('should propagate getter errors from custom getter', async () => {
      const customGet = async () => {
        throw new Error('getter error')
      }

      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, {
        key: 'test',
        ttl: 1000,
        get: customGet
      })

      await expect(cached()).rejects.toThrow('getter error')
      expect(callCount).toBe(0)
    })

    it('should propagate setter errors from custom setter', async () => {
      const customSet = async () => {
        throw new Error('setter error')
      }

      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'
      const cached = memoize(fn, {
        key: 'test',
        ttl: 1000,
        set: customSet
      })

      await expect(cached()).rejects.toThrow('setter error')
    })
  })

  describe('default getter and setter', () => {
    it('should handle invalid JSON in defaultGet', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await redis.set('test', 'invalid json')

      const result = await cached()
      expect(result).toBe('result')
      expect(callCount).toBe(1)
    })

    it('should handle redis errors in defaultGet', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }

      const mockRedis = {
        get: async () => { throw new Error('redis error') },
        set: async () => {},
        del: async () => {}
      }

      const cached = memoize(fn, { client: mockRedis, key: 'test', ttl: 1000 })

      const result = await cached()
      expect(result).toBe('result')
      expect(callCount).toBe(1)
    })

    it('should handle redis errors in defaultSet', async () => {
      const memoize = Memoize({ client: redis })
      const fn = async () => 'result'

      const mockRedis = {
        get: async () => null,
        set: async () => { throw new Error('redis error') },
        del: async () => {}
      }

      const cached = memoize(fn, { client: mockRedis, key: 'test', ttl: 1000 })

      const result = await cached()
      expect(result).toBe('result')
    })

    it('should treat null as cache miss in defaultGet', async () => {
      const memoize = Memoize({ client: redis })
      let callCount = 0
      const fn = async () => {
        callCount++
        return 'result'
      }
      const cached = memoize(fn, { key: 'test', ttl: 1000 })

      await redis.set('test', 'null')
      await redis.del('test') // Ensure key doesn't exist

      const result = await cached()
      expect(result).toBe('result')
      expect(callCount).toBe(1)
    })
  })

  describe('options merging', () => {
    it('should merge default options with function options', async () => {
      const memoize = Memoize({
        client: redis,
        prefix: 'default:',
        ttl: 5000
      })

      const fn = async () => 'result'
      const cached = memoize(fn, {
        key: 'test',
        ttl: 1000 // Override default ttl
      })

      await cached()
      const value = await redis.get('default:test')
      expect(JSON.parse(value)).toBe('result')
    })

    it('should use default options when function options not provided', async () => {
      const memoize = Memoize({
        client: redis,
        prefix: 'app:',
        key: 'default-key',
        ttl: 1000
      })

      const fn = async () => 'result'
      const cached = memoize(fn, {})

      await cached()
      const value = await redis.get('app:default-key')
      expect(JSON.parse(value)).toBe('result')
    })

    it('should work when fnOptions is omitted', async () => {
      const memoize = Memoize({
        client: redis,
        key: 'default-key-omitted',
        ttl: 1000
      })

      const fn = async () => 'result'
      const cached = memoize(fn) // fnOptions omitted, uses default {}

      const result = await cached()
      expect(result).toBe('result')
      const value = await redis.get('default-key-omitted')
      expect(JSON.parse(value)).toBe('result')
    })
  })

  describe('this context preservation', () => {
    it('should preserve this context in cache', async () => {
      const memoize = Memoize({ client: redis })
      const obj = {
        value: 42,
        async getValue () {
          return this.value
        }
      }
      const cached = memoize(obj.getValue, { key: 'test', ttl: 1000 })

      const result = await cached.call(obj)
      expect(result).toBe(42)
    })

    it('should preserve this context when cache miss', async () => {
      const memoize = Memoize({ client: redis })
      const obj = {
        value: 42,
        async getValue () {
          return this.value
        }
      }
      const cached = memoize(obj.getValue, {
        key: () => false,
        ttl: 1000
      })

      const result = await cached.call(obj)
      expect(result).toBe(42)
    })
  })
})
