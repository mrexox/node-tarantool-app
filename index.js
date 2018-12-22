const Koa = require("koa");
const KoaRouter = require("koa-router");
const KoaBody = require("koa-body");
const KoaSession = require('koa-session');
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
const SESSION_CONFIG = {
    key: 'koa:sess', /** (string) cookie key (default is koa:sess) */
    /** (number || 'session') maxAge in ms (default is 1 days) */
    /** 'session' will result in a cookie that expires when session/browser is closed */
    /** Warning: If a session cookie is stolen, this cookie will never expire */
    maxAge: 86400000,
    autoCommit: true, /** (boolean) automatically commit headers (default true) */
    overwrite: true, /** (boolean) can overwrite or not (default true) */
    httpOnly: true, /** (boolean) httpOnly or not (default true) */
    signed: true, /** (boolean) signed or not (default true) */
    rolling: false, /** (boolean) Force a session identifier cookie to be set on every response. The expiration is reset to the original maxAge, resetting the expiration countdown. (default is false) */
    renew: false, /** (boolean) renew session when session is nearly expired, so we can always keep user logged in. (default is false)*/
};

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
    switch(status){
        case 'update_long':
            let token_long = updateLongToken(ctx);
            Tarantool.updateToken({
                login: login,
                token_long: token_long,
            });
            break;

        case 'update_short':
            let token_short = updateShortToken(ctx);
            Tarantool.updateToken({
                login: login,
                token_short: token_short,
            });
            break;

        case 'bad':
            ctx.redirect("/login");

        default:
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
	    })
	.catch(err => {
	    console.log('ERROR HAPPENED!' + "\n"+ err);
	    throw new Error(err)
	    return;
        });

    logok();
    ctx.redirect('/');
});

// Final setup
// -------------------------------------------------------------------
app
    .use(KoaBody())
    .use(KoaSession(SESSION_CONFIG, app))
    .use(router.routes())
    .use(router.allowedMethods());

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

async function registerUser(login, password) {
    let user = new Db.User({
	"login": login,
	"passhash": hash(password),
    });
    return await user.save();
}

function addTokens(ctx) {
    let [token_short, token_long] = genTokens();
    console.log(`Generated token ${token_short}, ${token_long}`);
    ctx.session.token_short =  token_short;
    ctx.session.token_long =  token_long;
    return [token_short, token_long];
}

function getTokens(ctx) {
    let token_short = ctx.session.token_short;
    let token_long = ctx.session.token_long;
    return [token_short, token_long];
}

function getLogin(ctx) {
    return ctx.session.login;
}

function updateLongToken(ctx) {
    let [_, token_long] = getTokens();
    ctx.session.token_long =  token_long;
    return token_long;

}

function updateShortToken(ctx) {
    let [token_short, _] = getTokens();
    ctx.session.token_short =  token_short
    return token_short;
}
