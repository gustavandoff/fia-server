const express = require('express');
const { randomBytes } = require('crypto');
const bodyParser = require('body-parser');

const cors = require('cors');
const app = express();
app.use(cors());
app.use(bodyParser.json());

const games = {};
const users = {};

const WAITING = 'WAITING';
const PLAYING = 'PLAYING';
const FINISHED = 'FINISHED';

app.get('/users/:username', (req, res) => {
    res.status(200).send(users[req.params.username]);
});

app.post('/users', (req, res) => {
    const id = randomBytes(4).toString('hex');
    const { username, displayname, password, confpassword } = req.body;

    if (password !== confpassword) {
        res.status(400).send('Lösenorden matcher inte');
        return;
    }

    if (Object.values(users).find(u => u.username === username)) {
        res.status(400).send('Användarnamnet finns redan');
        return;
    }

    users[id] = {
        id, username, displayname, password
    }

    res.status(201).send(users[id]);
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
                color: null
            },
            {
                number: 1,
                position: null,
                color: null
            },
            {
                number: 2,
                position: null,
                color: null
            },
            {
                number: 3,
                position: null,
                color: null
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