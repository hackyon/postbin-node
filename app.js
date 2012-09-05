var express = require('express')
  , http = require('http')
  , path = require('path')
  , os = require('os')
  , fs = require('fs')
  , postbin = require('./lib/postbin');

var app = express();

app.configure(function() {
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');

  app.use(express.favicon(path.join(__dirname, 'public/favicon.ico')));
  app.use(express.logger('dev'));
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(require('less-middleware')({ src: __dirname + '/public' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(app.router);
 
  /**
   * Intercept errors and send a generic 500.
   */
  app.use(function(err, req, res, next) {
    console.log(err);
    res.status(500);
    res.render('500', { 
      title: 'The Server Encountered an Error',
      error: err 
    });
  });
});


/**
 * Route to the root path.
 */
app.get('/', function(req, res) {
  var recentBins = [];
  if (req.cookies) {
    try {
      recentBins = JSON.parse(req.cookies['postbin-recent']);
    } catch (e) { }
  }

  res.render('index', { 
    title: 'PostBin in node.js',
    newId: postbin.generateId(),
    recentBins: recentBins
  });
});


/**
 * Routes to inspect bins.
 */
app.get('/inspect/:id', function(req, res) {
  var id = postbin.parseId(req.params.id);
  if (!id) {
    // Render 404 if id is not well-formed
    render404(req, res);
    return;
  }

  var filePath = postbin.resolvePath(id);
  fs.readFile(filePath, function(err, fileData) {
    if (err && err.errno !== 34) throw err;

    var requests = [ ];
    if (!err) {
      requests = JSON.parse(fileData);

      // Provide more variables for formatting
      for (var i = 0; i < requests.length; i++) {
        var date = new Date(requests[i].time);
        requests[i].ago = postbin.ago(date);
        requests[i].utc = date.toString();
        requests[i].ts  = date.getTime().toString();
      }

      // Save the recent bins inside the cookies
      var recentBins = [];
      if (req.cookies) {
        try {
          recentBins = JSON.parse(req.cookies['postbin-recent']);
        } catch (e) { }
        if (recentBins.indexOf(id) === -1) {
          recentBins.unshift(id);
          recentBins = recentBins.slice(0, 5);
        }
      }
      res.cookie('postbin-recent', JSON.stringify(recentBins),
        { expires: new Date((+new Date()) + 1000000) });
    }

    res.render('inspect', {
      title: 'PostBin /' + id,
      binId: id,
      newId: postbin.generateId(),
      requests: requests,
      host: req.headers.host || os.hostname()
    });
  });
});


/**
 * Routes to accept requests.
 */
app.all('/:id', function(req, res) {
  var id = postbin.parseId(req.params.id);
  if (!id) {
    // Render 404 if id is not well-formed
    render404(req, res);
    return;
  } 

  // Construct the raw body of the request
  var rawBody = '';
  req.setEncoding('utf8');
  req.on('data', function(chunk) {
    rawBody += chunk;
  });
  req.on('end', function() {
    res.send(200, 'OK');

    var filePath = postbin.resolvePath(id);
    fs.readFile(filePath, function(err, fileData) {
      if (err && err.errno !== 34) throw err;

      var requests = [ ];
      if (!err) requests = JSON.parse(fileData);

      // Capture the request
      requests.push({
        time: +new Date,
        raw:  postbin.raw(req, rawBody)
      });

      // Limit the number of requests to store
      requests.sort(function(a, b) {
        return b.time-a.time;
      });
      requests = requests.slice(0, 10);

      fs.writeFile(filePath, JSON.stringify(requests));
    });
  });

});

/**
 * Render 404 for any other paths.
 */
var render404 = function(req, res) {
  res.status(404);
  res.render('404', { 
    title: 'Page Not Found',
  });
};
app.all('*', render404);


http.createServer(app).listen(app.get('port'), function() {
  console.log("PostBin (in node.js)");
  console.log("Bins stored in " + postbin.basePath);
  console.log("");
  console.log("Listening on port " + app.get('port'));
});

