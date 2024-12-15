import { v4 as uuidv4 } from "uuid";
import { socketAuth } from "../middleware/socketAuth.js";
import setupGame from "./game.js";

const rooms = {};
const matchmakingQueue = [];
export const userSocketMap = {};
let roomCounter = 1;

export default function lobbySocket(io) {
  io.use((socket, next) => socketAuth(socket, next));

  io.on("connection", (socket) => {
    const { userId } = socket;
    console.log(`User connected: ${userId} with socket ID: ${socket.id}`);

    emitAvailableRooms(io);

    socket.on("get_available_rooms", () => {
      emitAvailableRooms(io);
    });

    if (userSocketMap[userId]) {
      console.log(
        `User ${userId} already connected. Disconnecting previous socket: ${userSocketMap[userId]}`
      );
      io.to(userSocketMap[userId]).emit(
        "error_message",
        "You have been disconnected because you connected from another device or tab."
      );
      const previousSocket = io.sockets.sockets.get(userSocketMap[userId]);
      if (previousSocket) {
        previousSocket.disconnect(true);
      }
    }

    userSocketMap[userId] = socket.id;

    setupGame(socket, io, rooms);

    socket.on("cancel_match", () => {
      removeFromQueue(userId);
      leaveCurrentRoom(userId);
      emitAvailableRooms(io);
    });

    socket.on("find_match", () => {
      if (isInRoom(userId)) {
        socket.emit(
          "error_message",
          "You are already in a room. Please leave the current room before finding a new match."
        );
        return;
      }

      if (matchmakingQueue.includes(userId)) {
        socket.emit("error_message", "You are already searching for a match.");
        return;
      }

      matchmakingQueue.push(userId);

      if (matchmakingQueue.length >= 2) {
        const player1 = matchmakingQueue.shift();
        const player2 = matchmakingQueue.shift();

        const roomId = uuidv4();
        rooms[roomId] = {
          players: [player1, player2],
          roomName: `Room ${roomCounter++}`,
        };

        joinUserToRoom(player1, roomId);
        joinUserToRoom(player2, roomId);

        io.to(roomId).emit("match_found", {
          roomId,
          roomName: rooms[roomId].roomName,
        });
      }

      emitAvailableRooms(io);
    });

    socket.on("create_room", (roomName) => {
      if (isInRoom(userId)) {
        socket.emit(
          "error_message",
          "You are already in a room. Please leave the current room before creating a new one."
        );
        return;
      }

      const existingRoom = Object.values(rooms).find(
        (room) => room.roomName === roomName
      );
      if (existingRoom) {
        socket.emit(
          "error_message",
          "Room name already exists. Please choose a different name."
        );
        return;
      }

      const roomId = uuidv4();
      rooms[roomId] = {
        players: [userId],
        roomName: roomName || `Room ${roomCounter++}`,
      };
      joinUserToRoom(userId, roomId);

      io.to(roomId).emit("room_created", {
        roomId,
        roomName: rooms[roomId].roomName,
      });
      console.log(`Room created: ${roomId} by ${userId}`);

      emitAvailableRooms(io);
    });

    socket.on("join_room", (roomId) => {
      const room = rooms[roomId];
      if (!room) {
        socket.emit("error_message", "Room does not exist.");
        return;
      }

      if (room.players.length >= 2) {
        socket.emit("error_message", "Room is full.");
        return;
      }

      if (isInRoom(userId)) {
        socket.emit(
          "error_message",
          "You are already in a room. Please leave the current room before joining another."
        );
        return;
      }

      room.players.push(userId);
      joinUserToRoom(userId, roomId);

      io.to(roomId).emit("joined_room", {
        roomId,
        roomName: room.roomName,
        players: room.players,
      });
      console.log(`User ${userId} joined room ${roomId}`);

      emitAvailableRooms(io);
    });

    socket.on("leave_room", () => {
      leaveCurrentRoom(userId);
      emitAvailableRooms(io);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id} for user: ${userId}`);
      delete userSocketMap[userId];
      removeFromQueue(userId);
      leaveCurrentRoom(userId);
      emitAvailableRooms(io);
    });

    function isInRoom(userId) {
      return Object.values(rooms).some((room) => room.players.includes(userId));
    }

    function getUserRoom(userId) {
      for (const [roomId, room] of Object.entries(rooms)) {
        if (room.players.includes(userId)) {
          return roomId;
        }
      }
      return null;
    }

    function removeFromQueue(userId) {
      const index = matchmakingQueue.indexOf(userId);
      if (index !== -1) {
        matchmakingQueue.splice(index, 1);
        console.log(`User ${userId} removed from matchmaking queue.`);
      }

      const roomId = getUserRoom(userId);
      if (roomId) {
        const room = rooms[roomId];
        if (room) {
          room.players = room.players.filter((id) => id !== userId);
          if (room.players.length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} deleted as it became empty.`);
          }
        }
      }
    }

    function emitAvailableRooms(io) {
      const availableRooms = Object.entries(rooms)
        .filter(([_, room]) => room.players.length < 2)
        .map(([roomId, room]) => ({
          roomId,
          roomName: room.roomName,
          players: room.players.length,
        }));

      io.emit("available_rooms", availableRooms);
    }

    function joinUserToRoom(userId, roomId) {
      const socketId = userSocketMap[userId];
      if (socketId) {
        const userSocket = io.sockets.sockets.get(socketId);
        if (userSocket) {
          userSocket.join(roomId);
          console.log(`User ${userId} joined room ${roomId}`);
        }
      }
    }

    function leaveCurrentRoom(userId) {
      const roomId = getUserRoom(userId);
      if (roomId) {
        const room = rooms[roomId];
        if (room) {
          room.players = room.players.filter((id) => id !== userId);

          if (room.players.length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} deleted as it became empty.`);
          }
        }

        const socketId = userSocketMap[userId];
        if (socketId) {
          const userSocket = io.sockets.sockets.get(socketId);
          if (userSocket) {
            userSocket.leave(roomId);
            console.log(`User ${userId} left socket room ${roomId}`);
          }
        }
      }
    }
  });
}
