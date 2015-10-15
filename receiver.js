;(function ( $, window, document, undefined ) {
    var pluginName = "redditCast",
        defaults = {
        };

    // The actual plugin constructor
    function RedditCast( element, options ) {
        this.element = element;

        // jQuery has an extend method that merges the
        // contents of two or more objects, storing the
        // result in the first object. The first object
        // is generally empty because we don't want to alter
        // the default options for future instances of the plugin
        this.options = $.extend( {}, defaults, options) ;

        this._defaults = defaults;
        this._name = pluginName;

        this.init();
    }

    RedditCast.prototype = {

        init: function() {
          // Our Snoocore instance for loading data from reddit
          this.reddit = new window.Snoocore({
              userAgent: 'Cast for Reddit by terryma',
              oauth: {
                type: 'implicit',
                key: 'Cu7_UH3IzqOjvA',
                redirectUri: 'http://terry.ma', // not used
                scope: ['read'],
                deviceId: 'DO_NOT_TRACK_THIS_DEVICE'
              }
          });
          // Vegas is initialized on this dom element. TODO Pass this in
          this.ss = $('#slideshow');
          // Has the slideshow been initialized already?
          this.initialized = false;
          // Which subreddit to use. TODO Pass this in
          this.sub = 'pics';
          // How many listings to load each time. TODO Pass this in
          this.batchSize = 10;
          // All the slides. This is different from the Vegas slides in that
          // this list does not get cleaned up
          this.slides = [];
          // When we have this many items left in the current set of slides, load
          // the next batch
          this.bufferSize = 5;
          // The current slice from the reddit response with Snoocore
          this.slice = null;
          // Sort order. TODO Pass this in
          this.sort = "hot";
          // Time range. TODO Pass this in
          this.time = "week";
          // Delay between slides. TODO Pass this in
          this.delay = 10000;
          // Cover node? TODO Pass this in
          this.cover = false;
          // Show progress bar? TODO Pass this in
          this.progress = true;
          // Are we currently loading a slice from reddit?
          this.loadingSlice = false;
          // Should we show title? TODO Pass this in
          this.showTitle = true;

          // Load posts from reddit
          this.reset();
        },

        // TODO Not used at the moment. Could be useful for building a better
        // auto-complete search for subreddits
        searchSubreddit: function(query) {
          this.reddit('/api/search_reddit_names.json').post({query: query}).then(function(result) {
            console.log("result = ", result);
          });
        },

        // Update options
        changeOption: function(option, value) {
          console.log("Changing option with option = " + option + ", value = " + value);
          var self = this;
          switch (option) {
            case 'sub':
              if (self.sub !== value) {
                self.showLoadingScreen(value);
                try {
                  self.reddit('/r/'+value+'/about.json').get().then(function(result) {
                    if($.isEmptyObject(result)) {
                      console.error("Invalid sub...");
                      self.hideLoadingScreen();
                      return;
                    } else {
                      self.sub = value;
                      self.reset();
                    }
                  });
                } catch (e) {
                  console.error("Invalid sub...");
                  self.hideLoadingScreen();
                }
              }
              break;
            case 'sort':
              if (self.sort !== value) {
                self.sort = value;
                self.reset();
              }
              break;
            case 'time':
              if (self.time !== value) {
                self.time = value;
                self.reset();
              }
              break;
            case 'delay':
              if (self.delay !== value*1000) {
                self.delay = value*1000;
                self.ss.vegas('options', 'delay', value*1000);
              }
              break;
            case 'cover':
              if (self.cover !== value) {
                self.cover = value;
                self.ss.vegas('options', 'cover', value);
                $('#title-cover').toggle();
                $('#title-wrapper').toggle();
              }
              break;
            case 'pause':
              if (value) {
                self.ss.vegas('pause');
              } else {
                self.ss.vegas('play');
              }
              break;
            case 'progress':
              if (self.progress !== value) {
                self.progress = value;
                self.toggleProgressBar();
              }
              break;
            case 'showTitle':
              if (self.showTitle !== value) {
                self.showTitle = value;
                if (value) {
                  if (self.cover) {
                    $('#title-cover').show();
                  } else {
                    $('#title-wrapper').show();
                  }
                } else {
                  $('#title-cover').hide();
                  $('#title-wrapper').hide();
                }
              }
              break;
          }
        },

        toggleProgressBar: function() {
          if (this.progress) {
            $('.vegas-timer-progress').css('height', '100%');
          } else {
            $('.vegas-timer-progress').css('height', '0');
          }
        },

        showLoadingScreen: function(sub) {
          $('#subreddit').text("/r/"+sub);
          $('#loading-screen').addClass('open');
        },

        hideLoadingScreen: function() {
          $('#loading-screen').removeClass('open');
        },

        reset: function() {
          this.showLoadingScreen(this.sub);
          this.hideTitle();
          if (this.initialized) {
            this.ss.vegas('destroy');
            // Remove the previously registered handlers
            this.ss.off('vegaswalk');
            this.ss.off('vegasplay');
          }
          this.initialized = false;
          this.slides = [];

          // Load posts from reddit
          this.reddit('/r/$subreddit/' + this.sort + '.json').listing({
              $subreddit: this.sub,
              t: this.time,
              limit: this.batchSize
          }).then(this.handleSlice.bind(this));
        },

        // Load an image from Gfycat
        loadGfycat: function(id, index, slides, data) {
          query = "http://gfycat.com/cajax/get/"+id;
          return $.getJSON(query, function(response) {
            console.log("Current index = ", index);
            webm = response.gfyItem.webmUrl;
            mp4 = response.gfyItem.mp4Url;
            slides[index] = {
              src: data.preview.images[0].source.url,
              video: {
                src: [webm, mp4],
                loop: false,
                mute: true
              },
              data: data,
              title: data.title
            };
          });
        },

        setImgurHeader: function(xhr) {
          xhr.setRequestHeader('Authorization', 'Client-ID 20b2c8921017ae2');
        },

        // Load an album from Imgur
        // FIXME Better way to do this instead of passing in all of this junk just for
        // the closure? The () syntax in coffeescript is a lot better
        loadImgurAlbum: function(albumId, index, slides, data) {
          url = "https://api.imgur.com/3/album/"+albumId+"/images";
          return $.ajax({
            url: url,
            type: 'GET',
            dataType: 'json',
            success: function(response) {
              links = $.map(response.data, function(e) { return e.link; });
              slides[index] = {
                src: links,
                data: data,
                title: data.title
              }
            },
            beforeSend: this.setImgurHeader
          });
        },

        handleSlice: function(slice) {
          console.log("Loaded " + slice.children.length + " posts from /r/" + this.sub);
          console.log("this = ", this);
          var self = this;
          this.slice = slice;
          this.loadingSlice = false;
          if (this.slice.empty) {
            console.warn("Nothing more to load! Going back to the beginning");
            if (this.initialized) {
              // This first time we reach the end, we simply jump back to the
              // beginning of the slide show for a smooth experience
              this.ss.vegas('jump', 0)
            }
            return;
          }

          promises = [];
          newSlides = new Array(slice.children.length);
          for (var i = 0; i < slice.children.length; i++) {
            data = slice.children[i].data
            // console.log("url = ", data.url);
            if (data.preview !== undefined) {
              // Check if it's video
              if (data.media !== undefined && data.media !== null && data.media.oembed.type === 'video') {
                provider = data.media.oembed.provider_name;
                console.log("provider name = ", data.media.oembed.provider_name);
                if (provider === 'Imgur') {
                  webm = data.url.replace("gifv", "webm");
                  mp4 = data.url.replace("gifv", "mp4");
                  newSlides[i] = {
                    src: data.preview.images[0].source.url,
                    video: {
                      src: [webm, mp4],
                      loop: false,
                      mute: true
                    },
                    data: data,
                    title: data.title
                  };
                } else if (provider === 'gfycat') {
                  console.log("url = ", data.url);
                  match = data.url.match(/gfycat.*\/([^#]*).*$/);
                  if (match) {
                    promise = self.loadGfycat(match[1], i, newSlides, data);
                    promises.push(promise);
                  } else {
                    console.error("Could not parse url");
                  }
                }
              } else if (data.url.match(/.*gif[v]?$/)) {
                console.log("url matches gif, but post does not have an embedded media. url = ", data.url);
                match = data.url.match(/imgur.*\/(.*)\.gif[v]?$/);
                if (match) {
                  imgurId = match[1];
                  webm = "http://i.imgur.com/"+imgurId+".webm";
                  mp4 = "http://i.imgur.com/"+imgurId+".mp4";
                  newSlides[i] = {
                    src: data.preview.images[0].source.url,
                    video: {
                      src: [webm, mp4],
                      loop: false,
                      mute: true
                    },
                    data: data,
                    title: data.title
                  };
                }
              } else if (data.url.match(/imgur.*\/a\//)) { // Imgur album
                console.log("url matches imgur ablum. url = ", data.url);
                match = data.url.match(/imgur.*\/a\/(.*)/);
                if (match) {
                  albumId = match[1];
                  console.log("Album id = ", albumId);
                  promise = this.loadImgurAlbum(match[1], i, newSlides, data);
                  promises.push(promise);
                } else {
                  console.error("Could not parse album url");
                }
              } else { // Image
                newSlides[i] = {
                  src: data.preview.images[0].source.url,
                  data: data,
                  title: data.title
                };
              }
            } else {
              console.error("Missing preview... Can't render slide");
            }
          }

          $.when.apply($, promises).then(function(results) {
            newSlides = $.grep(newSlides, function(slide) {
              return slide != null;
            });
            newSlides = $.map(newSlides, function(slide) {
              if (slide.src instanceof Array) {
                return $.map(slide.src, function(src, i) {
                  return {
                    src: src,
                    data: slide.data,
                    title: slide.data.title + " [" + (i+1) + "/" + slide.src.length + "]",
                  }
                });
              } else {
                return slide;
              }
            });
            console.log("New slides = ", newSlides);
            self.slides = self.slides.concat(newSlides);
            if (!self.initialized) {
              console.log("Initializing slideshow...");
              self.ss.vegas({
                cover: self.cover,
                preload: true,
                delay: self.delay,
                color: '#1D1D1D',
                slides: self.slides
              });
              self.ss.css('height', 'auto');
              self.ss.on('vegaswalk', function(e, index, slideSettings) {
                console.log("Current slide index = ", index);
                console.log("Total slides = ", self.slides.length);
                console.log("Current slide setting = ", slideSettings);
                self.updateTitle(slideSettings.title, slideSettings.data.permalink, slideSettings.data.score);
                if (self.slides.length - index -1 <= self.bufferSize && !self.loadingSlice) {
                  self.loadingSlice = true;
                  if (self.slice.empty) {
                    console.log("Slice is empty, going back to beginning...");
                    // The second time we reach the end again, if it's empty, we
                    // reload the entire stream
                    self.slice.start().then(self.handleSlice.bind(self));
                  } else {
                    self.slice.next().then(self.handleSlice.bind(self));
                  }
                }
              });
              self.ss.on('vegasplay', function(e, index, slideSettings) {
                self.hideLoadingScreen();
              });

              self.toggleProgressBar();

              self.initialized = true;
            } else {
              console.log("Setting slides to ", self.slides);
              console.log("Total number of slides = ", self.slides.length);
              self.ss.vegas('options', 'slides', self.slides);
            }
          });
        },

        hideTitle: function() {
            $('#title-wrapper').hide();
            $('#title-cover').hide();
        },

        updateTitle: function(title, link, score) {
          if (this.showTitle) {
            $('#title-cover-text').html(title);
            $('#title-cover-link').attr('href', 'https://www.reddit.com' + link);
            $('#title-cover-score').text(score);
            $('#title-top-text').html(title);
            $('#title-top-link').attr('href', 'https://www.reddit.com' + link);
            $('#title-top-score').text(score);
            if (this.cover) {
              $('#title-cover').show();
              $('#title-wrapper').hide();
            } else {
              $('#title-cover').hide();
              $('#title-wrapper').show();
              $('#title-top-link').show();
            }
          }
        },

        previous: function() {
          this.ss.vegas('previous');
        },

        next: function() {
          this.ss.vegas('next');
        }

    };

    // A really lightweight plugin wrapper around the constructor,
    // preventing against multiple instantiations
    $.fn[pluginName] = function ( options ) {
        return this.each(function () {
            if (!$.data(this, "plugin_" + pluginName)) {
                $.data(this, "plugin_" + pluginName,
                new RedditCast( this, options ));
            }
        });
    };

    window.RedditCast = RedditCast;
})( jQuery, window, document );

