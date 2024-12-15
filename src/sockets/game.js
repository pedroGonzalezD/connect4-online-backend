import { socketAuth } from "../middleware/socketAuth.js";

const games = {};

export default function setupGame(socket, io, rooms) {
  socket.on("join_game", (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);

    if (!games[roomId]) {
      games[roomId] = {
        board: Array(6)
          .fill(null)
          .map(() => Array(7).fill(null)),
        players: [],
        currentPlayer: "red",
        winner: null,
      };
    }

    const game = games[roomId];

    if (!game.players.includes(socket.id) && game.players.length < 2) {
      game.players.push(socket.id);
      console.log(`Player ${socket.id} added to room ${roomId}`);
    } else {
      socket.emit("error_message", "Room full or you are already in the room.");
      return;
    }

    const isMyTurn =
      game.currentPlayer === "red"
        ? game.players[0] === socket.id
        : game.players[1] === socket.id;

    socket.emit("game_state", {
      board: game.board,
      currentPlayer: game.currentPlayer,
      isMyTurn,
      winner: game.winner,
      players: game.players,
    });

    if (game.players.length === 2) {
      socket.server.to(roomId).emit("game_start", {
        currentPlayer: game.currentPlayer,
      });
      console.log(`Game started in room ${roomId}`);
    }
  });

  socket.on("make_move", (roomId, columnIndex) => {
    const game = games[roomId];
    if (!game) return;
    if (game.winner) return;

    const playerIndex = game.players.indexOf(socket.id);
    if (playerIndex === -1) return;

    const expectedPlayer =
      game.currentPlayer === "red" ? game.players[0] : game.players[1];
    if (expectedPlayer !== socket.id) {
      socket.emit("error_message", "It's not your turn.");
      return;
    }

    let placed = false;
    for (let row = game.board.length - 1; row >= 0; row--) {
      if (!game.board[row][columnIndex]) {
        game.board[row][columnIndex] = game.currentPlayer;
        placed = true;
        break;
      }
    }

    if (!placed) {
      socket.emit("error_message", "Column full.");
      return;
    }

    const winner = checkWinner(game.board);
    if (winner) {
      game.winner = winner;
      const winnerColor = winner;
      let winnerId = null;

      if (winner === "draw") {
        winnerId = null;
      } else {
        winnerId = winnerColor === "red" ? game.players[0] : game.players[1];
      }

      game.players.forEach((playerId) => {
        socket.server.to(playerId).emit("game_state", {
          board: game.board,
          currentPlayer: game.currentPlayer,
          isMyTurn: false,
          winner: game.winner,
          players: game.players,
        });
      });

      socket.server.to(roomId).emit("game_over", {
        winnerColor,
        winnerId,
        reason: winner === "draw" ? "draw" : "win",
      });
      console.log(
        `Game in room ${roomId} ended. Winner: ${winnerColor} ${
          winnerId ? `(Player ID: ${winnerId})` : "(Draw)"
        }`
      );

      removePlayersFromRoom(socket, roomId, game.players);
      delete games[roomId];

      if (rooms[roomId]) {
        delete rooms[roomId];
      }
      emitAvailableRooms(io, rooms);
    } else {
      game.currentPlayer = game.currentPlayer === "red" ? "yellow" : "red";

      game.players.forEach((playerId) => {
        const isMyTurn =
          game.currentPlayer === "red"
            ? game.players[0] === playerId
            : game.players[1] === playerId;
        socket.server.to(playerId).emit("game_state", {
          board: game.board,
          currentPlayer: game.currentPlayer,
          isMyTurn,
          winner: game.winner,
          players: game.players,
        });
      });
    }
  });

  socket.on("surrender", (roomId) => {
    const game = games[roomId];
    if (!game || game.winner) return;

    const playerIndex = game.players.indexOf(socket.id);
    if (playerIndex === -1) return;

    const opponentIndex = playerIndex === 0 ? 1 : 0;
    const opponentId = game.players[opponentIndex];
    if (!opponentId) {
      game.players.splice(playerIndex, 1);
      console.log(
        `Player ${socket.id} left room ${roomId}. No opponents left.`
      );

      removePlayersFromRoom(socket, roomId, game.players);
      delete games[roomId];

      if (rooms[roomId]) {
        delete rooms[roomId];
      }
      emitAvailableRooms(io, rooms);
      return;
    }

    const winnerColor = game.currentPlayer === "red" ? "yellow" : "red";
    game.winner = winnerColor;

    const winnerId = opponentId;

    socket.server.to(roomId).emit("game_over", {
      winnerColor,
      winnerId,
      reason: "surrender",
    });
    console.log(
      `Player ${socket.id} surrendered in room ${roomId}. Winner: ${winnerColor}`
    );

    removePlayersFromRoom(socket, roomId, game.players);
    game.players.splice(playerIndex, 1);

    delete games[roomId];
    if (rooms[roomId]) {
      delete rooms[roomId];
    }
    emitAvailableRooms(io, rooms);
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected from game:", socket.id);

    for (const [roomId, game] of Object.entries(games)) {
      const playerIndex = game.players.indexOf(socket.id);
      if (playerIndex !== -1) {
        game.players.splice(playerIndex, 1);
        console.log(`Player ${socket.id} removed from room ${roomId}`);

        if (game.winner) {
          removePlayersFromRoom(socket, roomId, game.players);
          delete games[roomId];
          if (rooms[roomId]) {
            delete rooms[roomId];
          }
          emitAvailableRooms(io, rooms);
          console.log(`Room ${roomId} deleted as game is already over.`);
        } else if (game.players.length === 1) {
          const remainingPlayer = game.players[0];
          const winnerColor = game.currentPlayer === "red" ? "yellow" : "red";
          game.winner = winnerColor;
          const winnerId = remainingPlayer;

          socket.server.to(remainingPlayer).emit("game_over", {
            winnerColor,
            winnerId,
            reason: "opponent_disconnected",
          });
          console.log(
            `Player ${remainingPlayer} wins by default in room ${roomId} due to opponent disconnection.`
          );

          removePlayersFromRoom(socket, roomId, game.players);
          delete games[roomId];
          if (rooms[roomId]) {
            delete rooms[roomId];
          }
          emitAvailableRooms(io, rooms);
        } else {
          removePlayersFromRoom(socket, roomId, game.players);
          delete games[roomId];
          if (rooms[roomId]) {
            delete rooms[roomId];
          }
          emitAvailableRooms(io, rooms);
          console.log(`Room ${roomId} deleted due to no players.`);
        }

        break;
      }
    }
  });
}

function checkWinner(board) {
  const directions = [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
  ];

  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[0].length; col++) {
      const cell = board[row][col];
      if (!cell) continue;

      for (const dir of directions) {
        let count = 1;
        let r = row + dir.y;
        let c = col + dir.x;

        while (
          r >= 0 &&
          r < board.length &&
          c >= 0 &&
          c < board[0].length &&
          board[r][c] === cell
        ) {
          count++;
          if (count === 4) {
            return cell;
          }
          r += dir.y;
          c += dir.x;
        }
      }
    }
  }

  if (board.every((row) => row.every((cell) => cell))) {
    return "draw";
  }

  return null;
}

function removePlayersFromRoom(socket, roomId, players) {
  players.forEach((playerId) => {
    const playerSocket = socket.server.sockets.sockets.get(playerId);
    if (playerSocket) {
      playerSocket.leave(roomId);
    }
  });
}

function emitAvailableRooms(io, rooms) {
  const availableRooms = Object.entries(rooms)
    .filter(([_, room]) => room.players.length < 2)
    .map(([roomId, room]) => ({
      roomId,
      roomName: room.roomName,
      players: room.players.length,
    }));
  io.emit("available_rooms", availableRooms);
}
