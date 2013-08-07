Cloud Storage Migrator
======================

Command Help
------------

```
$ ./migrate --help

  Usage: migrate [options]

  Options:

    -h, --help                       output usage information
    -V, --version                    output the version number
    -f, --from <provider>            FROM: provider (rackspace, amazon)
    -g --from-key-id <key>           FROM: provider's key ID
    -h --from-key <key>              FROM: provider's key
    -x --from-container <container>  FROM: container
    -t --to <provider>               TO: provider (rackspace, amazon)
    -y --to-key-id <key>             TO: provider's key ID
    -u --to-key <key>                TO: provider's key
    -c --to-container <container>    TO: container
    -a --to-acl <value>              TO: Amazon ACL canned permission value
    -p --to-protocol <value>         TO: the protocol to use for putting files. Options: http, https
    -m --concurrency <value>         Number of concurrent migration tasks
    -l --log-file <path>             path where log should be written
```