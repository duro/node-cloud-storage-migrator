#!/usr/bin/env node

var fromClient,
    Migrate     = require('./lib/Migrate'),
    async       = require('async'),
    fs          = require('fs'),
    cli         = require('commander'),
    configFile  = 'config.json',
    init = function(config) {

      fromClient = require('pkgcloud').storage.createClient({
        provider: config.from.provider,
        username: config.from.keyId,
        apiKey: config.from.key,
        container: config.from.container,
        saveTo: config.from.saveTo
      });

    };

fs.exists(configFile, function(exists){
  if (exists) {
    fs.readFile(configFile, function (err, data) {
      if (err) throw err;
      var config = JSON.parse(data);
      init(config);
      migrator = new Migrate(fromClient, {
        concurrency: config.options.concurrency,
        logFile: config.options.logFile,
        dryRun: config.options.dryRun
      });
      migrator.download(function(err){
        if (err) return console.log(err);
        console.log("Done!");
      });
    });
  } else {
    console.log('You must have a config.json file present.')
  }
})
