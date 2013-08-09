var path  = require('path'),
    fs    = require('fs'),
    async = require('async'),
    ProgressBar = require('progress');

var Migrate = function(fromClient, toClient, options) {
  this.fromClient     = fromClient;
  this.fromContainer  = null;
  this.toClient       = toClient;
  this.options        = options || {};
  this.errors         = [];
  this.failedFiles    = [];

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
  var migrators     = [],
      numFilePages  = 1,
      page          = 0,
      _this         = this;

  if (container.client.provider == "rackspace" && !this.options.testMode) {
    numFilePages = Math.floor(container.count / 10000);
    if (container.count % 10000 > 0) numFilePages++;
  }

  //pageQueue = async.queue(function(page, done){
  //  console.log('Getting files for page %s of %s (this may take a while)...', page, numFilePages);
  //  _this.fromClient.getFiles(container.name, {marker: page}, function(err, files){
  //    if (err) return done(err);
  //    console.log('Files retrieved...');
  //    _this.migrateFiles(files.filter(_this.removeDirs), page, numFilePages, done);
  //  })
  //}, 1);

  for (var i = 0; i < numFilePages; i++) {
    migrators.push(function(lastResult, done) {
      var options = {};
      page++;
      if (typeof lastResult == 'function') {
        done = lastResult;
        lastResult = null;
      }
      if (lastResult) {
        options.marker = lastResult;
      }
      console.log('Getting files for page %s of %s (this may take a while)...', page, numFilePages);
      _this.fromClient.getFiles(container.name, options, function(err, files){
        if (err) return done(err);
        console.log('Files retrieved...');
        _this.migrateFiles(files.filter(_this.removeDirs), page, numFilePages, done);
      })
    });
  };

  async.waterfall(migrators, next);
}

Migrate.prototype.removeDirs = function(element, index, array) {
  return (element.contentType !== "application/directory");
}

Migrate.prototype.migrateFiles = function(files, page, totalPages, next) {

  var fileQueue, progress,
      completed     = 0,
      _this         = this,
      totalFiles    = this.options.testSize || files.length,
      concurrency   = this.options.concurrency || 2,
      failed        = [];

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
      if (_this.options.dryRun) {
        setTimeout(function() {
          _this.logOut('DRY RUN Processing: ' + file.name);
          done();
        }, 10);
      } else {
        _this.fromClient.download(dlConfig, function(err, downloadedFile){
            if (err) {
              _this.logOut('Error downloading: ' + file.name);
              _this.logOut(err);
              failed.push(file);
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
    }

  }, concurrency);

  console.log('Starting migration (page %s of %s)...', page, totalPages);

  if (_this.options.testMode){
    console.log('Running in TEST MODE (' + _this.options.testSize + ')');
  }

  progress = new ProgressBar('[:bar] :percent (:current/:total) :etas', {
    total: totalFiles,
    complete: '=',
    incomplete: ' ',
    width: 100
  });

  files.every(function(file, index){
    if (_this.options.testMode && _this.options.testSize < index + 1) {
      return false;
    } else {
      fileQueue.push(file, function(err){
        if (err) return next(err);
        progress.tick();
      });
      return true;
    }
  });

  fileQueue.drain = function(){
    console.log();
    if (failed.length > 0) {
      console.log('The following files had errors:');
      failedFiles.forEach(function(file){
        _this.failedFiles.push(file);
        console.log(file.name);
      })
    }
    next(null, files[files.length - 1].name);
  }
}

Migrate.prototype.logOut = function(msg) {
  if (this.options.logFile) {
    fs.appendFile(this.options.logFile, msg + "\n");
  }
}

exports = module.exports = Migrate;