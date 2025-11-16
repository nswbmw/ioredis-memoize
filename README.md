## ioredis-memoize

A lightweight Redis-powered caching layer for async functions.

### Install

```bash
$ npm i ioredis-memoize --save
```

### Usage

```js
const Redis = require('ioredis')
const Memoize = require('ioredis-memoize')

const redis = new Redis()

// create a memoizer with global defaults
const memoize = Memoize({
  client: redis,
  prefix: 'cache:',
  ttl: 10 * 60 * 1000 // default ttl in ms
})

// memoize(fn[, fnOptions]) => AsyncFunction with .raw/.get/.set/.clear
const cached = memoize(async function someAsyncFn (number) {
  console.log(`someAsyncFn: ${number}`)
  return number
}, {
  // optional per-function overrides
  // key can be string or function; return false to skip caching
  key (number) {
    if (number >= 4) {
      return false // only cache when number < 4
    }
    return this.name + ':' + number
  },
  ttl: 1000
})
```

#### Options

- **client** `{RedisClient}`: redis client instance (e.g. `new Redis()`). **Required** (globally or per function).
- **prefix** `{string}`: prefix for redis cache keys, default `''`.
- **key** `{string | Function}`: default key or key generator. If function returns `false`, skip get/set cache. Default is `fn.name`.
- **ttl** `{number}`: time to live in milliseconds. **Required** (globally or per function).
- **get** `{Function}`: custom getter `(redis, key) => value | undefined`.
- **set** `{Function}`: custom setter `(redis, key, value, ttl) => void`.

### Example

```js
import Redis from 'ioredis'
import Memoize from 'ioredis-memoize'

const redis = new Redis()

const memoize = Memoize({
  client: redis,
  prefix: 'cache:',
  ttl: 10 * 60 * 1000 // default ttl in ms
})

;(async function () {
  const someAsyncFn = memoize(async function someAsyncFn (number) {
    console.log(`someAsyncFn: ${number}`)
    return number
  }, {
    key: function (number) {
      if (number >= 4) {
        return false // only cache when number < 4
      }
      return this.name + ':' + number
    }
  })

  console.log(await someAsyncFn(1))
  console.log(await someAsyncFn(2))
  console.log(await someAsyncFn(2)) // get from cache
  console.log('---')

  console.log(await someAsyncFn.get(3))
  await someAsyncFn.set(3, 'some value') // manually set cache
  console.log(await someAsyncFn.get(3)) // get from cache
  console.log('---')

  console.log(await someAsyncFn(4)) // not cache
  console.log(await someAsyncFn.get(4))
  console.log('---')

  console.log(await someAsyncFn.raw(5)) // skip cache
  console.log(await someAsyncFn.get(5))
  console.log('---')

  console.log(await someAsyncFn.clear(1)) // clear cache
  console.log(await someAsyncFn.clear(2)) // clear cache
  console.log(await someAsyncFn.clear(3)) // clear cache
  console.log(await someAsyncFn.clear(4)) // no effect, because there is no cache
})().catch(console.error)
```

### Test (100% coverage)

```
$ npm run test
```

### License

MIT
