import Redis from 'ioredis'
import Memoize from './index.js'

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
