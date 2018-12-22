# node-tarantool-app
An example of using tarantool DB for caching user authentication tokens.
For more information about Tarantool and NodeJS see https://github.com/tarantool/node-tarantool-drive.


## Application architecture

##### /register
To register a new user (`login` and `password` needed).

##### /login
To login with `login` and `password`.

##### /
Actually the home page, that can be reached only by logged in users.

## Dependencies

* *Docker* and ability to start it without `sudo`.
* *Mongodb*, the configurations can be found in `db.js` file.
