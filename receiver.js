var reddit = new window.Snoocore({
    userAgent: 'reddit-cast by terryma',
    // useBrowserCookies: true
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

function changeOption(option, value) {
  switch (option) {
    case 'sub':
      showOverlay(value);
      try {
        reddit('/r/'+value+'/about.json').get().then(function(result) {
          sub = value;
          reset();
        });
      } catch (e) {
        hideOverlay();
        console.error("Invalid sub...");
      }
      break;
    case 'sort':
      sort = value;
      reset();
      break;
    case 'time':
      time = value;
      reset();
      break;
    case 'delay':
      delay = value*1000;
      ss.vegas('options', 'delay', value*1000);
      break;
    case 'cover':
      cover = value;
      ss.vegas('options', 'cover', value);
      break;
    case 'pause':
      if (value) {
        ss.vegas('pause');
      } else {
        ss.vegas('play');
      }
      break;
  }
}

function showOverlay(title) {
  $('#overlay').addClass('open');
  $('#overlay-text').text("Loading from /r/"+title);
}

function hideOverlay() {
  $('#overlay').removeClass('open');
}

function reset() {
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
  reddit('/r/$subreddit/' + sort).listing({
      $subreddit: sub,
      t: time,
      limit: batchSize
  }).then(handleSlice);
}

function loadGfycat(url, index, slides) {
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
      provider: provider,
      webm: webm
    };
  });
}

function handleSlice(s) {
  console.log("Handling set of slides... size = ", s.children.length);
  console.log("slice = ", s);
  slice = s;
  if (slice.empty) {
    // We're reached end? What to do now?
    alert("Got to the end!");
    return;
  }

  promises = [];
  newSlides = new Array(slice.children.length);
  for (var i = 0; i < slice.children.length; i++) {
    data = slice.children[i].data
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
            provider: provider,
            webm: webm
          };
        } else if (provider === 'gfycat') {
          console.log("url = ", data.url);
          match = data.url.match(/gfycat.*\/([^#]*).*$/);
          if (match) {
            gfycatId = match[1];
            query = "http://gfycat.com/cajax/get/"+gfycatId;
            promise = loadGfycat(query, i, newSlides);
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
          console.log("webm link = ", webm);
          newSlides[i] = {
            src: data.preview.images[0].source.url,
            video: {
              src: [webm, mp4],
              loop: false,
              mute: true
            },
            title: data.title,
            provider: provider,
            webm: webm
          };
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

  console.log("Number of promises = ", promises.length);
  $.when.apply($, promises).then(function(results) {
    console.log("results = ", results);
    console.log("slides = ", slides.length);
    newSlides = $.grep(newSlides, function(slide) {
      return slide != null;
    });
    slides = slides.concat(newSlides);
    console.log("slides = ", slides);
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
        console.log("Current slide = ", index);
        console.log("Total slides = ", slides.length);
        console.log("slide setting = ", slideSettings);
        updateTitle(slideSettings.title);
        if (slides.length - index -1 <= bufferSize) {
          slice.next().then(handleSlice);
        }
      });
      ss.on('vegasplay', function(e, index, slideSettings) {
        hideOverlay();
      });
      initialized = true;
    } else {
      console.log("Setting slides to ", slides);
      console.log("Total number of slides = ", slides.length);
      ss.vegas('options', 'slides', slides);
    }
  });
    // url = slice.children[i].data.url;
    // https://api.imgur.com/3/image/
    // slides.push({src: slice.children[i].data.url});
  // Immediately load the next slice. We don't wanna do that, we only want
  // to load next when the current slideshow has played over half of the
  // size of the last slice
  // return slice.next().then(handleSlice);
}

function updateTitle(title) {
  console.log("Updating title to ", title);
  $('#title').text(title);
}

// Load posts from reddit
reset();

