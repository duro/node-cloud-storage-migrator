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
  this.whammy         = false;

  if (this.options.logFile) {
    if (this.options.logFile.charAt(0) !== '/' && this.options.logFile.charAt(0) !== '~') {
      this.options.logFile = path.join(__dirname, '../', this.options.logFile);
    }
  }

}

// Kick off the migration process
Migrate.prototype.migrate = function(done) {
  async.waterfall([
    this.getFromContainer.bind(this),
    this.getFiles.bind(this)]
  , done);
}

// Get From Container Metadata
Migrate.prototype.getFromContainer = function(next) {
  console.log('Getting Container...');
  this.fromClient.getContainer(this.fromClient.config.container, function(err, container){
    if (err) return next(err);
    next(null, container);
  })
}

// Get file array from source container, and setup page
// migrators to migrate files page by page
Migrate.prototype.getFiles = function(container, next) {
  var migrators     = [],
      numFilePages  = 1,
      page          = 0,
      _this         = this;

  if (container.client.provider == "rackspace" && !this.options.testMode) {
    numFilePages = Math.floor(container.count / 10000);
    if (container.count % 10000 > 0) numFilePages++;
  }

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
        _this.migrateFiles(files.filter(_this.removeDirs), {page: page, totalPages: numFilePages}, done);
      })
    });
  };

  async.waterfall(migrators, function(err){
    if (err) return next(err);
    if (_this.failedFiles.length > 0) {
      console.log('Migrating failed files..');
      _this.migrateFiles(_this.failedFiles.filter(_this.removeDirs), {areFailures: true}, next);
    }
  });
}

// A method to filter out directory objects
Migrate.prototype.removeDirs = function(element, index, array) {
  return (element.contentType !== "application/directory");
}

// Migrate each file page
Migrate.prototype.migrateFiles = function(files, options, next) {

  var fileQueue, progress,
      areFailures   = options.areFailures,
      completed     = 0,
      _this         = this,
      totalFiles    = this.options.testSize || files.length,
      concurrency   = this.options.concurrency || 2,
      failed        = []
      showProgress  = (!areFailures || !_this.options.cli);

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
          if (areFailures) console.log('Processing failure: ' + file.name);
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
              if (areFailures) console.log('Downloaded failure: ' + file.name);
            }
          })
          .pipe(_this.toClient.upload(upConfig, function(err, uploadedFile){
            if (err) {
              _this.logOut('Error uploading: ' + file.name);
              _this.logOut(err);
              failed.push(file);
            } else {
              _this.logOut('Upload Complete: ' + file.name);
              if (areFailures) console.log('Uploading failure: ' + file.name);
            }
            done();
          }));
      }
    }

  }, concurrency);

  if (options.page && options.totalPages) {
    console.log('Starting migration (page %s of %s)...', options.page, options.totalPages);
  } else {
    console.log('Starting migration...');
  }

  if (_this.options.testMode){
    console.log('Running in TEST MODE (' + _this.options.testSize + ')');
  }

  if (showProgress) {
    progress = new ProgressBar('[:bar] :percent (:current/:total) :etas', {
      total: totalFiles,
      complete: '=',
      incomplete: ' ',
      width: 100
    });
  }

  files.every(function(file, index){
    if (_this.options.testMode && _this.options.testSize < index + 1) {
      return false;
    } else {
      fileQueue.push(file, function(err){
        if (err) return next(err);
        if (showProgress) progress.tick();
      });
      return true;
    }
  });

  fileQueue.drain = function(){
    console.log();
    if (_this.options.dryRun && !_this.whammy) {
      failed.push(files[12], files[34], files[19], files[99]);
      _this.whammy = true;
    }
    if (failed.length > 0) {
      console.log('The following files had errors (these will be reattempted at the end):');
      failed.forEach(function(file){
        _this.failedFiles.push(file);
        console.log(file.name);
      });
    }
    next(null, files[files.length - 1].name);
  }
}

Migrate.prototype.logOut = function(msg) {
  if (_this.options.cli && this.options.logFile) {
      fs.appendFile(this.options.logFile, msg + "\n");
  } else {
    console.log(msg)
  }
}

exports = module.exports = Migrate;