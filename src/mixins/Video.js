let PROTO
const videoDestroyDelay = 200 // ms

export default {
  data: () => ({
    videos: {},
    hideVideo: false,
    hasVideo: false,
    lastVideoPlay: null,
  }),

  methods: {
    videoResize() {
      const item = this.hasVideo
      const video = item && item.video
      const vidOverlay = this.$refs.videoOverlays
      if (video && vidOverlay) {
        let width = video.clientWidth
        let height = video.clientHeight
        const naturalHeight = video.videoHeight
        const naturalWidth = video.videoWidth
        const xScale = width / naturalWidth
        const yScale = height / naturalHeight
        if (xScale === 1) {
          width = naturalWidth * yScale
        }
        if (yScale === 1 || xScale < yScale) {
          height = naturalHeight * xScale
        }
        vidOverlay.style.width = Math.ceil(width) + 'px'
        vidOverlay.style.height = Math.ceil(height) + 'px'
        var imageScale = height / 720
        this.imageScale = imageScale
        this.setCssVar('--video-scale', imageScale)
      }
    },
    videoClick(e) {
      const item = this.hasVideo
      const pseudoItem = item && item.pseudoItem()
      if (!pseudoItem || !this.hasEventListeners(pseudoItem, 'click')) {
        // If no video click listeners, fall back to plage image click
        return this.imageClick(e)
      }
      const rect = e.target.getBoundingClientRect()
      const x = e.clientX - rect.left //x position within the element.
      const y = e.clientY - rect.top //y position within the element.
      this.dispatchEvent(
        {
          target: pseudoItem,
          type: 'click',
          value: {
            x: x / e.target.clientWidth, // between 0 and 1, where clicked
            y: y / e.target.clientHeight, // between 0 and 1, where clicked
          },
          timeStamp: e.timeStamp + performance.timing.navigationStart,
        },
        e
      )
    },
    videoShow(item) {
      let hasVideo = false
      for (const video of Object.values(this.videos)) {
        video.show(video === item)
        if (video._show) hasVideo = video
      }
      this.hasVideo = hasVideo
      this.$nextTick(() => this.imageResize())
    },
    videoHide(item) {
      let hasVideo = false
      for (const video of Object.values(this.videos)) {
        if (video === item) {
          video.show(false)
        }
        if (video._show) hasVideo = video
      }
      this.hasVideo = hasVideo
      this.$nextTick(() => this.imageResize())
    },
    videoHideAll() {
      for (const video of Object.values(this.videos)) {
        video.show(false)
        video.video.pause()
      }
      this.hasVideo = false
      this.$nextTick(() => this.imageResize())
    },
    preloadVideo(options, fromPageScript) {
      try {
        return this.createVideoItem(options, fromPageScript, true)
      } catch (e) {
        console.error(e)
      }
    },
    createVideoItem(options, fromPageScript, preload) {
      const interpreter = this.interpreter
      const file = this.locatorLookup(options.locator)
      if (!file.item) {
        throw new Error('Invalid video locator: ' + options.locator)
      }
      let preloadKey = options.locator
      if (!options.id) {
        options.id = '__video_' + file.href
      } else {
        preloadKey += ':' + options.id
      }
      options.fromPageScript = fromPageScript

      if (typeof options.id !== 'string') {
        throw new Error('Given id must be undefined or a string')
      }
      // console.log('Loading sound:', file)
      const volume = Number(options.volume)

      let item

      const _setItem = () => {
        // console.log('Setting sound item', item, options)
        // item.controls = options.controls
        item.onContinue = options.onContinue
        item.loops = options.loops === undefined ? 1 : options.loops || 0
        item.loop = item.loops > 1 || item.loops === 0
        item.loopCount = item.loops
        item.id = options.id
        item.onCon
        item._show = false
        item.volume = isNaN(volume) ? 1 : volume
      }

      const _startItem = () => {
        // item.video.volume = item.volume
        // if (!item.playing()) item.play()
        item.play()
      }

      item = this.videos[options.id]

      // See if we were already loaded, and use that
      if (item) {
        this.debug(
          `Using preloaded video for ${preload ? 'preload' : 'display'}`,
          item
        )
        _setItem()
        if (!item._hasVideoELement) {
          item.loadVideoElement()
        }
        item.lastLoad = Date.now()
        if (!preload) {
          _startItem()
        } else if (!item.playing()) {
          item.video.currentTime = 0
        }

        return item.pseudoItem()
      }

      // console.warn('Creating new video', file.href, preload)

      const pseudoItem = interpreter.createObjectProto(PROTO)
      item = {}
      pseudoItem._item = item
      item.pseudoItem = () => pseudoItem
      item.preloadKey = preloadKey
      item.file = file
      item.id = options.id
      item.siteLink = file.siteLink || {}
      this.$set(item, '_playing', false)
      _setItem(item)

      if (preload) {
        this.incrementPreload(item.file.href)
      }

      item.playing = () => {
        // console.warn('Is playing?', video.paused, video.ended, video.readyState)
        return !!(
          !item.video.paused &&
          !item.video.ended &&
          item.video.readyState > 2
        )
      }

      // item.canplaythrough = e => {
      //   console.warn('Can Play Through', item.file.href)
      //   //canplaythrough
      // }

      item.loadedmetadata = e => {
        item.video.removeEventListener('loadedmetadata', item.loadedmetadata)
        this.debugIf(2, 'Got metadata:', item.file.href)
        if (item.playing()) {
          console.warn('Already playing:', item.file.href)
          return
        }
        const playPromise = item.video.play()

        // In browsers that don’t yet support this functionality,
        // playPromise won’t be defined.
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // We should be good. Wait for play event.
              // console.warn('We can auto play!')
            })
            .catch(error => {
              // Automatic play not supported.  User will need to interact
              console.warn(
                'Video not launched from user interaction.  Unable to auto-play:',
                file.locator
              )
              // video.controls = true
              item.needsInteraction = true
              item.preloader() // pretend that we preloaded
            })
        } else {
          // Probably an old, unsupported browser.
        }
      }

      var afterStop = () => {
        item._stopping = false
        if (preload && !item._didFirstStop) {
          // console.warn('Did initial pause after preload', file.href)
          this.$nextTick(() => this.doAfterPreload(true))
        }
        item._didFirstStop = true
      }

      item.stop = () => {
        if (!item._hasVideoELement) return
        this.debugWarn('STOPPING', item)
        this.videoHide(item)
        item._stopping = item.playing()
        // this.$nextTick(() => {
        item.video.removeEventListener('pause', playAfterStop)
        item.video.pause()
        item.video.currentTime = 0
        item._playing = false
        // console.log('Prepping to unload for stop', file.href)
        if (item._unloadVideoOnHide) {
          const v = item._unloadVideoOnHide
          setTimeout(() => item.unloadVideoElement(v), videoDestroyDelay)
          if (item._unloadVideoOnHide !== item.video) {
            item._unloadVideoOnHide = item.video
          } else {
            item._unloadVideoOnHide = false
          }
        } else {
          item._unloadVideoOnHide = item.video
        }
        // })
      }

      item.reset = () => {
        this.debugWarn('RESETTING', item)
        this.videoHide(item)
        item._stopping = item.playing()
        // this.$nextTick(() => {
        item.video.removeEventListener('pause', playAfterStop)
        item.video.pause()
        // item.video.currentTime = 0
        item._playing = false
      }

      item.showPrep = val => {
        if (val) {
          item.video.classList.add('oeos-show')
          item.video.classList.add('oeos-show-prep')
        } else {
          if (!item._show) item.video.classList.remove('oeos-show')
          item.video.classList.remove('oeos-show-prep')
        }
        this.$nextTick(() => this.videoResize())
      }

      item.show = val => {
        if (val) {
          // console.error('Showing', video)
          item.video.classList.remove('oeos-show-prep')
          item.video.classList.add('oeos-show')
          item._show = true
          item._unloadVideoOnHide = false
        } else {
          // console.error('Hiding', video)
          // item.video.classList.remove('oeos-show')
          item._didShowOnPlay = true
          if (!item._noPauseOnHide) {
            this.$nextTick(() => item.video.pause())
            item.video.classList.remove('oeos-show-prep')
            item.video.classList.remove('oeos-show')
          } else {
            // console.warn('Not pausing on next play')
          }
          item._show = false
          if (item._unloadVideoOnHide) {
            const v = item._unloadVideoOnHide
            setTimeout(() => item.unloadVideoElement(v), videoDestroyDelay)
            if (item._unloadVideoOnHide !== item.video) {
              item._unloadVideoOnHide = item.video
            } else {
              item._unloadVideoOnHide = false
            }
          }
        }
      }

      const _showOnPlay = e => {
        if (item._show) {
          // console.log('Showing video:', file.href)
          item._didShowOnPlay = true
          item.show(true)
          this.videoShow(item)
          this.$nextTick(() => this.videoResize())
          item.video.removeEventListener('play', _showOnPlay)
          this.dispatchEvent({ target: pseudoItem, type: 'play-start' }, e)
        } else {
          // console.log('Skipping show of video:', file.href)
        }
      }

      item.doVideoPlay = c => {
        if (item._stopping) {
          console.warn('Skipping play.. video is stopping')
          return
        }
        // item.video.muted = true
        const playPromise = item.video.play()
        c = c === undefined ? 10 : c
        if (!c) {
          console.error('Unable to play:', item.file.locator)
          this.dispatchEvent({ target: pseudoItem, type: 'error' })
        }

        // In browsers that don’t yet support this functionality,
        // playPromise won’t be defined.
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // We should be good. Wait for play event.
              // console.warn('We can auto play!')
              this.debugIf(2, 'Play promise worked:', item.file.locator)
            })
            .catch(error => {
              // Automatic play not supported.  User will need to interact
              console.warn(
                'Play promise failed. Retrying:',
                item.file.locator,
                error
              )
              // video.controls = true
              // item.needsInteraction = true
              // item.preloader() // pretend that we preloaded
              setTimeout(() => item.doVideoPlay(--c), 0)
            })
        } else {
          // Probably an old, unsupported browser.
          console.warn('No play promise detected:', item.file.locator)
        }
      }

      item.play = noShow => {
        // console.error(`Playing video ${file.href}`)
        const lastVideo = this.lastVideoPlay !== item && this.lastVideoPlay
        if (item._preloading) {
          item._playAfterLoad = true
          this.debugWarnIf(2, 'Playing before preload', file.href)
          if (lastVideo) {
            // unload last video as soon as possible
            const lastV = lastVideo.video
            setTimeout(
              () => lastVideo.unloadVideoElement(lastV),
              videoDestroyDelay
            )
          }
          this.lastVideoPlay = item
          return
        }
        if (!item._hasVideoELement) {
          item._playAfterLoad = true
          item.loadVideoElement()
          return
        }
        item._show = item._show || !noShow
        item._didContinue = false
        if (lastVideo) {
          // console.log('Prepping to unload for play', lastVideo.file.href)
          if (lastVideo._unloadVideoOnHide) {
            // kill it now
            const lastV = lastVideo._unloadVideoOnHide
            setTimeout(
              () => lastVideo.unloadVideoElement(lastV),
              videoDestroyDelay
            )
            if (lastVideo._unloadVideoOnHide !== lastVideo.video) {
              lastVideo._unloadVideoOnHide = lastVideo.video
            } else {
              lastVideo._unloadVideoOnHide = false
            }
          } else {
            lastVideo._unloadVideoOnHide = lastVideo.video
          }
        }
        this.lastVideoPlay = item
        item._playCount++
        this.debugIf(2, 'Playing', item.file.href)
        item.video.volume = item.volume
        if (item._stopping) {
          // console.log('Deferring till pause')
          item.video.addEventListener('pause', playAfterStop)
          item.doVideoPlay()
        } else if (!item.playing()) {
          item._playing = true
          item._didShowOnPlay = false
          // hack to try to reduce transition time between two html5 videos.
          if (options.immediateShowOnPlay) {
            _showOnPlay()
          } else {
            item.video.addEventListener('play', _showOnPlay)
          }
          item.doVideoPlay()
        } else if (item._didShowOnPlay) {
          item._playing = true
          _showOnPlay()
        }
        item._stopping = false
      }

      item._stopping = false
      var playAfterStop = () => {
        item.video.removeEventListener('pause', playAfterStop)
        if (!item._stopping) item.play()
      }

      item.preloader = e => {
        // If we're pre-loading, stop the video playback and restart
        if (item._preloading) {
          item._retryCount = 5
          // console.warn('Stopping after preload')
          item.video.removeEventListener('play', item.preloader)
          item.reset()
          this.videoHide(item)
          item.video.controls = false
          item.video.removeAttribute('controls')
          // video.autoplay = true
          item.video.muted = false
          item._preloading = false
          item.video.addEventListener('ended', item.looper)
          ;[
            'play',
            'ended',
            'pause',
            'waiting',
            'stalled',
            'timeupdate',
          ].forEach(type => {
            if (item.video._removing) return
            item.video.addEventListener(type, e => {
              if (!item._didFirstStop) return
              this.dispatchEvent({ target: pseudoItem, type }, e)
            })
          })
          this.debugIf(2, 'Preloaded', item.file.href)
          if (item._playAfterLoad) {
            item._playAfterLoad = false
            item.play()
          }
        }
      }

      item.doContinue = () => {
        if (item._didContinue) return
        item._didContinue = true
        if (typeof item.onContinue === 'function') {
          // item.stop()
          item.onContinue()
        }
      }

      item.looper = () => {
        if (item.loop && item.loops > 1) {
          item.loopCount--
          if (!item.loopCount) {
            item._playing = false
            this.$nextTick(() => item.video.pause())
            item.doContinue()
          }
        } else if (!item.loop || item.loops === 1) {
          item._playing = false
          this.$nextTick(() => item.video.pause())
          item.doContinue()
        } else {
          item.doContinue()
        }
      }

      item.error = e => {
        // item._o_el = e.target
        if (item._preloading) {
          item._retryCount--
          if (item._retryCount) {
            console.warn('Error preloading video -- retrying', item)
            this.dispatchEvent({ target: pseudoItem, type: 'retry' }, e)
            // item.video.src = ''
            // item.video.load()
            this.$nextTick(() => {
              item.loadVideoElement()
              // startVideoPreload()
              // item.video.load()
            })
            return
          } else {
            this.dispatchEvent({ target: pseudoItem, type: 'error' }, e)
            console.warn('Error preloading video', item, e)
            if (preload) this.doAfterPreload(true)
          }
        } else if (item._playing && !item._stopping) {
          if (item._retryCount) {
            item._retryCount--
            console.warn('Error playing video -- retrying', item, e)
            this.$nextTick(() => {
              item.play()
            })
            return
          } else {
            this.dispatchEvent({ target: pseudoItem, type: 'error' }, e)
            console.error('Error playing video -- unable to play', item, e)
          }
          // console.warn('Error playing video', item, e)
        } else {
          this.dispatchEvent({ target: pseudoItem, type: 'error' }, e)
        }
      }

      if (typeof preload === 'function') {
        this.addAfterPreload(() => {
          preload()
        })
      }

      const startVideoPreload = () => {
        this.debugIf(2, 'Starting preload', item.file.href)
        item._preloading = true
        item._playCount = 0
        const video = item.video
        video.classList.add('oeos-clickable')
        video.setAttribute('controls', 'true')
        video.preload = 'metadata'
        video.autoplay = false // We'll do this later
        video.muted = true
        video.loop = !!item.loop && !item.loops === 1
        video.addEventListener('loadedmetadata', item.loadedmetadata)
        // video.addEventListener('canplaythrough', item.canplaythrough)
        video.addEventListener('play', item.preloader)
        video.addEventListener('error', item.error)
        video.addEventListener('pause', afterStop)
        item.videoSrc.src = item.file.href
        video.load()
      }

      item._retryCount = 5

      const loadVideoElement = () => {
        this.debugWarnIf(2, 'Loading video element:', item.file.href)
        if (item.video && !item.video._removing) {
          const v = item.video
          setTimeout(() => item.unloadVideoElement(v), videoDestroyDelay)
        }
        const video = document.createElement('video')
        const videoSrc = document.createElement('source')
        videoSrc.type = 'video/mp4'
        // videoSrc.src = ''
        video.appendChild(videoSrc)
        video.volume = 0.0001 // Just a little volume to make sure we auth it.
        item.videoSrc = videoSrc
        item.video = video
        item._hasVideoELement = true
        item._unloadVideoOnHide = false
        this.$refs.videoElements.appendChild(video)
        startVideoPreload()
      }
      item.loadVideoElement = loadVideoElement

      const unloadVideoElement = v => {
        if (!v || v._removing) return
        if (v === item.video) {
          item._hasVideoELement = false
        }
        this.debugWarnIf(2, 'Unloading video element:', item.file.href, v)
        v.src = ''
        v._removing = true
        v.removeEventListener('loadedmetadata', item.loadedmetadata)
        v.removeEventListener('play', item.preloader)
        v.removeEventListener('error', item.error)
        v.removeEventListener('pause', afterStop)
        v.removeEventListener('ended', item.looper)
        v.removeEventListener('play', _showOnPlay)
        v.removeEventListener('pause', playAfterStop)
        v.load()
        v.pause()
        v.src = item.file.href
        v.load()
        this.$nextTick(() => {
          v.remove()
        })
      }
      item.unloadVideoElement = unloadVideoElement

      loadVideoElement()

      item.createdAt = Date.now()
      item.lastLoad = Date.now()

      // console.log('refs', this.$refs)

      // video.removeAttribute('controls')

      // Use new
      this.videos[options.id] = item
      if (!preload) _startItem(item)

      this.debug('Created video item', item)
      if (item.siteLink.link)
        this.debug('Link to original video:', item.siteLink.link)
      return pseudoItem
    },
    purgePageVideos() {
      for (const k of Object.keys(this.videos)) {
        const item = this.videos[k]
        if (!item.options.background) {
          item.stop()
          item._playing = false
          // if (item.options.fromPageScript) {
          //   const pool = this.getSoundPool(item.preloadKey)
          //   pool.push(item) // Put sound back in pool for later re-use
          //   delete this.sounds[k]
          // }
        }
      }
    },
    installVideo(interpreter, globalObject) {
      const vue = this
      const constructor = (opt, fromPageScript) => {
        const optProps = opt.properties
        const preloadFunc = optProps.preload
        let preload = optProps.preload === true
        let pseudoItem
        if (preloadFunc && preloadFunc.class === 'Function') {
          delete optProps.preload
          preload = () => {
            interpreter.queueFunction(preloadFunc, pseudoItem)
            interpreter.run()
          }
        }
        const onContinueFunc = optProps.onContinue
        let onContinue
        if (onContinueFunc && onContinueFunc.class === 'Function') {
          delete optProps.onContinue
          onContinue = () => {
            interpreter.queueFunction(onContinueFunc, pseudoItem)
            interpreter.run()
          }
        }
        const options = interpreter.pseudoToNative(opt)
        options.onContinue = onContinue
        try {
          pseudoItem = this.createVideoItem(options, fromPageScript, preload)
          // console.log('Playing video item from constructor', pseudoItem)
          return pseudoItem
        } catch (e) {
          return interpreter.createThrowable(interpreter.ERROR, e.toString())
        }
      }

      const manager = interpreter.createNativeFunction(constructor, true)
      interpreter.setProperty(
        manager,
        'prototype',
        interpreter.createObject(globalObject.properties['EventTarget']),
        this.Interpreter.NONENUMERABLE_DESCRIPTOR
      )
      PROTO = manager.properties['prototype']
      interpreter.setProperty(globalObject, 'Video', manager)

      interpreter.setProperty(
        manager,
        'get',
        interpreter.createNativeFunction(id => {
          if (typeof id !== 'string') {
            return interpreter.createThrowable(
              interpreter.TYPE_ERROR,
              'Given id must be undefined or a string'
            )
          }
          const item = this.videos[id]
          return item && item.pseudoItem()
        }),
        this.Interpreter.NONENUMERABLE_DESCRIPTOR
      )

      // interpreter.setProperty(
      //   manager,
      //   'volume',
      //   interpreter.createNativeFunction(volume => {
      //     return Howler.volume(volume)
      //   }),
      //   this.Interpreter.NONENUMERABLE_DESCRIPTOR
      // )

      // interpreter.setProperty(
      //   manager,
      //   'mute',
      //   interpreter.createNativeFunction(muted => {
      //     return Howler.mute(muted === undefined ? true : muted)
      //   }),
      //   this.Interpreter.NONENUMERABLE_DESCRIPTOR
      // )

      interpreter.setProperty(
        manager,
        'stopAll',
        interpreter.createNativeFunction(allBut => {
          for (const k of Object.keys(this.videos)) {
            const item = this.videos[k]
            if (item.pseudoItem() !== allBut && item._id !== allBut) {
              item.stop()
              item._playing = false
            }
          }
        }),
        this.Interpreter.NONENUMERABLE_DESCRIPTOR
      )

      interpreter.setProperty(
        manager,
        'lastPlayed',
        interpreter.createNativeFunction(() => {
          return this.lastVideoPlay && this.lastVideoPlay.pseudoItem()
        }),
        this.Interpreter.NONENUMERABLE_DESCRIPTOR
      )

      interpreter.setProperty(
        manager,
        'activeVideo',
        interpreter.createNativeFunction(() => {
          return this.hasVideo && this.hasVideo.pseudoItem()
        }),
        this.Interpreter.NONENUMERABLE_DESCRIPTOR
      )

      interpreter.setNativeFunctionPrototype(manager, 'play', function(v) {
        this._item.loopCount = this._item.loops
        this._item.play(v)
        // this._item._playing = true
      })
      interpreter.setNativeFunctionPrototype(manager, 'pause', function() {
        vue.debugWarn('PAUSING', this._item)
        this._item.video.pause()
        this._item._playing = false
      })
      interpreter.setNativeFunctionPrototype(manager, 'show', function(v) {
        if (!arguments.length) {
          return this._item._show
        }
        this._item.show(v)
      })
      interpreter.setNativeFunctionPrototype(manager, 'showPrep', function(v) {
        if (!arguments.length) {
          return this._item.video.classList.contains('oeos-show-prep')
        }
        this._item.showPrep(v)
      })
      interpreter.setNativeFunctionPrototype(manager, 'stop', function() {
        this._item.stop()
      })
      interpreter.setNativeFunctionPrototype(manager, 'mute', function(muted) {
        this._item.video.muted = muted === undefined ? true : !!muted
      })
      interpreter.setNativeFunctionPrototype(manager, 'playing', function() {
        return this._item.playing()
      })
      interpreter.setNativeFunctionPrototype(manager, 'duration', function() {
        return this._item.video.duration
      })
      interpreter.setNativeFunctionPrototype(manager, 'getId', function() {
        return this._item.id
      })
      interpreter.setNativeFunctionPrototype(manager, 'getVolume', function() {
        return this._item.video.volume
      })
      interpreter.setNativeFunctionPrototype(manager, 'getElement', function() {
        return vue.getHTMLElementPseudo(this._item.video, true)
      })
      interpreter.setNativeFunctionPrototype(manager, 'rate', function(rate) {
        if (!arguments.length) {
          return this._item.video.playbackRate
        }
        this._item.video.playbackRate = rate
      })
      interpreter.setNativeFunctionPrototype(manager, 'noPauseOnHide', function(
        v
      ) {
        if (!arguments.length) {
          return this._item._noPauseOnHide
        }
        this._item._noPauseOnHide = !!v
      })
      interpreter.setNativeFunctionPrototype(manager, 'seek', function(time) {
        if (!arguments.length) {
          return this._item.video.currentTime
        }
        time = Number(time)
        if (isNaN(time)) {
          return interpreter.createThrowable(
            interpreter.TYPE_ERROR,
            'time must be a valid number'
          )
        }
        if (time < 0) {
          return interpreter.createThrowable(
            interpreter.RANGE_ERROR,
            'time must be greater than or equal to 0'
          )
        }
        this._item.video.currentTime = time
      })
      interpreter.setNativeFunctionPrototype(manager, 'setVolume', function(
        volume
      ) {
        volume = Number(volume)
        if (isNaN(volume)) {
          return interpreter.createThrowable(
            interpreter.TYPE_ERROR,
            'volume must be a valid number'
          )
        }
        if (volume < 0) {
          return interpreter.createThrowable(
            interpreter.RANGE_ERROR,
            'volume must be greater than or equal to 0'
          )
        }
        if (volume > 1) {
          return interpreter.createThrowable(
            interpreter.RANGE_ERROR,
            'volume must be less than or equal to 1'
          )
        }
        this._item.volume = volume
        this._item.video.volume = volume
      })
      var destroyVideo = function() {
        this._item._destroying = true
        this._item._playing = false
        vue.$nextTick(() => {
          this._item.unloadVideoElement(this._item.video)
          delete vue.videos[this._item.id]
        })
      }
      interpreter.setNativeFunctionPrototype(manager, 'remove', destroyVideo)
      interpreter.setNativeFunctionPrototype(manager, 'destroy', destroyVideo)
    },
  },
}
