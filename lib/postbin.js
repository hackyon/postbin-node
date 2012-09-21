var http = require('http')
  , req = http.IncomingMessage.prototype
  , fs = require('fs')
  , path = require('path');

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
 * Resolve the temporary path to store the bins.
 */
var BIN_PATH = fs.realpathSync('./bins');
/* var BIN_PATH = '/tmp';
var envPaths = ['TMPDIR', 'TMP', 'TEMP'];
for (var i = 0; i < envPaths.length; i++) {
  var path = process.env[envPaths[i]];
  if (path) {
    // TODO: Make a temporary directory inside TMP
    BIN_PATH = path;
    break;
  }
};*/

/**
 * Bins are deleted if they haven't been accessed in this duration
 * of time (in milliseconds).
 */
var CLEAN_BIN_THRESHOLD = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Resolve the file path for a bin.
 */
var resolvePath = function(id) {
  return path.join(BIN_PATH, id);
};

/**
 * Parses a param as a bin id, and returns null if the
 * param cannot be parsed.
 */
var parseId = function(param) {
  if (typeof param !== 'String') {
    var match = param.match(/^[0-9A-F]{10}$/gi);
    if (match) {
      return match[0].toString();
    }
  }
  return null;
};

/**
 * Generates a new bin id.
 */
var generateId = function() {
  var digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'A', 'B', 'C', 'D', 'E', 'F'];
  var id = '';
  for (var i = 0; i < 10; i++) {
    id += digits[Math.floor(Math.random()*16)];
  }
  return id;
};


/**
 * Constructs the raw HTTP request.
 */
var raw = function(req, body) {
  var data = req.method + ' ' + req.url;
  data += ' HTTP/' + req.httpVersion + "\r\n";
  for (var i = 0; i < req.rawHeaders.length; i++) {
    data += req.rawHeaders[i] + "\r\n";
  }
  data += "\r\n" + body;
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

var cleanBins = function() {
  fs.readdir(BIN_PATH, function(err, files) {
    if (err) {
      console.log(err);
      return;
    }

    var now = new Date();
    for (var i = 0; i < files.length; i++) {
      var resolvedPath = path.join(BIN_PATH, files[i]);
      fs.stat(resolvedPath, (function(file, id) {
        // Create closure to store files[i]
        return function(err, stats) {
          if (err) {
            console.log(err);
            return;
          }
          var diff = Math.abs(now.getTime() - stats.atime.getTime());
          if (diff > CLEAN_BIN_THRESHOLD) {
            console.log("Removing bin " + id);
            fs.unlink(file);
          }
        };
      })(resolvedPath, files[i]));
    }
  });
};

module.exports.BIN_PATH = BIN_PATH;
module.exports.resolvePath = resolvePath;
module.exports.parseId = parseId;
module.exports.generateId = generateId;
module.exports.raw = raw;
module.exports.ago = ago;
module.exports.cleanBins = cleanBins;


