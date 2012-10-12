var http = require('http')
  , req = http.IncomingMessage.prototype
  , fs = require('fs')
  , path = require('path')
  , async = require('async')
  , rimraf = require('rimraf');

/**
 * Intercept the raw headers by overriding the private 
 * _addHeaderLine(). This is necessary since node.js may 
 * modify or remove certain headers when parsing.
 */
var _addHeaderLine = req._addHeaderLine;
req._addHeaderLine = function(field, value) {
  if (!this.complete) { // Ignore trailing headers
    if (!this.rawHeaders)  this.rawHeaders = [];
    this.rawHeaders.push(field + ': ' + value);
  }
  _addHeaderLine.call(this, field, value);
};



/**
 * Represents a bin that can be used to store HTTP requests.
 */
var Bin = function(id) {
  this.id = id;
  this.httpPath   = path.join(Bin.BIN_PATH, id); // File
  this.socketPath = path.join(Bin.BIN_PATH, 'sockets', id); // Directory
};

Bin.BIN_PATH = fs.realpathSync('./bins'); // Path to store the bins
Bin.CLEAN_BIN_THRESHOLD = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Stores a HTTP request to the bin.
 */
Bin.prototype.addHTTPRequest = function(httpRequest) {
  if (!this.httpRequests) this.httpRequests = [];
  
  this.httpRequests.push({
    time: +new Date,
    raw:  raw(httpRequest)
  });

  // Limit the number of requests to store
  this.httpRequests.sort(function(a, b) {
    return b.time-a.time;
  });
  this.httpRequests = this.httpRequests.slice(0, 10);

  fs.writeFile(this.httpPath, JSON.stringify(this.httpRequests));
};

/**
 * Loads all the HTTP requests from the bin.
 */
Bin.prototype.getHTTPRequests = function(callback) {
  var self = this;
  fs.readFile(this.httpPath, function(err, fileData) {
    if (err) {
      if (err.code !== 'ENOENT') throw err;
      var requests = [];

    } else {
      var requests = JSON.parse(fileData);

      // Provide more variables for formatting
      for (var i = 0; i < requests.length; i++) {
        var date = new Date(requests[i].time);
        requests[i].ago = ago(date);
        requests[i].utc = date.toString();
        requests[i].ts  = date.getTime().toString();
      }
    }
    self.httpRequests = requests;
    callback(self.httpRequests);
  });
};

/**
 * Stores a WebSocket event to the bin.
 */
Bin.prototype.addWebSocketEvent = function(socketId, type, data) {
  if (!socketId) {
    socketId = (+new Date()).toString();
  }

  if (!this.socketEvents) {
    this.socketEvents = [];
  }
  if (!this.socketEvents[socketId]) {
    this.socketEvents[socketId] = [];
  }

  var socketEvent = null;
  switch (type) {
  case 'connection':
    socketEvent = { 
      type: 'connection', 
      raw: raw(data.request.httpRequest),
      time: +new Date
    };
    break;
  case 'message':
    socketEvent = { 
      type: 'message', 
      time: +new Date,
      message: data.message
    };
    break;
  case 'close':
    socketEvent = { 
      type: 'close', 
      time: +new Date,
      reasonCode:  data.reasonCode,
      description: data.description
    };
    break;
  case 'frame': 
    // frame.opcode, frame.binaryPayload
    break;
  }

  if (socketEvent) {
    this.socketEvents[socketId].unshift(socketEvent);
  }

  var self = this;
  fs.mkdir(this.socketPath, function(err) {
    // No biggie if the path already exists
    if (err && err.code !== 'EEXIST') throw err;

    var file = path.join(self.socketPath, socketId);
    fs.writeFile(file, JSON.stringify(self.socketEvents[socketId]));
  });
  return socketId;
};

/**
 * Loads all the WebSocket connections from the bin.
 */
Bin.prototype.getWebSocketConnections = function(callback) {
  var self = this;
  fs.readdir(this.socketPath, function(err, files) {
    if (err) {
      if (err.code !== 'ENOENT') throw err;
      var connections = [];
      callback(connections);
    } else {
      var readers = [];
      for (var i = 0; i < files.length; i++) {
        // Each connection has its own file
        var file = path.join(self.socketPath, files[i]);
        readers.push((function(file) {
            // Wrapping closure to save the file
            return function(cb) {
              fs.readFile(file, function(err, fileData) {
                var connection = JSON.parse(fileData);
                cb(null, connection);
              });
            };
          })(path.join(self.socketPath, files[i]))
        );
      }
      async.parallel(readers, function(err, connections) {
        // Format the socket connections
        var sockets = [];
        for (var i = 0; i < connections.length; i++) {
          var events = connections[i];
          if (events.length <= 0) continue;
          var time = events[0].time;

          for (var j = 0; j < events.length; j++) {
            var date = new Date(time);
            events[j].ago = ago(date);
            events[j].utc = date.toString();
            events[j].ts  = date.getTime().toString();
          }

          var date = new Date(time);
          sockets.push({
            events: events,
            websocket: true,
            time: time,
            ago:  ago(date),
            utc:  date.toString(),
            ts:   date.getTime().toString()
          });
        }

        sockets.sort(function(a, b) {
          return b.time-a.time;
        });

        callback(sockets);
      });
    }
  });
};


/**
 * Marks the current bin as a recent bin (in the cookies).
 */
Bin.prototype.markAsRecent = function(req, res) {
  var recentBins = [];
  if (req.cookies) {
    try {
      recentBins = JSON.parse(req.cookies['postbin-recent']);
    } catch (e) { }
    var index = recentBins.indexOf(this.id);
    if (index === -1) {
      recentBins.unshift(this.id);
      recentBins = recentBins.slice(0, 5);
    } else {
      var temp = recentBins[0];
      recentBins[0] = recentBins[index];
      recentBins[index] = temp;
    }
  }
  res.cookie('postbin-recent', JSON.stringify(recentBins),
    { expires: new Date((+new Date()) + 1000000) });
};

/**
 * Fetch the list of recent bins.
 */
Bin.getRecent = function(req) {
  var recentBins = [];
  if (req.cookies) {
    try {
      recentBins = JSON.parse(req.cookies['postbin-recent']);
    } catch (e) { }
  }
  return recentBins;
};

/**
 * Generates a new bin id.
 */
Bin.generateId = function() {
  var digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'A', 'B', 'C', 'D', 'E', 'F'];
  var id = '';
  for (var i = 0; i < 10; i++) {
    id += digits[Math.floor(Math.random()*16)];
  }
  return id;
};

/**
 * Parses a param as a bin id, and returns null if the
 * param cannot be parsed.
 */
Bin.parseId = function(param) {
  if (typeof param !== 'String') {
    var match = param.match(/^[0-9A-F]{10}$/gi);
    if (match) {
      return match[0].toString();
    }
  }
  return null;
};

/**
 * Cleanup by removing old bins.
 */
Bin.clean = function() {
  Bin.cleanHTTPRequests();
  Bin.cleanWebSocketConnections();
};

Bin.cleanHTTPRequests = function() {
  fs.readdir(Bin.BIN_PATH, function(err, files) {
    if (err) {
      console.log(err);
      return;
    }

    var now = new Date();
    for (var i = 0; i < files.length; i++) {
      var resolvedPath = path.join(Bin.BIN_PATH, files[i]);
      fs.stat(resolvedPath, (function(file, id) {
        // Create closure to store files[i]
        return function(err, stats) {
          if (err) {
            console.log(err);
            return;
          }
          
          if (stats.isDirectory()) return;

          var diff = Math.abs(now.getTime() - stats.atime.getTime());
          if (diff > Bin.CLEAN_BIN_THRESHOLD) {
            console.log("Removing bin " + id);
            fs.unlink(file);
          }
        };
      })(resolvedPath, files[i]));
    }
  });
};

Bin.cleanWebSocketConnections = function() {
  fs.readdir(path.join(Bin.BIN_PATH, 'sockets'), function(err, files) {
    if (err) {
      console.log(err);
      return;
    }

    var now = new Date();
    for (var i = 0; i < files.length; i++) {
      var resolvedPath = path.join(Bin.BIN_PATH, 'sockets', files[i]);
      fs.stat(resolvedPath, (function(file, id) {
        // Create closure to store files[i]
        return function(err, stats) {
          if (err) {
            console.log(err);
            return;
          }
          
          if (!stats.isDirectory()) return;

          var diff = Math.abs(now.getTime() - stats.atime.getTime());
          if (diff > Bin.CLEAN_BIN_THRESHOLD) {
            console.log("Removing socket bin " + id);
            rimraf(file, function() { });
          }
        };
      })(resolvedPath, files[i]));
    }
  });
};

/**
 * Constructs the raw HTTP request.
 */
var raw = function(req) {
  var data = req.method + ' ' + req.url;
  data += ' HTTP/' + req.httpVersion + "\r\n";
  for (var i = 0; i < req.rawHeaders.length; i++) {
    data += req.rawHeaders[i] + "\r\n";
  }

  if (req.rawBody) {
    data += "\r\n" + req.rawBody;
  }
  return data;
};

/**
 * Express the date in terms of how many minutes ago.
 */
var ago = function(date) {
  var ranges = [
    [60, 'just now'],
    [120, '1 minute ago'],
    [3600, 'minutes', 60],
    [7200, '1 hour ago'],
    [86400, 'hours', 3600],
    [172800, 'yesterday'],
    [604800, 'days', 86400],
    [1209600, 'last week'],
    [2419200, 'weeks', 604800],
    [4838400, 'last month'],
    [29030400, 'months', 2419200],
    [58060800, 'last year'],
    [2903040000, 'years', 29030400]
  ];

  var now = new Date();
  var seconds = ((now.getTime() - date.getTime()) / 1000);

  var i = 0, range;
  for (var i = 0; i < ranges.length; i++) {
    var range = ranges[i];
    if (seconds < range[0]) {
      if (range.length == 3) {
        return [Math.floor(seconds / range[2]), range[1], "ago"].join(" ");
      } else {
        return range[1];
      }
    }
  }
  return date.toString();
};


module.exports = Bin;
