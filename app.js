// TODO: Make a more user-friendly view of the bins
// TODO: User-specified response for HTTP requests

var express = require('express')
  , http = require('http')
  , WebSocketServer = require('websocket').server
  , path = require('path')
  , os = require('os')
  , fs = require('fs')
  , async = require('async')
  , Bin = require('./lib/bin');

var app = express();

app.configure(function() {
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');

  app.use(express.favicon(path.join(__dirname, 'public/favicon.ico')));
  app.use(express.logger('dev'));
  app.use(express.cookieParser());
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
  res.render('index', { 
    title: 'PostBin in node.js',
    newId: Bin.generateId(),
    recentBins: Bin.getRecent(req)
  });
});


/**
 * Routes to inspect bins.
 */
app.get('/inspect/:id', function(req, res) {
  var id = Bin.parseId(req.params.id);
  if (!id) {
    // Render 404 if id is not well-formed
    render404(req, res);
    return;
  }

  // Load the bin
  var bin = new Bin(id);
  async.parallel([
    function(cb) {
      bin.getHTTPRequests(function(requests) {
        cb(null, requests);
      });
    },
    function(cb) {
      bin.getWebSocketConnections(function(sockets) {
        cb(null, sockets);
      });
    }],
    function(err, load) {
      var requests = load[0];
      console.log(requests);

      var sockets  = load[1];

      if (requests.length > 0 || sockets.length > 0) {
        bin.markAsRecent(req, res);
      }
      res.render('inspect', {
        title: 'PostBin /' + id,
        binId: id,
        newId: Bin.generateId(),
        requests: requests,
        sockets: sockets,
        host: req.headers.host || os.hostname()
      });
    }
  );
});


/**
 * Routes to accept requests.
 */
app.all('/:id', function(req, res) {
  var id = Bin.parseId(req.params.id);
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
    req.rawBody = rawBody;

    var bin = new Bin(id);
    bin.markAsRecent(req, res);

    res.send(200, 'OK');

    bin.getHTTPRequests(function() {
      bin.addHTTPRequest(req);
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

/**
 * Clean the bins every once in a while.
 */
var clean = function() {
  Bin.clean();
  setTimeout(clean, 24 * 60 * 60 * 1000);
};

var server = http.createServer(app);
server.listen(app.get('port'), function() {
  console.log("PostBin (in node.js)");
  console.log("Bins stored in " + Bin.BIN_PATH);
  console.log("Listening on port " + app.get('port'));
  console.log("");

  clean(); // Start the cleaning 
});


/**
 * Provide support for WebSockets.
 */
var webSocketServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false,
  assembleFragments: false
});

webSocketServer.on('request', function(request) {
  var handshakePath = request.resourceURL.path;
  var id = Bin.parseId(handshakePath.replace('/', ''));
  if (!id) { // Reject with 404 if id is not well-formed
    request.reject(404);
    return;
  }

  // Accept the first available protocol
  var protocol = null;
  if (request.requestedProtocols) {
    protocol = request.requestedProtocols[0];
  }

  var connection = request.accept(protocol, request.origin);

  var bin = new Bin(id);
  var socketId = bin.addWebSocketEvent(0, 'connection', {
    connection: connection,
    request:    request,
    protocol:   protocol
  });

  connection.on('message', function(message) {
    if (protocol == 'echo') {
      connection.send(message.utf8Data);
    }
  });

  connection.on('close', function(reasonCode, description) {
  });

  connection.on('frame', function(frame) {
    // Intercept the raw frames
    //console.log(frame.opcode);
    //console.log(frame.binaryPayload);

    // Hack to have WebSocketConnection process the frames for us
    var wrapper = { };
    wrapper.__proto__ = connection;
    wrapper.assembleFragments = true;
    wrapper.processFrame(frame);
  });
});


/**
 * Experimenting with Unix sockets (it's much easier to just use nc)
 */
if (false) {
  var net = require('net');

  var socketPort = 3030;
  var socketServer = net.createServer(function(socket) {
    console.log('SOCKET CONNECTION ESTABLISHED');
    socket.on('data', function(data) {
      console.log(socket.remoteAddress);
      console.log(data);
    });

    socket.on('end', function() {
      console.log('SOCKET CLOSED');
    });
  });

  socketServer.listen(socketPort, function() {
    console.log("Listening on port " + socketPort + " for Unix sockets");
  });
}


