#!/usr/bin/env node

var fromClient, toClient,
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
        container: config.from.container
      });

      toClient = require('pkgcloud').storage.createClient({
        provider: config.to.provider,
        keyId: config.to.keyId,
        key: config.to.key,
        container: config.to.container,
        acl: config.to.options.acl,
        protocol: config.to.options.protocol + '://'
      });

    };

fs.exists(configFile, function(exists){
  if (exists) {
    fs.readFile(configFile, function (err, data) {
      if (err) throw err;
      var config = JSON.parse(data);
      init(config);
      migrator = new Migrate(fromClient, toClient, {
        concurrency: config.options.concurrency,
        logFile: config.options.logFile,
        dryRun: config.options.dryRun
      });
      migrator.migrate(function(err){
        if (err) return console.log(err);
        console.log("Done!");
      });
    });
  } else {
    console.log('You must have a config.json file present.')
  }
})
