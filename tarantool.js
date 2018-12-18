const Tarantool = require("tarantool-driver");

const Connection = new Tarantool({
    host: "127.0.0.1",
    port: 3301,
});

// Creating and configuring Tarantool space
Connection.eval("\
    sp = box.schema.space.create('users');\
    sp:format({\
        {name = 'login', type = 'string'},\
        {name = 'token_short', type = 'string'},\
        {name = 'token_short_expdate', type = 'string'},\
        {name = 'token_long', type = 'string'},\
        {name = 'token_long_expdate', type = 'string'},\
    });\
    sp:create_index('primary', {\
        type = 'hash',\
        parts = {1, 'str'}\
    });\
").then(() => {console.log('Taratool space created')})
  .catch((e) => {
    console.log(e);
    process.exit(1);
});


async function checkTokens(tuple) {
    let [login, token_short, token_long] = tuple;

    if (!login || !token_short || !token_long) { return 'bad'; }


    let checkToken = function(row) {
        let now = new Date();
        let res = 'bad';

        if (token_long == row.token_long &&
            token_short == row.token_short) {

            res = 'fine';

        } else if (token_long == row.token_long &&
                   row.token_long_expdate < now) {

             res = 'update_long';

        } else if (token_short == row.token_short &&
                   row.token_short_expdate < now) {

            res = 'update_short';

        }
        return res;
    };

    // Select 1 tuple without any offset (0)
    return await Connection.select("users", "primary", 1, 0, 'eq', [login])
        .then(checkToken);
}

// Inserts a new token into tarantool
async function saveTokens(params) {
    let token_short         = params.token_short;
    let token_long          = params.token_long;
    let login               = params.login;
    let now                 = new Date();
    let token_long_expdate  = now.setDate(now.getDate() + 30);
    let token_short_expdate = now.setDate(now.getDate() + 1);

    return await Connection.insert("users", [
        login, token_short, token_short_expdate, token_long, token_long_expdate
    ]);
}

// Updates a given token in tarantool
async function updateToken(params) {
    let token_short         = params.token_short;
    let token_long          = params.token_long;
    let login               = params.login;
    let now                 = new Date();
    let update_field;
    let value;

    if (token_short) {
        update_field = 3; // update token_short_expdate (1-based)
        value = now.setDate(now.getDate() + 1);
    } else if (token_long) {
        update_field = 5; // Update token_long_expdate
        value = now.setDate(now.getDate() + 30);
    } else {
        throw new Error("Need params[token_long] or params[token_short]");
    }

    // Updates where 0-th tuple element equals login
    return await Connection.update("users", 0, login, [
        '=', update_field, value
    ]);
}

module.exports = {
    // Tarantool connection module
    "connection" : Connection,
    // Helper functions
    "checkTokens": checkTokens,
    "updateToken": updateToken,
    "saveTokens" : saveTokens,
};
