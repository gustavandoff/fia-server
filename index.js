const express = require('express');
const bcrypt = require("bcrypt");
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = "mongodb+srv://gustav:h5Q4PBkJHVRG@cluster0.aljlo.mongodb.net/myFirstDatabase?retryWrites=true&w=majority"; // this is no longer an active mongodb cluster

const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: `http://localhost:3000`
    }
});

// Constants

const WAITING = 'WAITING';
const PLAYING = 'PLAYING';
const FINISHED = 'FINISHED';

// Functions

const getMongoConnection = async () => { // etablerar kontakt med databas
    return (await MongoClient.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverApi: ServerApiVersion.v1
    }));
}

const getToken = (req) => { // hämtar jwt från request
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

        dbConnection.close();
        socket.emit('updateGame', game); // skickar till mig själv
        socket.to(gameName).emit('updateGame', game); // skickar till alla andra i spelet
    });

    socket.on('toggleReady', async (data) => { // när en spelare blir redo/inte redo
        const thisUser = data.user;
        const token = thisUser?.jwt;
        const thisGame = data.game;
        let dbConnection;

        if (!thisUser.username.startsWith('gäst') && !token) {
            return;
        }

        try {
            if (!thisUser.username.startsWith('gäst')) {
                const payload = jwt.verify(
                    token,
                    'asdf'
                );
            }

            dbConnection = await getMongoConnection();
            const db = dbConnection.db('fia');

            let dbThisUser;
            if (thisUser.username.startsWith('gäst')) {
                dbThisUser = await db.collection('users').findOne({ username: thisUser.username });
            } else {
                dbThisUser = await db.collection('users').findOne({ jwt: token });
                if (!dbThisUser) {
                    return;
                }
            }

            const game = await db.collection('games').findOne({ gameName: thisGame.gameName });
            if (!game || game.status !== WAITING) {
                return;
            }

            thisGame.players[thisUser.username].ready = !thisGame.players[thisUser.username].ready;

            await db.collection('games').updateOne({ gameName: thisGame.gameName }, { $set: { players: thisGame.players } });
            const updatedGame = await db.collection('games').findOne({ gameName: thisGame.gameName });

            socket.emit('updateGame', updatedGame); // skickar till mig själv
            socket.to(thisGame.gameName).emit('updateGame', updatedGame); // skickar till alla andra i spelet
        } catch (err) {
            console.error('err:', err);
        } finally {
            dbConnection.close();
        }
    });

    socket.on('startGame', async (data) => {
        const thisUser = data.user;
        const token = thisUser?.jwt;
        const thisGame = data.game;
        const players = thisGame.players;
        let dbConnection;

        if (!thisUser.username.startsWith('gäst') && !token) {
            return;
        }

        try {
            if (!thisUser.username.startsWith('gäst')) {
                const payload = jwt.verify(
                    token,
                    'asdf'
                );
            }

            dbConnection = await getMongoConnection();
            const db = dbConnection.db('fia');

            let dbThisUser;
            if (thisUser.username.startsWith('gäst')) {
                dbThisUser = await db.collection('users').findOne({ username: thisUser.username });
            } else {
                dbThisUser = await db.collection('users').findOne({ jwt: token });
                if (!dbThisUser) {
                    return;
                }
            }

            const game = await db.collection('games').findOne({ gameName: thisGame.gameName });
            if (game?.status !== WAITING) {
                console.log('Spelet har redan startat');
                return;
            }

            Object.keys(players).forEach((e, i) => {
                if (Object.keys(players).length < 4 && i > 0) {
                    i++;
                }
                players[e].playerNumber = i + 1;
                const pieces = players[e].pieces;
                pieces[0].position = -players[e].playerNumber * 10 - 1;
                pieces[1].position = -players[e].playerNumber * 10 - 2;
                pieces[2].position = -players[e].playerNumber * 10 - 3;
                pieces[3].position = -players[e].playerNumber * 10 - 4;
            });

            await db.collection('games').updateOne({ gameName: thisGame.gameName }, { $set: { status: PLAYING, players, turn: Object.keys(players)[0] } });
            const updatedGame = await db.collection('games').findOne({ gameName: thisGame.gameName });

            socket.emit('updateGame', updatedGame); // skickar till mig själv
            socket.to(thisGame.gameName).emit('updateGame', updatedGame); // skickar till alla andra i spelet
        } catch (err) {
            console.error('err:', err);
        } finally {
            dbConnection.close();
        }
    });

    socket.on('gameLobbyPickColor', async (data) => { // när en spelare väljer en färg i spellobbyn
        const thisUser = data.user;
        const token = thisUser?.jwt;
        const thisGame = data.game;
        let dbConnection;
        console.log('gameLobbyPickColor thisUser.username:', thisUser.username);
        console.log('gameLobbyPickColor thisGame.gameName:', thisGame.gameName);
        if (!thisUser.username.startsWith('gäst') && !token) {
            return;
        }

        try {
            if (!thisUser.username.startsWith('gäst')) {
                const payload = jwt.verify(
                    token,
                    'asdf'
                );
            }

            dbConnection = await getMongoConnection();
            const db = dbConnection.db('fia');

            let dbThisUser;
            if (thisUser.username.startsWith('gäst')) {
                dbThisUser = await db.collection('users').findOne({ username: thisUser.username });
            } else {
                dbThisUser = await db.collection('users').findOne({ jwt: token });
                if (!dbThisUser) {
                    return;
                }
            }

            const game = await db.collection('games').findOne({ gameName: thisGame.gameName });
            if (!game || game.status !== WAITING) {
                return;
            }

            thisGame.players[thisUser.username] = {
                username: thisUser.username,
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

            socket.emit('updateGame', updatedGame); // skickar till mig själv
            socket.to(thisGame.gameName).emit('updateGame', updatedGame); // skickar till alla andra i spelet
        } catch (err) {
            console.error('err:', err);
        } finally {
            dbConnection.close();
        }
    });

    socket.on('updateGameBoard', async ({ game, user, players, nextTurn }) => { // uppdaterar spelet för alla spelare
        const gameName = game.gameName;

        const dbConnection = await getMongoConnection();
        const db = dbConnection.db('fia');
        const dbGame = await db.collection('games').findOne({ gameName });

        console.log('game sequence: ', game.sequence);
        console.log('dbGame sequence: ', dbGame.sequence);

        if (game.sequence !== dbGame.sequence) {
            console.error('Sequence unsynced');
            return;
        }

        const calcNextTurn = (turn) => {
            for (let i = 0; i < Object.keys(players).length; i++) {
                const player = players[Object.keys(players)[i]]
                if (turn === player.username) {
                    if (i + 1 === Object.keys(players).length) {
                        return turn = Object.keys(players)[0];
                    } else {
                        return turn = Object.keys(players)[i + 1];
                    }
                }
            }
        }

        let turn = dbGame.turn;
        let sequence = dbGame.sequence;
        let diceRoll = dbGame.diceRoll;

        if (nextTurn) {
            do {
                console.log('Just played: ', turn);
                turn = calcNextTurn(turn);
                console.log('New turn: ', turn);
            } while (!dbGame.players[turn].pieces.find(p => p.position)); // om en spelare inte har några pjäser kvar på brädet ska det inte bli dess tur
            diceRoll = null;
            sequence++;
        }

        await db.collection('games').updateOne({ gameName }, { $set: { players, turn, diceRoll, sequence } });
        const updatedGame = await db.collection('games').findOne({ gameName });

        dbConnection.close();

        socket.emit('updateGame', updatedGame); // skickar till mig själv
        socket.to(gameName).emit('updateGame', updatedGame); // skickar till alla andra i spelet
    });

    socket.on('updateGameDiceRoll', async ({ game, newDiceRoll }) => { // uppdaterar tärningskastet för alla spelare
        const gameName = game.gameName;

        const dbConnection = await getMongoConnection();
        const db = dbConnection.db('fia');

        await db.collection('games').updateOne({ gameName }, { $set: { diceRoll: newDiceRoll } });
        const updatedGame = await db.collection('games').findOne({ gameName });

        dbConnection.close();

        socket.emit('updateGame', updatedGame); // skickar till mig själv
        socket.to(gameName).emit('updateGame', updatedGame); // skickar till alla andra i spelet
    });

    socket.on('disconnect', () => {
        console.log('User disconnected', socket.id);
    });
});

// Routes

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const dbUser = await db.collection('users').findOne({ username });

    if (!dbUser) {
        dbConnection.close();
        return res.status(401).send('Ditt användarnamn eller lösenord är felaktigt');
    }

    bcrypt.compare(password, dbUser.password, async (err, correctPassword) => { // jämför det hashade lösenordet i databasen med det som skickas in
        if (err) {
            console.error('fel vid jämförelse av lösenord');
            dbConnection.close();
            return res.status(400).send('Fel vid inloggning. Försök igen');
        }

        if (!correctPassword) { // om lösenorden inte är samma
            console.error('misslyckad jämförelse av lösenord');
            dbConnection.close();
            
            return res.status(401).send('Ditt användarnamn eller lösenord är felaktigt');
        }

        console.log('lyckad jämförelse av lösenord');

        const userJwt = jwt.sign({
            username,
        }, 'asdf');

        await db.collection('users').updateOne({ username }, { $set: { jwt: userJwt } });

        const result = {
            username,
            jwt: userJwt
        };

        dbConnection.close();
        res.status(200).send({ currentUser: result });
    });
});

app.get('/currentuser', async (req, res) => {
    const token = getToken(req);
    let dbConnection;

    if (!token) {
        return res.status(401).send();
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
            return res.status(401).send();
        }
        res.statis(200).send({ currentUser: payload });
    } catch (err) {
        console.error('err:', err);
        return res.status(401).send();
    } finally {
        dbConnection.close();
    }
});

app.post('/logout', async (req, res) => {
    const { currentUser } = req.body;
    const token = getToken(req);
    let dbConnection;
    let db;

    if (!token) {
        return res.send();
    }

    try {
        jwt.verify(
            token,
            'asdf'
        );
        dbConnection = await getMongoConnection();
        db = dbConnection.db('fia');
        const thisUser = await db.collection('users').findOne({ jwt: token });

        if (!thisUser) {
            dbConnection.close();
            return res.status(401).send();
        }
    } catch (err) {
        console.error('err:', err);
        dbConnection.close();
        return res.status(400).send();
    }

    await db.collection('users').updateOne({ username: currentUser.username }, { $set: { jwt: null } });

    dbConnection.close();
    res.status(200).send();
});

app.get('/users', async (req, res) => { // returnerar alla användare
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

app.get('/users/:username', async (req, res) => { // returenerar användare med specifikt användarnamn
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
    const { username, password, confPassword } = req.body;

    if (!username || !password || !confPassword) {
        return res.status(400).send('Fyll i alla fälten');
    }

    if (password !== confPassword) {
        return res.status(400).send('Lösenorden matcher inte');
    }

    if (username.startsWith('gäst')) {
        return res.status(400).send('Ditt användarnamn får inte börja med "gäst"');
    }

    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const thisUser = await db.collection('users').findOne({ username });

    if (thisUser) {
        res.status(400).send('Användarnamnet finns redan');
        dbConnection.close();
        return;
    }

    const userJwt = jwt.sign({ username }, 'asdf');

    bcrypt.genSalt(10, (err, salt) => { // generar salt inför hasning och kör callback
        if (err) {
            dbConnection.close();
            return res.status(400).send('Fel vid skapande av konto. Försök igen');
        }

        bcrypt.hash(password, salt, async (err, hash) => { // hashar password med saltet och kör callback
            if (err) {
                dbConnection.close();
                return res.status(400).send('Fel vid skapande av konto. Försök igen');
            }

            await db.collection('users').insertOne({ username, password: hash, jwt: userJwt }); // skapar ny user i users med användarnamn, hashat lösenord och sparar jwt (man loggas in direkt)

            const result = {
                username,
                jwt: userJwt
            };

            dbConnection.close();
            return res.status(200).send({ currentUser: result });
        });
    });
});

app.post('/joingame', async (req, res) => {
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const thisGame = await db.collection('games').findOne({ gameName: req.body.gameName });

    if (!thisGame) {
        dbConnection.close();
        return res.status(400).send('Spelet finns inte');
    }

    if (Object.keys(thisGame.players).length > 0 && thisGame.players[req.body.username]) {
        dbConnection.close();
        return res.status(200).send('Du är redan med i spelet');
    }

    if (Object.keys(thisGame.players).length === thisGame.maxPlayers) {
        dbConnection.close();
        return res.status(400).send('Max antal spelare redan uppnått');
    }

    if (thisGame.status !== WAITING) {
        dbConnection.close();
        return res.status(401).send('Spelet har redan startat');
    }

    thisGame.players[req.body.username] = {
        username: req.body.username,
        playerNumber: null,
        color: null,
        ready: false,
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

    dbConnection.close();
    res.status(200).send(updatedGame);
});

app.get('/games/:gameName', async (req, res) => { // returenerar spel med specifikt namn
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const game = await db.collection('games').findOne({ gameName: req.params.gameName });

    dbConnection.close();
    if (!game) {
        return res.status(400).send('Spelet finns inte');
    }

    res.status(200).send(game);
});

app.get('/games', async (req, res) => { // returenerar alla spel
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const games = await db.collection('games').find({}).toArray();
    const result = {};

    games.forEach(element => {
        result[element.gameName] = element;
    });

    dbConnection.close();
    res.status(200).send(result);
});

app.get('/gamesUser/:username', async (req, res) => { // returenerar alla spel en specifik användare är med i
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const games = await db.collection('games').find({}).toArray();
    const thisUsername = req.params.username;
    const result = {};

    games.forEach(game => {
        const players = game.players;
        const isInGame = Object.keys(players).find(username => username === thisUsername);
        if (isInGame) {
            result[game.gameName] = game;
        }
    });

    dbConnection.close();
    res.status(200).send(result);
});

app.post('/games', async (req, res) => { // skapar ett spel
    const { gameName, maxPlayers } = req.body;

    const approvedCharacters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖabcdefghijklmnopqrstuvwxyzåäö 0123456789_-';

    for (let i = 0; i < gameName.length; i++) {
        if (!approvedCharacters.includes(gameName[i])) {
            return res.status(400).send('Får bara innehålla tecken "_", "-", bokstäver A-Ö och siffor 0-9');
        }
    }

    if (gameName.length > 20) {
        return res.status(400).send('Spelets namn får högst vara 20 tecken långt');
    }

    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const thisGame = await db.collection('games').findOne({ gameName });

    if (thisGame) {
        dbConnection.close();
        return res.status(400).send('Spel med samma namn finns redan');
    }

    await db.collection('games').insertOne({ gameName, maxPlayers, players: {}, turn: null, status: WAITING, diceRoll: null, sequence: 0 });

    const result = { gameName, maxPlayers, players: {}, turn: null, status: WAITING, diceRoll: null, sequence: 0 };

    dbConnection.close();
    res.status(201).send(result);
});

app.get('/gameDiceRoll/:gameName', async (req, res) => { // // returenerar tärningskastet i ett spel
    const dbConnection = await getMongoConnection();
    const db = dbConnection.db('fia');
    const game = await db.collection('games').findOne({ gameName: req.params.gameName });
    dbConnection.close();

    if (!game) {
        return res.status(400).send('Spelet finns inte');
    }

    let currentDiceRoll = game.diceRoll;

    res.status(200).send('' + currentDiceRoll);
});

server.listen(4000, () => {
    console.log('Listening on 4000');
});
