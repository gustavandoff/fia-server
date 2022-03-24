const express = require('express');
const { randomBytes } = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://gustav:h5Q4PBkJHVRG@cluster0.aljlo.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";

const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000'
    }
});

// Constants

const WAITING = 'WAITING';
const PLAYING = 'PLAYING';
const FINISHED = 'FINISHED';

// Functions

const getMongoConnection = async () => {
    return (await MongoClient.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverApi: ServerApiVersion.v1
    }));
}

const getToken = (req) => {
    const authorization = req?.headers?.authorization;

    if (!authorization) {
        return;
    }
    const tokens = authorization.split(' ');

    return tokens.length > 1 ? tokens[1] : undefined;
}

// Socket events

io.on('connection', (socket) => {
    console.log('User connected', socket.id);

    socket.on('joinGame', async (gameName) => {
        const dbConnection = await getMongoConnection();
        const db = dbConnection.db('fia');
        const thisGame = await db.collection('games').findOne({ gameName });
        dbConnection.close();

        socket.join(gameName);

        console.log(`User with ID: ${socket.id} joined game ${gameName}`);

        socket.emit('updateGame', thisGame); // skickar till mig själv
        socket.to(gameName).emit('updateGame', thisGame); // skickar till alla andra i spelet
    });

    socket.on('leaveGame', async ({ user, game }) => {
        const gameName = game.gameName;

        const dbConnection = await getMongoConnection();
        const db = dbConnection.db('fia');

        delete game.players[user.username];

        await db.collection('games').updateOne({ gameName }, { $set: { players: game.players } });

        //await db.collection('games').update({ gameName }, { $unset: { description: 1 } })
        //await db.collection('games').updateOne({ gameName }, { $unset: { players.(currentUser.username) } });
        //db.games.update({ gameName }, { "$unset": { "values.727920": "" } });
        //  
        dbConnection.close();
        socket.emit('updateGame', game); // skickar till mig själv
        socket.to(gameName).emit('updateGame', game); // skickar till alla andra i spelet
    });

    socket.on('startGame', async (data) => {
        const thisUser = data.user;
        const token = thisUser?.jwt;
        const thisGame = data.game;
        const players = thisGame.players;
        let dbConnection;

        if (!token) return;

        try {
            const payload = jwt.verify(
                token,
                'asdf'
            );
            dbConnection = await getMongoConnection();
            const db = dbConnection.db('fia');
            const exists = await db.collection('users').findOne({ jwt: token });

            if (!exists) {
                console.log('Spelet finns inte');
                return;
            }

            const game = await db.collection('games').findOne({ gameName: thisGame.gameName });
            if (game?.status !== WAITING) {
                console.log('Spelet har redan startat');
                return;
            }

            Object.keys(players).forEach((e, i) => {
                players[e].playerNumber = i + 1;
                const pieces = players[e].pieces;
                pieces[0].position = -players[e].playerNumber * 10 - 1;
                pieces[1].position = -players[e].playerNumber * 10 - 2;
                pieces[2].position = -players[e].playerNumber * 10 - 3;
                pieces[3].position = -players[e].playerNumber * 10 - 4;
            });

            console.log(players);

            await db.collection('games').updateOne({ gameName: thisGame.gameName }, { $set: { status: PLAYING, players } });
            const updatedGame = await db.collection('games').findOne({ gameName: thisGame.gameName });

            socket.emit('updateGame', updatedGame); // skickar till mig själv
            socket.to(thisGame.gameName).emit('updateGame', updatedGame); // skickar till alla andra i spelet
        } catch (err) {
            console.error('err:', err);
        } finally {
            dbConnection.close();
        }
    });

    socket.on('gameLobbyPickColor', async (data) => {
        const thisUser = data.user;
        const token = thisUser?.jwt;
        const thisGame = data.game;
        let dbConnection;


        if (!token) {
            return;
        }

        try {
            const payload = jwt.verify(
                token,
                'asdf'
            );
            dbConnection = await getMongoConnection();
            const db = dbConnection.db('fia');
            const exists = await db.collection('users').findOne({ jwt: token });

            if (!exists) {
                return;
            }

            const game = await db.collection('games').findOne({ gameName: thisGame.gameName });
            if (!game || game.status !== WAITING) {
                return;
            }

            thisGame.players[thisUser.username] = {
                username: thisUser.username,
                displayname: thisUser.displayname,
                playerNumber: null,
                color: data.color,
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
            const updatedGame = await db.collection('games').findOne({ gameName: thisGame.gameName });
            console.log('pickColor socket1:', socket.id);
            console.log('thisGame.gameName:', thisGame.gameName);

            socket.emit('updateGame', updatedGame); // skickar till mig själv
            socket.to(thisGame.gameName).emit('updateGame', updatedGame); // skickar till alla andra i spelet

            console.log('pickColor socket2:', socket.id);
        } catch (err) {
            console.error('err:', err);
        } finally {
            dbConnection.close();
        }
    })

    socket.on('disconnect', () => {
        console.log('User disconnected', socket.id);
    });
});

// Routes

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const thisUser = await db.collection('users').findOne({ username });

    if (!thisUser) {
        dbConnection.close();
        return res.status(400).send({ jwt: undefined, message: 'Ditt användarnamn eller lösenord är felaktigt' });
    }

    if (thisUser.password !== password) {
        dbConnection.close();
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

    dbConnection.close();
    res.status(200).send({ currentUser: result });
});

app.get('/currentuser', async (req, res) => {
    const token = getToken(req);
    let dbConnection;

    if (!token) {
        return res.status(401).send({ jwt: undefined });
    }

    try {
        const payload = jwt.verify(
            token,
            'asdf'
        );
        dbConnection = await getMongoConnection();
        const db = dbConnection.db('fia');
        const exists = await db.collection('users').findOne({ jwt: token });
        //const exists = Object.values(users).find(u => u.jwt === token);
        if (!exists) {
            return res.status(401).send({ currentUser: undefined });
        }
        res.send({ currentUser: payload });
    } catch (err) {
        console.error('err:', err);
        return res.status(401).send({ currentUser: undefined });
    } finally {
        dbConnection.close();
    }
});

app.post('/logout', async (req, res) => {
    const token = getToken(req);
    if (!token) {
        return res.status(401).send();
    }

    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const currentUser = await db.collection('users').findOne({ jwt: token });

    await db.collection('users').updateOne({ username: currentUser.username }, { $set: { jwt: null } });

    dbConnection.close();
    res.status(200).send();
});

app.get('/users', async (req, res) => {
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const users = await db.collection('users').find({}).toArray();
    const result = {};

    users.forEach(element => {
        result[element.username] = element;
    });

    dbConnection.close();
    res.status(200).send(result);
});

app.get('/users/:username', async (req, res) => {
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const users = await db.collection('users').find({}).toArray();
    const result = {};

    users.forEach(element => {
        result[element.username] = element;
    });

    dbConnection.close();
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

    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const thisUser = await db.collection('users').findOne({ username });

    if (thisUser) {
        res.status(400).send('Användarnamnet finns redan');
        dbConnection.close();
        return;
    }

    const userJwt = jwt.sign({ username, displayname }, 'asdf');

    await db.collection('users').insertOne({ username, displayname, password, jwt: userJwt });

    const result = {
        username,
        displayname,
        jwt: userJwt
    };

    dbConnection.close();
    res.status(200).send({ currentUser: result });
});

app.post('/joingame', async (req, res) => {
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const thisGame = await db.collection('games').findOne({ gameName: req.body.gameName });
    const thisUser = await db.collection('users').findOne({ username: req.body.username });

    if (!thisGame) {
        dbConnection.close();
        return res.status(400).send('Spelet finns inte');
    }

    if (thisGame.players.length === thisGame.maxPlayers) {
        dbConnection.close();
        return res.status(400).send('Max antal spelare redan uppnått');
    }

    if (thisGame.players.length > 0 && thisGame.players[req.body.username]) {
        dbConnection.close();
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

    dbConnection.close();
    res.status(200).send('Du är med i spelet');
});

app.get('/games/:gameName', async (req, res) => {
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const game = await db.collection('games').findOne({ gameName: req.params.gameName });

    dbConnection.close();
    if (!game) {
        return res.status(400).send('Spelet finns inte');
    }

    res.status(200).send(game);
});

app.get('/games', async (req, res) => {
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const games = await db.collection('games').find({}).toArray();
    const result = {};

    games.forEach(element => {
        result[element.gameName] = element;
    });

    dbConnection.close();
    res.send(200, result);
});

app.post('/games', async (req, res) => {
    const { gameName, maxPlayers } = req.body;

    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const thisGame = await db.collection('games').findOne({ gameName });

    if (thisGame) {
        dbConnection.close();
        return res.status(400).send('Spel med samma namn finns redan');
    }

    await db.collection('games').insertOne({ gameName, maxPlayers, players: {}, status: WAITING });

    const result = { gameName, maxPlayers, players: {}, status: WAITING };

    dbConnection.close();
    res.status(201).send(result);
});

app.get('/dice', (req, res) => {
    const d = Math.floor(Math.random() * 6) + 1;
    res.send(200, d);
});

//app.listen(4000, () => {
//    console.log('Listening on 4000');
//});

server.listen(4000, () => {
    console.log('Listening on 4000');
});