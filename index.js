const express = require('express');
const { randomBytes } = require('crypto');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.set("trust proxy", 1);

app.use(session({
    secret: randomBytes(4).toString('hex'),
    resave: true,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 3600000
    }
}));

const games = {};
const users = { gustav: { username: 'gustav', displayname: 'Gustav', password: '123' } };

const WAITING = 'WAITING';
const PLAYING = 'PLAYING';
const FINISHED = 'FINISHED';

app.post('/login', (req, res) => {

    const { username, password } = req.body;

    const thisUser = Object.values(users).find(u => u.username === username)

    if (!thisUser) {
        res.status(400).send('Ditt användarnamn eller lösenord är felaktigt');
        return;
    }

    if (thisUser.password !== password) {
        res.status(400).send('Ditt användarnamn eller lösenord är felaktigt');
        return;
    }

    req.session.loggedIn = true;
    req.session.user = thisUser;
    console.log(req.session.loggedIn);
    console.log(req.session.user);
    res.status(201).send(true);
});

app.get('/user', (req, res) => {
    console.log(req.session.loggedIn);
    console.log(req.session.user);
    if (req.session.loggedIn) {
        res.status(200).send(req.session.user);//req.session.user);
        return;
    }

    res.status(200).send(false);
});

app.post('/logout', (req, res) => {
    req.session.destroy();
});

app.get('/users', (req, res) => {
    res.status(200).send(users);
});

app.get('/users/:username', (req, res) => {
    res.status(200).send(users[req.params.username]);
});

app.post('/users', (req, res) => {
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

    res.status(201).send(users[username]);
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

app.listen(4000, () => {
    console.log('Listening on 4000');
});