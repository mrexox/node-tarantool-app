const Koa = require("koa");
const KoaRouter = require("koa-router");
const KoaBody = require("koa-body");
const Handlebars = require("handlebars");
const Crypto = require("crypto");
const Db = require("./db");
const Tarantool = require("./tarantool");
Tarantool.connection.ping().then(res => {
    console.log(`NOTICE: Connected to Tarantool:${res}`);
});
const fs = require("fs");

const app = new Koa();
const router = new KoaRouter();

// Setups
// -------------------------------------------------------------------
app.keys = ["secret1", "2key"];

// Routes
// -------------------------------------------------------------------

router.get("/", (ctx, next) => {
    logrender("/");
    let login = getLogin(ctx);
    let [token_short, token_long] = getTokens(ctx);
    if (!token_short || !token_long) {
        ctx.redirect("/login");
        console.log("redirecting to /login");
        logok();
        return;
    }

    let status = Tarantool.checkTokens([login, token_short, token_long]);

    if (status === 'update_long') {
    let token_long = updateLongToken(ctx);
    Tarantool.updateToken({
        login: login,
        token_long: token_long,
    });
    } else if (status == 'update_short') {
    let token_short = updateShortToken(ctx);
    Tarantool.updateToken({
        login: login,
        token_short: token_short,
    });
    } else if (staus === 'bad') {
    ctx.redirect("/login");
    } else { /* fine */
    ctx.body = processTemplate("views/index.hbs", {
        text: "Welcome on page",
        user: login || "Anonymous67",
    });
    }
    logok();
});

router.get("/login", (ctx, next) => {
    logrender("/login");
    ctx.body = processTemplate("views/login.hbs");
    logok();
});

router.post("/login", async (ctx, next) => {
    logpost("/login");

    let login = getLogin(ctx);
    let [token_short, token_long] = getTokens(ctx);
    let status = await Tarantool.checkTokens([login, token_short, token_long]);

    if (status !== 'bad') {
        ctx.redirect("/");
        console.log(`Status: ${status}. Tokens are fine, redirecting to '/'`);
        logok();
        return;
    }

    let user = await findUser(ctx.request.body.login);
    if (user && user.passhash == hash(ctx.request.body.password)) {
        console.log("Authentication succeed");
        let insert_res = Tarantool.saveTokens({
            token_short: token_short,
            token_long: token_long,
            login: user.login,
        });
        console.log(insert_res);
        ctx.redirect("/");
    } else {
        ctx.body = "Login failed. Return and repeat!";
    }

    logok();
});

router.get("/register", (ctx, next) => {
    logrender("/register");
    ctx.body = processTemplate("views/register.hbs");
    logok();
});

router.post("/register", (ctx, next) => {
    logpost("/register");
    console.log(ctx.request.body);
    registerUser(ctx.request.body.login, ctx.request.body.password)
    .then(
        login => {
        let [token_short, token_long] = addTokens(ctx);
        Tarantool.saveTokens({
            login: login,
            token_short: token_short,
            token_long: token_long,
        });
        },
        err => {
        console.err('ERROR HAPPENED!');
        return;
        });
    logok();
    ctx.redirect('/');
});

// Final setup
// -------------------------------------------------------------------
app
    .use(KoaBody())
    .use(router.routes())
    .use(router.allowedMethods())

app.listen(3000);

// Helpers
// -------------------------------------------------------------------

function processTemplate(file, params) {
    let source = fs.readFileSync(file, "utf8");
    let template = Handlebars.compile(source);
    return template(params);
}

function logrender(route) {
    console.log(`------\nRendering "${route}"`);
}

function logpost(route) {
    console.log(`------\nPost Request on "${route}"`);
}

function logok() {
    console.log("> OK\n------\n");
}

function loginsert(login) {
    console.log(`Iserted user ${login}`);
}

function genTokens() {
    let short = Math.random().toString(36).replace(/[^a-z]+/g, '');
    let long  = Math.random().toString(36).replace(/[^a-z]+/g, '');
    return [short, long];
}

function hash(word) {
    return Crypto.createHash('md5').update(word).digest('hex');
}

async function findUser(login) {
    const user = await Db.User.findOne({login: login});
    if (user) {
    return {
        login: user.login,
        passhash: user.passhash
    };
    } else {
    return undefined;
    }
}

function registerUser(login, password) {
    let user = new Db.User({
    "login": login,
    "passhash": hash(password),
    });
    return user.save(function(err, user) {
    if (err) {
        console.err(err);
        reject(new Error(err));
    } else {
        loginsert(user);
        resolve(login);
    }
    });
}

function addTokens(ctx) {
    let [token_short, token_long] = genTokens();
    console.log(`Generated token ${token_short}, ${token_long}`);
    ctx.cookies.set("token_short", token_short, { signed: true });
    ctx.cookies.set("token_long", token_long, { signed: true });
    return [token_short, token_long];
}

function getTokens(ctx) {
    let token_short = ctx.cookies.get("token_short", { signed: true });
    let token_long = ctx.cookies.get("token_long", { signed: true });
    return [token_short, token_long];
}

function getLogin(ctx) {
    return ctx.cookies.get("login", { signed: true });
}

function updateLongToken(ctx) {
    let [_, token_long] = getTokens();
    ctx.cookies.set("token_long", token_long, { signed: true });
    return token_long;

}

function updateShortToken(ctx) {
    let [token_short, _] = getTokens();
    ctx.cookies.set("token_short", token_short, { signed: true });
    return token_short;
}
