const express = require('express');
const { randomBytes } = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://gustav:h5Q4PBkJHVRG@cluster0.aljlo.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";

const http = require('http');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(bodyParser.json());

const socketUtils = require("./utils/socketUtils");

const server = http.createServer(app);
const io = socketUtils.sio(server);
socketUtils.connection(io);

const socketIOMiddleware = (req, res, next) => {
    req.io = io;

    next();
};


const WAITING = 'WAITING';
const PLAYING = 'PLAYING';
const FINISHED = 'FINISHED';

const getDb = async () => {
    return (await MongoClient.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverApi: ServerApiVersion.v1
    })).db('fia');
}

app.use("/api/v1/hello", socketIOMiddleware, (req, res) => {
    req.io.emit("message", `Hello, ${req.originalUrl}`);
    res.send("hello world!");
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const db = await getDb();
    const thisUser = await db.collection('users').findOne({ username });

    if (!thisUser) {
        return res.status(400).send({ jwt: undefined, message: 'Ditt användarnamn eller lösenord är felaktigt' });
    }

    if (thisUser.password !== password) {
        return res.status(400).send({ jwt: undefined, message: 'Ditt användarnamn eller lösenord är felaktigt' });
    }

    const userJwt = jwt.sign({
        username: thisUser.username,
        displayname: thisUser.displayname
    }, 'asdf');

    await db.collection('users').updateOne({ username }, { $set: { jwt: userJwt } });

    const result = {
        username: thisUser.username,
        displayname: thisUser.displayname,
        jwt: userJwt
    };

    res.status(200).send({ currentUser: result });
});

app.get('/currentuser', async (req, res) => {
    const token = getToken(req);

    if (!token) {
        return res.status(401).send({ jwt: undefined });
    }

    try {
        const payload = jwt.verify(
            token,
            'asdf'
        );
        const db = await getDb();
        const exists = await db.collection('users').findOne({ jwt: token });
        //const exists = Object.values(users).find(u => u.jwt === token);
        if (!exists) {
            return res.status(401).send({ currentUser: undefined });
        }
        res.send({ currentUser: payload });
    } catch (err) {
        console.error('err:', err);
        return res.status(401).send({ currentUser: undefined });
    }
});

app.post('/logout', async (req, res) => {
    const token = getToken(req);
    if (!token) {
        return res.status(401).send();
    }

    const db = await getDb();
    const currentUser = await db.collection('users').findOne({ jwt: token });

    await db.collection('users').updateOne({ username: currentUser.username }, { $set: { jwt: null } });

    res.status(200).send();
});

app.get('/users', async (req, res) => {
    const db = await getDb();
    const users = await db.collection('users').find({}).toArray();
    const result = {};

    users.forEach(element => {
        result[element.username] = element;
    });

    res.status(200).send(result);
});

app.get('/users/:username', async (req, res) => {
    const db = await getDb();
    const users = await db.collection('users').find({}).toArray();
    const result = {};

    users.forEach(element => {
        result[element.username] = element;
    });

    res.status(200).send(result[req.params.username]);
});

app.post('/signup', async (req, res) => {
    const { username, displayname, password, confPassword } = req.body;

    if (!username || !displayname || !password || !confPassword) {
        res.status(400).send('Vänligen fyll i alla fält');
        return;
    }

    if (password !== confPassword) {
        res.status(400).send('Lösenorden matcher inte');
        return;
    }

    const db = await getDb();
    const thisUser = await db.collection('users').findOne({ username });

    if (thisUser) {
        res.status(400).send('Användarnamnet finns redan');
        return;
    }

    const userJwt = jwt.sign({ username, displayname }, 'asdf');

    await db.collection('users').insertOne({ username, displayname, password, jwt: userJwt });

    const result = {
        username,
        displayname,
        jwt: userJwt
    };

    res.status(200).send({ currentUser: result });
});

app.post('/joingame', async (req, res) => {
    const db = await getDb();
    const thisGame = await db.collection('games').findOne({ gameName: req.body.gameName });
    const thisUser = await db.collection('users').findOne({ username: req.body.username });

    if (!thisGame) {
        return res.status(400).send('Spelet finns inte');
    }

    if (thisGame.players.length === thisGame.maxPlayers) {
        return res.status(400).send('Max antal spelare redan uppnått');
    }

    if (thisGame.players.length > 0 && thisGame.players[req.body.username]) {
        return res.status(400).send('Du är redan med i spelet');
    }

    thisGame.players[thisUser.username] = {
        username: thisUser.username,
        displayname: thisUser.displayname,
        playerNumber: null,
        color: null,
        pieces: [
            {
                number: 0,
                position: null,
            },
            {
                number: 1,
                position: null,
            },
            {
                number: 2,
                position: null,
            },
            {
                number: 3,
                position: null,
            },
        ]
    };

    await db.collection('games').updateOne({ gameName: thisGame.gameName }, { $set: { players: thisGame.players } });

    res.status(200).send('Du är med i spelet');
});

app.get('/games/:gameName', async (req, res) => {
    const db = await getDb();
    const game = await db.collection('games').findOne({ gameName: req.params.gameName });

    if (!game) {
        return res.status(400).send('Spelet finns inte');
    }

    res.send(200, game);
});

app.get('/games', async (req, res) => {
    const db = await getDb();
    const games = await db.collection('games').find({}).toArray();
    const result = {};

    games.forEach(element => {
        result[element.gameName] = element;
    });

    res.send(200, result);
});

app.post('/games', async (req, res) => {
    const { gameName, maxPlayers } = req.body;

    const db = await getDb();
    const thisGame = await db.collection('games').findOne({ gameName });

    if (thisGame) {
        return res.status(400).send('Spel med samma namn finns redan');
    }

    await db.collection('games').insertOne({ gameName, maxPlayers, players: {}, status: WAITING });

    const result = { gameName, maxPlayers, players: {}, status: WAITING };

    res.status(201).send(result);
});

app.get('/dice', (req, res) => {
    const d = Math.floor(Math.random() * 6) + 1;
    res.send(200, d);
});

const getToken = (req) => {
    const authorization = req?.headers?.authorization;

    if (!authorization) {
        return;
    }
    const tokens = authorization.split(' ');

    return tokens.length > 1 ? tokens[1] : undefined;
}

app.listen(4000, () => {
    console.log('Listening on 4000');
});