#!/usr/bin/env node

var downloader, cli,
    _           = require('lodash')
    Downloader  = require('./lib/Downloader'),
    fs          = require('fs'),
    cli         = require('commander'),
    optimist    = require('optimist'),
    configFile  = 'config.json';

cli = optimist.argv;

fs.exists(configFile, function(exists){
  if (exists) {
    fs.readFile(configFile, function (err, data) {
      if (err) throw err;
      var config = JSON.parse(data);
      downloader = new Downloader(config);

      switch (cli._[0]) {
        case 'start':
          downloader.start(done);
          break;
        case 'resume':
          downloader.resume(done);
          break;
      }

      function done(err) {
        if (err) throw err;
        console.log('Done!');
      }

    });
  } else {
    console.log('You must have a config.json file present.');
  }
})
