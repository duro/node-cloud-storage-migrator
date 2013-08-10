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

// cli
//   .version('0.0.1')
//   .option('-f, --from <provider>', 'FROM: provider (rackspace, amazon)', String)
//   .option('-g --from-key-id <key>', 'FROM: provider\'s key ID', String)
//   .option('-h --from-key <key>', 'FROM: provider\'s key', String)
//   .option('-x --from-container <container>', 'FROM: container', String)
//   .option('-t --to <provider>', 'TO: provider (rackspace, amazon)', String)
//   .option('-y --to-key-id <key>', 'TO: provider\'s key ID', String)
//   .option('-u --to-key <key>', 'TO: provider\'s key', String)
//   .option('-c --to-container <container>', 'TO: container', String)
//   .option('-a --to-acl <value>', 'TO: Amazon ACL canned permission value', String, 'private')
//   .option('-p --to-protocol <value>', 'TO: the protocol to use for putting files. Options: http, https', String, 'http')
//   .option('-m --concurrency <value>', 'Number of concurrent migration tasks', Number, 2)
//   .option('-l --log-file <path>', 'path where log should be written', String)
//   .option('-d --dry-run', 'do a dry run without downloading or uploading anything');
//
// cli
//   .command('run')
//   .description('Perform a complete migration')
//   .action(function(){
//     var migrator;
//     init();
//     migrator = new Migrate(fromClient, toClient, {
//       concurrency: cli.concurrency,
//       logFile: cli.logFile,
//       dryRun: cli.dryRun
//     });
//     migrator.migrate(function(err){
//       if (err) return console.log(err);
//       console.log("Done!");
//     });
//   });
//
// cli
//   .command('test [count]')
//   .description('Run migration in test mode and only download a specific number of files')
//   .action(function(count){
//     var migrator;
//     init();
//     migrator = new Migrate(fromClient, toClient, {
//       concurrency: cli.concurrency,
//       logFile: cli.logFile,
//       testMode: true,
//       testSize: count,
//       dryRun: cli.dryRun
//     });
//     migrator.migrate(function(err){
//       if (err) return console.log(err);
//       console.log("Done!");
//     });
//   });
//
// cli
//   .command('get-from-container')
//   .description('Retrieves the container from the source cloud storage')
//   .action(function(){
//     init();
//     fromClient.getContainer(cli.fromContainer, function(err, container){
//       if (err) return console.log(err);
//       console.log(container);
//     });
//   });
//
// cli.parse(process.argv);
