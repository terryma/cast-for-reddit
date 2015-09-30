// FIXME
// - Get rid global vars
// - Update Snoocore to use the latest version and handle OAuth correctly

var reddit = new window.Snoocore({
    userAgent: 'Cast for Reddit by terryma',
    oauth: {
      type: 'implicit',
      key: 'Cu7_UH3IzqOjvA',
      redirectUri: 'http://terry.ma', // not used
      scope: ['read'],
      deviceId: 'DO_NOT_TRACK_THIS_DEVICE'
    }
});

// Initialize the slideshow
var ss = $('#slideshow');
var initialized = false;
// Which subreddit to use
var sub = 'pics';
// How many listings to load each time
var batchSize = 10;
// All the slides in the show
var slides = [];
// When we have this many items left in the current set of slides, load
// the next batch
var bufferSize = 5;
var slice = null;
var sort = "hot";
var time = "week";
var delay = 5000;
var cover = false;
var progress = true;
var loadingSlice = false;
var showTitle = true;

function searchSubreddit(query) {
  reddit('/api/search_reddit_names.json').post({query: query}).then(function(result) {
    console.log("result = ", result);
  });
}

function changeOption(option, value) {
  console.log("Changing option with option = " + option + ", value = " + value);
  switch (option) {
    case 'sub':
      if (sub !== value) {
        showOverlay(value);
        try {
          reddit('/r/'+value+'/about.json').get().then(function(result) {
            if($.isEmptyObject(result)) {
              console.error("Invalid sub...");
              hideOverlay();
              return;
            } else {
              sub = value;
              reset();
            }
          });
        } catch (e) {
          console.error("Invalid sub...");
          hideOverlay();
        }
      }
      break;
    case 'sort':
      if (sort !== value) {
        sort = value;
        reset();
      }
      break;
    case 'time':
      if (time !== value) {
        time = value;
        reset();
      }
      break;
    case 'delay':
      if (delay !== value*1000) {
        delay = value*1000;
        ss.vegas('options', 'delay', value*1000);
      }
      break;
    case 'cover':
      if (cover !== value) {
        cover = value;
        ss.vegas('options', 'cover', value);
      }
      break;
    case 'pause':
      if (value) {
        ss.vegas('pause');
      } else {
        ss.vegas('play');
      }
      break;
    case 'progress':
      if (progress !== value) {
        progress = value;
        toggleProgressBar();
      }
      break;
    case 'showTitle':
      if (showTitle !== value) {
        showTitle = value;
        if (value) {
          if (cover) {
            $('#overlay-title').show();
          } else {
            $('#title-wrapper').show();
          }
        } else {
          $('#overlay-title').hide();
          $('#title-wrapper').hide();
        }
      }
      break;
  }
}

function toggleProgressBar() {
  if (progress) {
    $('.vegas-timer-progress').css('height', '100%');
  } else {
    $('.vegas-timer-progress').css('height', '0');
  }
}

function showOverlay(sub) {
  $('#subreddit').text("/r/"+sub);
  $('#overlay').addClass('open');
}

function hideOverlay() {
  $('#overlay').removeClass('open');
}

function reset() {
  console.log("Reset called...");
  showOverlay(sub);
  updateTitle("");
  if (initialized) {
    ss.vegas('destroy');
    // Remove the previously registered handlers
    ss.off('vegaswalk');
    ss.off('vegasplay');
  }
  initialized = false;
  slides = [];

  // Load posts from reddit
  reddit('/r/$subreddit/' + sort + '.json').listing({
      $subreddit: sub,
      t: time,
      limit: batchSize
  }).then(handleSlice);
}

// Load an image from Gfycat
function loadGfycat(id, index, slides, data) {
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
      title: data.title,
      provider: 'gfycat'
    };
  });
}


function setImgurHeader(xhr) {
  xhr.setRequestHeader('Authorization', 'Client-ID 20b2c8921017ae2');
}

// Load an album from Imgur
// FIXME Better way to do this instead of passing in all of this junk just for
// the closure? The () syntax in coffeescript is a lot better
function loadImgurAlbum(albumId, index, slides, title) {
  url = "https://api.imgur.com/3/album/"+albumId+"/images";
  return $.ajax({
    url: url,
    type: 'GET',
    dataType: 'json',
    success: function(response) {
      console.log("Got response from imgur for album", response);
      links = $.map(response.data, function(e) { return e.link; });
      slides[index] = {
        src: links,
        title:title,
        provider: 'Imgur'
      }
    },
    beforeSend: setImgurHeader
  });
}

function handleSlice(s) {
  console.log("Loaded " + s.children.length + " posts from /r/" + sub);
  slice = s;
  loadingSlice = false;
  if (slice.empty) {
    console.warn("Nothing more to load! Going back to the beginning");
    if (initialized) {
      ss.vegas('jump', 0)
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
            title: data.title,
            provider: provider
          };
        } else if (provider === 'gfycat') {
          console.log("url = ", data.url);
          match = data.url.match(/gfycat.*\/([^#]*).*$/);
          if (match) {
            promise = loadGfycat(match[1], i, newSlides, data);
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
          provider = "Imgur";
          webm = "http://i.imgur.com/"+imgurId+".webm";
          mp4 = "http://i.imgur.com/"+imgurId+".mp4";
          newSlides[i] = {
            src: data.preview.images[0].source.url,
            video: {
              src: [webm, mp4],
              loop: false,
              mute: true
            },
            title: data.title,
            provider: provider
          };
        }
      } else if (data.url.match(/imgur.*\/a\//)) { // Imgur album
        console.log("url matches imgur ablum. url = ", data.url);
        match = data.url.match(/imgur.*\/a\/(.*)/);
        if (match) {
          albumId = match[1];
          console.log("Album id = ", albumId);
          promise = loadImgurAlbum(match[1], i, newSlides, data.title);
          promises.push(promise);
        } else {
          console.error("Could not parse album url");
        }
      } else { // Image
        newSlides[i] = {
          src: data.preview.images[0].source.url,
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
            title: slide.title + " [" + (i+1) + "/" + slide.src.length + "]"
          }
        });
      } else {
        return slide;
      }
    });
    console.log("New slides = ", newSlides);
    slides = slides.concat(newSlides);
    if (!initialized) {
      console.log("Initializing slideshow...");
      ss.vegas({
        cover: cover,
        preload: true,
        delay: delay,
        color: 'black',
        slides: slides
      });
      ss.css('height', 'auto');
      ss.on('vegaswalk', function(e, index, slideSettings) {
        console.log("Current slide index = ", index);
        console.log("Total slides = ", slides.length);
        console.log("Current slide setting = ", slideSettings);
        updateTitle(slideSettings.title);
        if (slides.length - index -1 <= bufferSize && !loadingSlice) {
          loadingSlice = true;
          slice.next().then(handleSlice);
        }
      });
      ss.on('vegasplay', function(e, index, slideSettings) {
        hideOverlay();
      });

      toggleProgressBar();

      initialized = true;
    } else {
      console.log("Setting slides to ", slides);
      console.log("Total number of slides = ", slides.length);
      ss.vegas('options', 'slides', slides);
    }
  });
}

function updateTitle(title) {
  if (showTitle) {
    $('#overlay-title').html(title);
    $('#title').html(title);
    if (cover) {
      $('#overlay-title').show();
      $('#title-wrapper').hide();
    } else {
      $('#overlay-title').hide();
      $('#title-wrapper').show();
    }
  }
}

// Load posts from reddit
reset();
