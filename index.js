const express = require('express');
const { randomBytes } = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(bodyParser.json());

const games = {};
const users = { gustav: { username: 'gustav', displayname: 'Gustav', password: '123', jwt: null } };

const WAITING = 'WAITING';
const PLAYING = 'PLAYING';
const FINISHED = 'FINISHED';

app.post('/login', (req, res) => {

    const { username, password } = req.body;

    if (!Object.keys(users).includes(username)) {
        return res.send({ jwt: undefined, message: 'Ditt användarnamn eller lösenord är felaktigt' });
    }

    const thisUser = Object.values(users).find(u => u.username === username);

    if (thisUser.password !== password) {
        return res.send({ jwt: undefined, message: 'Ditt användarnamn eller lösenord är felaktigt' });
    }

    const userJwt = jwt.sign({
        username: thisUser.username,
        displayname: thisUser.displayname
    }, 'asdf');

    thisUser.jwt = userJwt;

    const result = { ...thisUser };
    delete result.password;

    res.status(200).send({ currentUser: result });
});

app.get('/currentuser', (req, res) => {
    const token = getToken(req);

    if (!token) {
        return res.status(401).send({ jwt: undefined });
    }

    try {
        const payload = jwt.verify(
            token,
            'asdf'
        );
        const exists = Object.values(users).find(u => u.jwt === token);
        if (!exists) {
            return res.status(401).send({ currentUser: undefined });
        }
        res.send({ currentUser: payload });
    } catch (err) {
        console.error('err:', err);
        return res.status(401).send({ currentUser: undefined });
    }
});

app.post('/logout', (req, res) => {

    const token = getToken(req);
    if (!token) {
        return res.status(401).send();
    }
    const currentUser = Object.values(users).find(u => u.jwt === token);
    currentUser.jwt = null;

    res.status(200).send();
});

app.get('/users', (req, res) => {
    res.status(200).send(users);
});

app.get('/users/:username', (req, res) => {
    res.status(200).send(users[req.params.username]);
});

app.post('/signup', (req, res) => {
    const { username, displayname, password, confPassword } = req.body;

    if (!username || !displayname || !password || !confPassword) {
        res.status(400).send('Vänligen fyll i alla fält');
        return;
    }

    if (password !== confPassword) {
        res.status(400).send('Lösenorden matcher inte');
        return;
    }

    if (Object.values(users).find(u => u.username === username)) {
        res.status(400).send('Användarnamnet finns redan');
        return;
    }

    users[username] = {
        username, displayname, password
    }

    const userJwt = jwt.sign({
        username: username,
        displayname: displayname
    }, 'asdf');

    thisUser.jwt = userJwt;

    const result = { ...thisUser };
    delete result.password;

    res.status(200).send({ currentUser: result });
});

app.post('/games/:id/join', (req, res) => {
    const game = games[req.params.id];
    if (!game) {
        res.status(400).send('Spelet finns inte');
    }

    if (game.players.length === game.maxPlayers) {
        res.status(400).send('Max antal spelare redan uppnått');
    }

    if (game.players.find(p => p.username) === req.body.username) {
        res.status(400).send('Du är redan med i spelet');
    }

    game.players.push({
        username: req.body.username,
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
    });

    res.status(200).send('Du är med i spelet');
});

app.get('/games', (req, res) => {
    res.send(200, games);
});

app.post('/games', (req, res) => {
    const id = randomBytes(4).toString('hex');
    const { title, maxPlayers } = req.body;

    games[id] = {
        id, title, maxPlayers,
        players: [],
        status: WAITING,
    }

    res.status(201).send(games[id]);
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