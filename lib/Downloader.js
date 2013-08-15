var path      = require('path'),
    fs        = require('fs'),
    async     = require('async'),
    mongoose  = require('mongoose'),
    Schema    = mongoose.Schema;

var File = mongoose.model('File', new Schema({
  name:  {type: String, index: true},
  contentType: String,
  lastModified:   Date,
  container: String,
  bytes: Number,
  size: Number,
  downloaded: {type: Boolean, default: false}
}));

var Downloader = function(config) {
  this.filesFetched   = false;
  this.config         = config;
  this.marker         = null;
  this.page           = 0;

  this.fromClient = require('pkgcloud').storage.createClient({
    provider: this.config.from.provider,
    username: this.config.from.keyId,
    apiKey: this.config.from.key
  });

  mongoose.connect('mongodb://localhost/migrator');

  if (this.config.options.logFile) {
    if (this.config.options.logFile.charAt(0) !== '/' && this.config.options.logFile.charAt(0) !== '~') {
      this.config.options.logFile = path.join(__dirname, '../', this.config.options.logFile);
    }
  }
}

Downloader.prototype.start = function(done) {
  async.series([
    ensureDownloadDestination.bind(this),
    getFiles.bind(this),
    fetchFilesFromDB.bind(this)
  ], done);
}

Downloader.prototype.resume = function(done) {
  async.series([
    ensureDownloadDestination.bind(this),
    fetchFilesFromDB.bind(this)
  ], done);
}

Downloader.prototype.allFilesFetched = function() {
  return this.filesFetched;
}

Downloader.prototype.out = function(msg) {
  if (this.config.options.cli && this.config.options.logFile) {
      fs.appendFile(this.config.options.logFile, msg + "\n");
  } else {
    console.log(msg);
  }
}

function ensureDownloadDestination(done) {
  var dirToCreate = path.join(__dirname, '../', this.config.from.saveTo);

  if (this.config.from.prefix) {
    dirToCreate = path.join(dirToCreate, this.config.from.prefix);
  }

  fs.exists(dirToCreate, function(exists){
    if (!exists) {
      fs.mkdir(dirToCreate, done);
    } else {
      done();
    }
  });
}

function getFiles(done) {
  async.until(
    this.allFilesFetched.bind(this),
    fetchFilesFromCloud.bind(this),
    done
  );
}

function fetchFilesFromCloud(done) {
  var _this   = this,
      timeout = 60000,
      retries = 3,
      options = {
        marker: this.marker,
        prefix: this.config.from.prefix
      };

  this.fromClient.getFiles(this.config.from.container, options, function(err, files){
    if (err) return done(err);
    if (files.length > 0) {
      async.each(files, saveFileToDB, function(err){
        if (err) return done(err);
        _this.marker = files[files.length - 1]['name'];
        done();
      });
    } else {
      _this.filesFetched = true;
      done();
    }
  })
}

function saveFileToDB(file, done) {
  File.findOneAndUpdate({name: file.name}, file, {upsert: true}, done);
}

function fetchFilesFromDB(done) {
  var _this = this;
  File.find()
    .sort({name: 'asc'})
    .limit(1000)
    .exec(function(err, files){
      if (err) return done(err);
      async.eachSeries(files, processModelFromDB.bind(_this), done);
    });
}

function processModelFromDB(fileModel, done) {
  if (fileModel.get('contentType') == "application/directory") {
    processDirectory.apply(this, [fileModel, done]);
  } else {
    processFile.apply(this, [fileModel, done]);
  }
}

function processFile(fileModel, done) {
  var _this       = this,
      dlConfig    = {
        container: this.config.from.container,
        remote: fileModel.get('name'),
        local: path.join(__dirname, '../', this.config.from.saveTo, fileModel.get('name'))
      }

  this.out('Downloading File: ' + dlConfig.remote);
  this.fromClient.download(dlConfig, function(err) {
    if (err) return done(err);
    _this.out('File Saved: ' + dlConfig.local);
    done();
  });
}

function processDirectory(fileModel, done) {
  var _this       = this,
      dirToCreate = path.join(__dirname, '../', this.config.from.saveTo, fileModel.get('name'));

  fs.exists(dirToCreate, function(exists){
    if (!exists) {
      fs.mkdir(dirToCreate, function(err){
        if (err) return done(err);
        _this.out('Creating Directory: ' + dirToCreate);
        done();
      });
    } else {
      done();
    }
  });
}

exports = module.exports = Downloader;