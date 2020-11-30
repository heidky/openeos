import { getRandomInt } from '../util'
import { buildHref, extToType } from '../util/io'
import minimatch from 'minimatch'

let galleryLookup = {}
let urlIdCounter = 0
const urlCache = {}
const locatorArrayPreload = {}
const preloadPools = {}
function getPreloadPool(locator, lookupPool) {
  lookupPool = lookupPool || preloadPools
  let pool = lookupPool[locator]
  if (!pool) {
    pool = []
    lookupPool[locator] = pool
  }
  return pool
}
function addToPreloadPool(locator, item, lookupPool) {
  const pool = getPreloadPool(locator, lookupPool)
  if (pool.length >= 5) {
    return
  }
  pool.push(item)
}
function avoidLast(value, array, avoid, randomGetter) {
  for (let i = 10, l = array.length; l > 2 && i > 0 && value !== avoid; i--) {
    // Try not to repeat the last file
    value = randomGetter()
  }
  return value
}

const allowedUrlMatcher = /(^(https:\/\/i\.ibb\.co\/.+|^data:image\/.+)|^(file:|gallery:).*\+\(\|oeos:(.+)\)$)/

export default {
  data: () => ({
    missingFile: {
      href: 'missing-file',
      error: true,
    },
  }),
  methods: {
    hasInPreloadPool(locator) {
      return (
        (preloadPools[locator] && preloadPools[locator].length) ||
        (locatorArrayPreload[locator] && locatorArrayPreload[locator].length)
      )
    },
    locatorLookup(locator, preload) {
      const fromArray = this.locatorArrayLookup(locator, preload)
      if (fromArray) return fromArray
      const link = this.lookupRemoteLink(locator, preload)
      if (link) return link
      const pool = getPreloadPool(locator)
      const preloaded = !preload && pool.shift()
      if (preloaded) {
        // A random locator was pre-loaded, but not yet used
        if (!pool.length) {
          // Pre-load pool is empty
          // Add add one for next time
          this.preloadImage(locator)
        }
        // use it
        return preloaded
      }
      if (typeof locator !== 'string') return null
      const galleryFile = this.lookupGalleryImage(locator, preload)
      if (galleryFile) return galleryFile
      const file = this.lookupFile(locator, preload)
      if (file) return file
      console.error('Invalid locator', locator)
      return { href: 'invalid-locator', error: true }
    },
    locatorArrayLookup(locator, preload) {
      try {
        const locatorArray = JSON.parse(locator)
        if (!Array.isArray(locatorArray) || !locatorArray.length) return
        const _getRandom = () =>
          locatorArray[Math.floor(Math.random() * locatorArray.length)]
        const pool = getPreloadPool(locator, locatorArrayPreload)
        if (!preload) {
          const preloaded = pool.shift()
          if (preloaded) {
            if (!pool.length) {
              this.preloadImage(locator)
            }
            return this.locatorLookup(preloaded)
          }
          return this.locatorLookup(_getRandom())
        } else {
          let randLocator = _getRandom()
          randLocator = avoidLast(
            randLocator,
            locatorArray,
            pool[pool.length - 1],
            _getRandom
          )
          addToPreloadPool(locator, randLocator, locatorArrayPreload)
          return this.locatorLookup(randLocator, preload)
        }
      } catch (e) {
        return
      }
    },
    lookupRemoteLink(locator, preload) {
      const urlMatch = locator.match(allowedUrlMatcher)
      if (!urlMatch) return
      if (urlMatch[4]) {
        return this.locatorLookup(decodeURIComponent(urlMatch[4]), preload)
      }
      let image = urlCache[locator]
      if (!image) {
        const id = ++urlIdCounter
        image = {
          href: locator,
          item: {
            hash: id,
            id: id,
          },
          noReferrer: true,
        }
        urlCache[locator] = image
      }
      return image
    },
    lookupFile(locator, preload) {
      const fileMatch = locator.match(/^file:(.*)$/)
      if (!fileMatch) return
      const extMatch = locator.match(/\.([^.]+)$/)
      const isRandom = locator.match(/\*/)
      const ext = extMatch && extMatch[1]
      const type = extToType[ext]
      const files = this.files()
      const filter = minimatch.filter(locator.slice('file:'.length))
      const matches = Object.keys(files)
        .filter(filter)
        .map(f => files[f])
        .filter(f => !type || f.type === type)
      const _getRandom = () =>
        matches[Math.floor(Math.random() * matches.length)]
      let file = _getRandom()
      if (!file) {
        console.error(`Unknown file: ${fileMatch[1]}`)
        return this.missingFile
      }
      if (preload && isRandom) {
        const pool = getPreloadPool(locator)
        file = avoidLast(file, matches, pool[pool.length - 1], _getRandom)
        const result = {
          item: file,
          href: buildHref(file),
        }
        addToPreloadPool(locator, result)
        return result
      }
      return {
        item: file,
        href: buildHref(file),
      }
    },
    lookupGalleryImage(locator, preload) {
      const galleryMatch = locator.match(/^gallery:([^/]+)\/(.*)$/)
      if (!galleryMatch) return
      const gallery = galleryLookup[galleryMatch[1]]
      if (!gallery) {
        console.error(`Unknown gallery: ${gallery}`)
        return this.missingFile
      }
      let image = null
      if (galleryMatch[2] === '*') {
        const images = this.galleries()[galleryMatch[1]].images
        const _getRandom = () => images[getRandomInt(0, images.length - 1)]
        image = _getRandom()
        if (!image) {
          const galleryName = this.galleries()[galleryMatch[1]].name
          console.error(
            `Unknown image ID in gallery "${galleryName}": ${galleryMatch[2]}`
          )
          return this.missingFile
        }
        if (preload) {
          const pool = getPreloadPool(locator)
          image = avoidLast(image, images, pool[pool.length - 1], _getRandom)
          const result = {
            item: image,
            href: buildHref(image),
          }
          addToPreloadPool(locator, result)
          return result
        }
      } else {
        image = gallery[galleryMatch[2]]
        if (!image) {
          const galleryName = this.galleries()[galleryMatch[1]].name
          console.error(
            `Unknown image ID in gallery "${galleryName}": ${galleryMatch[2]}`
          )
          return this.missingFile
        }
      }
      return {
        item: image,
        href: buildHref(image),
      }
    },
    updateGalleryLookup() {
      const galleries = this.galleries()
      galleryLookup = Object.keys(galleries).reduce((a, k) => {
        a[k] = galleries[k].images.reduce((a2, img) => {
          a2[img.id] = img
          return a2
        }, {})
        return a
      }, {})
    },
  },
}