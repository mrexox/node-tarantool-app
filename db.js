const Mongoose = require("mongoose");
const Config = require("./config.json");

Mongoose.Promise = global.Promise;
Mongoose.connect(process.env.MONGODB_URI || Config.connectionString);

const Connection = Mongoose.connection;

const UserSchema =  new Mongoose.Schema({
    login: String,
    passhash: String,
});

UserSchema.set('toJSON', { virtuals: true });

module.exports = {
  "connection": Connection,
  "User": Connection.model('Users', UserSchema),
};
