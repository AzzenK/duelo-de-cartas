const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let games = {};
console.log("Servidor Duelo de Cartas está iniciando...");

wss.on('connection', ws => {
    const clientId = Date.now();
    ws.clientId = clientId;

    ws.on('message', message => {
        const data = JSON.parse(message);
        switch (data.type) {
            case 'create':
                const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
                games[roomCode] = { players: [{ ws, lives: 3, name: data.playerName, score: 0, level: 1 }] };
                ws.send(JSON.stringify({ type: 'roomCreated', roomCode }));
                break;
            case 'join':
                const room = games[data.roomCode];
                if (room && room.players.length < 2) {
                    room.players.push({ ws, lives: 3, name: data.playerName, score: 0, level: 1 });
                    const player1 = room.players[0]; const player2 = room.players[1];
                    player1.ws.send(JSON.stringify({ type: 'gameStarted', opponentName: player2.name }));
                    player2.ws.send(JSON.stringify({ type: 'gameStarted', opponentName: player1.name }));
                } else { ws.send(JSON.stringify({ type: 'error', message: 'Sala não encontrada ou está cheia.' })); }
                break;
            case 'update':
                const opponent = findOpponent(ws.clientId);
                if (opponent) { opponent.ws.send(JSON.stringify({ type: 'opponentUpdate', state: data.state })); }
                break;
            case 'lostLife':
                const gameOfPlayer = findGameByClientId(ws.clientId);
                if (!gameOfPlayer) break;
                const playerInfo = gameOfPlayer.players.find(p => p.ws.clientId === ws.clientId);
                if (playerInfo) playerInfo.lives--;
                const opponentAfterLifeLoss = findOpponent(ws.clientId);
                if (opponentAfterLifeLoss) { opponentAfterLifeLoss.ws.send(JSON.stringify({ type: 'opponentLostLife', remainingLives: playerInfo.lives })); }
                if (playerInfo && playerInfo.lives <= 0) {
                    const winner = findOpponent(ws.clientId);
                    if(winner) winner.ws.send(JSON.stringify({ type: 'gameOver', winner: true, message: `Você ganhou! ${playerInfo.name} perdeu todas as vidas.` }));
                    playerInfo.ws.send(JSON.stringify({ type: 'gameOver', winner: false, message: 'Você perdeu! Fim de jogo.' }));
                    delete games[findRoomCodeByClientId(ws.clientId)];
                }
                break;
        }
    });

    ws.on('close', () => {
        const roomCode = findRoomCodeByClientId(ws.clientId);
        if (roomCode) {
            const opponent = findOpponent(ws.clientId);
            if (opponent) { opponent.ws.send(JSON.stringify({ type: 'opponentDisconnected' })); }
            delete games[roomCode];
        }
    });
});

function findGameByClientId(clientId) { for (const code in games) { if (games[code].players.some(p => p.ws.clientId === clientId)) return games[code]; } return null; }
function findRoomCodeByClientId(clientId) { for (const code in games) { if (games[code].players.some(p => p.ws.clientId === clientId)) return code; } return null; }
function findOpponent(clientId) { const game = findGameByClientId(clientId); if (!game) return null; return game.players.find(p => p.ws.clientId !== clientId); }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
