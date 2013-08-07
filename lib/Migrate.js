var path  = require('path'),
    fs    = require('fs'),
    async = require('async'),
    multimeter = require('multimeter');

var Migrate = function(fromClient, toClient, concurrency, logFile) {
  this.fromClient = fromClient;
  this.toClient = toClient;
  this.concurrency = concurrency;

  if (logFile) {
    if (logFile.charAt(0) == '/' || logFile.charAt(0) == '~') {
      this.logFile = logFile;
    } else {
      this.logFile = path.join(__dirname, '../', logFile);
    }
  }

}

Migrate.prototype.getFiles = function(next) {
  var _this = this;
  console.log('Getting files (this may take a while)...');
  this.fromClient.getFiles(this.fromClient.config.container, function(err, files){
    if (err) return callback(err);
    console.log('Files retrieved...');
    _this.migrateFiles(files.filter(_this.removeDirs), next);
  })
}

Migrate.prototype.removeDirs = function(element, index, array) {
  return (element.contentType !== "application/directory");
}

Migrate.prototype.migrateFiles = function(files, next) {

  var fileQueue, bar,
      completed     = 0,
      _this         = this,
      concurrency   = this.concurrency,
      meter         = multimeter(process);

  fileQueue = async.queue(function(file, done){

    var dlConfig = {
          container: _this.fromClient.config.container,
          remote: file.name
        },
        upConfig = {
          container: _this.toClient.config.container,
          remote: file.name
        };

    if (_this.toClient.config.provider == 'amazon') {
      if (_this.toClient.config.acl) {
        upConfig.headers = upConfig.headers || {};
        upConfig.headers["x-amz-acl"] = _this.toClient.config.acl;
      }
    }

    if (file.contentType !== "application/directory") {
      _this.logOut('Downloading: ' + file.name);
      _this.fromClient.download(dlConfig, function(err, downloadedFile){
          if (err) return done(err);
          _this.logOut('Download Complete: ' + file.name);
        })
        .pipe(_this.toClient.upload(upConfig, function(err, uploadedFile){
          if (err) return done(err);
          _this.logOut('Upload Complete: ' + file.name);
          done();
        }));
    }

  }, concurrency);

  console.log('Starting migration...');

  meter.drop(function(bar){

    files.forEach(function(file){
      fileQueue.push(file, function(err){
        var percent;
        if (err) return next(err);
        completed++;
        percent = (completed / files.length) * 100;
        bar.percent(percent, ' % (' + completed + '/' + files.length + ')');
      });
    });

    fileQueue.drain = function(){
      next();
    }

  });
}

Migrate.prototype.logOut = function(msg) {
  if (this.logFile) {
    fs.appendFile(this.logFile, msg + "\n");
  }
}

exports = module.exports = Migrate;