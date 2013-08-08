var path  = require('path'),
    fs    = require('fs'),
    async = require('async'),
    multimeter = require('multimeter');

var Migrate = function(fromClient, toClient, options) {
  this.fromClient     = fromClient;
  this.fromContainer  = null;
  this.toClient       = toClient;
  this.options        = options || {};

  if (this.options.logFile) {
    if (this.options.logFile.charAt(0) !== '/' && this.options.logFile.charAt(0) !== '~') {
      this.options.logFile = path.join(__dirname, '../', this.options.logFile);
    }
  }

}

Migrate.prototype.migrate = function(done) {
  async.waterfall([
    this.getFromContainer.bind(this),
    this.getFiles.bind(this)]
  , done);
}

Migrate.prototype.getFromContainer = function(next) {
  console.log('Getting Container...');
  this.fromClient.getContainer(this.fromClient.config.container, function(err, container){
    if (err) return next(err);
    next(null, container);
  })
}

Migrate.prototype.getFiles = function(container, next) {
  var pageQueue,
      numFilePages = 1,
      _this = this;

  console.log('Getting files (this may take a while)...');

  if (container.client.provider == "rackspace" && !this.options.testMode) {
    numFilePages = Math.floor(container.count / 10000);
  }

  pageQueue = async.queue(function(page, done){
    _this.fromClient.getFiles(container.name, {marker: page}, function(err, files){
      if (err) return done(err);
      console.log('Files retrieved...');
      _this.migrateFiles(files.filter(_this.removeDirs), page, numFilePages, done);
    })
  }, 1);

  for (var i = 0; i < numFilePages; i++) {
    pageQueue.push(i+1, function(err) {
      if (err) return next(err);
    });
  };

  pageQueue.drain = function(){
    console.log();
    next();
  }
}

Migrate.prototype.removeDirs = function(element, index, array) {
  return (element.contentType !== "application/directory");
}

Migrate.prototype.migrateFiles = function(files, page, totalPages, next) {

  var fileQueue, _bar,
      completed     = 0,
      _this         = this,
      totalFiles    = this.options.testSize || files.length,
      concurrency   = this.options.concurrency || 2,
      meter         = multimeter(process),
      errors        = [],
      failedFiles   = [];

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
          if (err) {
            _this.logOut('Error downloading: ' + file.name);
            _this.logOut(err);
            failedFiles.push(file);
          } else {
            _this.logOut('Download Complete: ' + file.name);
          }
        })
        .pipe(_this.toClient.upload(upConfig, function(err, uploadedFile){
          if (err) {
            _this.logOut('Error uploading: ' + file.name);
            _this.logOut(err);
          } else {
            _this.logOut('Upload Complete: ' + file.name);
          }
          done();
        }));
    }

  }, concurrency);

  console.log('Starting migration (page %s of %s)...', page, totalPages);

  if (_this.options.testMode){
    console.log('Running in TEST MODE (' + _this.options.testSize + ')');
  }

  meter.drop({width: 100}, function(bar){

    files.every(function(file, index){
      if (_this.options.testMode && _this.options.testSize < index + 1) {
        return false;
      } else {
        fileQueue.push(file, function(err){
          var percent;
          if (err) return next(err);
          completed++;
          percent = (completed / totalFiles) * 100;
          bar.percent(percent, Math.floor(percent) + ' % (' + completed + '/' + totalFiles + ')');
        });
        return true;
      }
    });

    fileQueue.drain = function(){
      meter.destroy();
      console.log();
      if (failedFiles.length > 0) {
        console.log('The following files had errors:');
        failedFiles.forEach(function(file){
          console.log(file.name);
        })
      }
      next();
    }

  });
}

Migrate.prototype.logOut = function(msg) {
  if (this.options.logFile) {
    fs.appendFile(this.options.logFile, msg + "\n");
  }
}

exports = module.exports = Migrate;