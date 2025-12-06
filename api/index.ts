/**
 * Voice Transmission Server for ViewCall
 * Implements WebRTC voice communication using Socket.IO for signaling and PeerJS for peer-to-peer connections.
 * Includes STUN server configuration for NAT traversal.
 */

import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ExpressPeerServer } from 'peer';

// -------------------------------------------------------------
// Load environment variables early
// -------------------------------------------------------------

/**
 * Loads environment variables from `.env` so they can be used application-wide.
 */
dotenv.config();

// -------------------------------------------------------------
// Express + HTTP Server setup
// -------------------------------------------------------------

/**
 * Express application instance for the voice server.
 */
const app = express();

/**
 * Native HTTP server required for Socket.IO and PeerJS integration.
 */
const server = http.createServer(app);

// -------------------------------------------------------------
// CORS Configuration
// -------------------------------------------------------------

/**
 * Allowed origins for CORS requests.
 * Loaded from the `ORIGIN` environment variable or defaults to localhost.
 */
const allowedOrigins = process.env.ORIGIN?.split(',') || ["http://localhost:5173"];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  })
);
// -------------------------------------------------------------
// PeerJS Server Configuration
// -------------------------------------------------------------

/**
 * PeerJS server for peer-to-peer connections.
 * Handles WebRTC peer connections for voice transmission.
 */
const peerServer = ExpressPeerServer(server, {
  path: process.env.PEERJS_PATH || '/peerjs',
  port: Number(process.env.PEERJS_PORT) || 9000,
});

app.use(peerServer);

// -------------------------------------------------------------
// Socket.IO Server Configuration
// -------------------------------------------------------------

/**
 * Socket.IO real-time server instance with CORS rules for voice signaling.
 */
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

// -------------------------------------------------------------
// Voice Room Structure Definition
// -------------------------------------------------------------

/**
 * Represents a mapping of voice rooms, where each room contains connected socket users.
 *
 * @typedef {Object} VoiceRoom
 * @property {Object.<string, Object>} [roomId] - Voice room identifier.
 * @property {Object.<string, {userId: string, displayName: string, peerId: string}>} [socketId]
 * A collection of socket users inside the voice room.
 */
interface VoiceRoom {
  [roomId: string]: {
    [socketId: string]: {
      userId: string;
      displayName: string;
      peerId: string;
    };
  };
}

/**
 * In-memory storage of active voice rooms and their users.
 */
const voiceRooms: VoiceRoom = {};

// -------------------------------------------------------------
// Socket.IO Events for Voice Signaling
// -------------------------------------------------------------

io.on('connection', (socket) => {
  console.log('🔊 Voice user connected:', socket.id);

  // -------------------------------------------------------------
  // JOIN VOICE ROOM
  // -------------------------------------------------------------

  /**
   * Event triggered when a user joins a voice room.
   *
   * @event join:voice-room
   * @param {string} roomId - The voice room identifier.
   * @param {Object} userInfo - User metadata such as name, id, and peer ID.
   */
  socket.on('join:voice-room', (roomId: string, userInfo: any) => {
    console.log(`🎤 ${userInfo.displayName} (${socket.id}) joined voice room: ${roomId}`);

    // Limit users per room (same as chat for consistency)
    const currentCount = voiceRooms[roomId]
      ? Object.keys(voiceRooms[roomId]).length
      : 0;

    if (currentCount >= 10) {
      socket.emit('voice:room:full');
      return;
    }

    socket.join(roomId);

    // Initialize room if it doesn't exist
    if (!voiceRooms[roomId]) voiceRooms[roomId] = {};

    // Save user info in the room
    voiceRooms[roomId][socket.id] = userInfo;

    // Notify others in the room
    socket.to(roomId).emit('voice:user:joined', {
      socketId: socket.id,
      userInfo,
    });

    // Send list of existing users back to the newly joined user
    const existingUsers = Object.keys(voiceRooms[roomId])
      .filter((id) => id !== socket.id)
      .map((id) => ({
        socketId: id,
        userInfo: voiceRooms[roomId][id],
      }));

    socket.emit('voice:existing:users', existingUsers);

    console.log(`📊 Voice users in room ${roomId}:`, Object.keys(voiceRooms[roomId]).length);
  });

  // -------------------------------------------------------------
  // VOICE SIGNALING EVENTS
  // -------------------------------------------------------------

  /**
   * Relays WebRTC offer from one peer to another.
   *
   * @event voice:offer
   * @param {Object} data - Offer payload.
   * @param {string} data.roomId - Target room.
   * @param {string} data.targetPeerId - Target peer ID.
   * @param {RTCSessionDescription} data.offer - WebRTC offer.
   */
  socket.on('voice:offer', (data) => {
    socket.to(data.roomId).emit('voice:offer', {
      fromPeerId: data.fromPeerId,
      offer: data.offer,
    });
  });

  /**
   * Relays WebRTC answer from one peer to another.
   *
   * @event voice:answer
   * @param {Object} data - Answer payload.
   * @param {string} data.roomId - Target room.
   * @param {string} data.targetPeerId - Target peer ID.
   * @param {RTCSessionDescription} data.answer - WebRTC answer.
   */
  socket.on('voice:answer', (data) => {
    socket.to(data.roomId).emit('voice:answer', {
      fromPeerId: data.fromPeerId,
      answer: data.answer,
    });
  });

  /**
   * Relays ICE candidates for WebRTC connection establishment.
   *
   * @event voice:ice-candidate
   * @param {Object} data - ICE candidate payload.
   * @param {string} data.roomId - Target room.
   * @param {string} data.targetPeerId - Target peer ID.
   * @param {RTCIceCandidate} data.candidate - ICE candidate.
   */
  socket.on('voice:ice-candidate', (data) => {
    socket.to(data.roomId).emit('voice:ice-candidate', {
      fromPeerId: data.fromPeerId,
      candidate: data.candidate,
    });
  });

  // -------------------------------------------------------------
  // VOICE CONTROL EVENTS
  // -------------------------------------------------------------

  /**
   * Handles microphone toggle events.
   *
   * @event voice:mic:toggle
   * @param {Object} data - Mic toggle payload.
   * @param {string} data.roomId - Target room.
   * @param {boolean} data.enabled - Microphone enabled state.
   */
  socket.on('voice:mic:toggle', (data) => {
    socket.to(data.roomId).emit('voice:mic:updated', {
      socketId: socket.id,
      enabled: data.enabled,
    });
  });

  // -------------------------------------------------------------
  // DISCONNECT
  // -------------------------------------------------------------

  /**
   * Handles user disconnection, removing them from their voice room
   * and notifying remaining users.
   *
   * @event disconnect
   */
  socket.on('disconnect', () => {
    console.log('🔇 Voice user disconnected:', socket.id);

    // Find the room the user was in
    for (const roomId in voiceRooms) {
      if (voiceRooms[roomId][socket.id]) {
        const userInfo = voiceRooms[roomId][socket.id];

        // Remove the user from the room
        delete voiceRooms[roomId][socket.id];

        // Notify others
        socket.to(roomId).emit('voice:user:left', {
          socketId: socket.id,
          userInfo,
        });

        console.log(`👋 ${userInfo.displayName} left voice room ${roomId}`);

        // Remove empty rooms
        if (Object.keys(voiceRooms[roomId]).length === 0) {
          delete voiceRooms[roomId];
          console.log(`🗑️ Voice room ${roomId} deleted (empty)`);
        }

        break;
      }
    }
  });
});

// -------------------------------------------------------------
// Health Check Endpoint
// -------------------------------------------------------------

/**
 * Health check endpoint for the voice server.
 */
app.get('/', (req, res) => {
  res.json({
    message: 'Voice server is running',
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// Server Initialization
// -------------------------------------------------------------

/**
 * Port where the voice server will run.
 * Uses PORT environment variable for deployment platforms like Render.
 * Defaults to 4000 for local development.
 */
const PORT = Number(process.env.PORT) || 4000;

/**
 * Starts the HTTP + WebSocket + PeerJS server.
 */
server.listen(PORT, () => {
  console.log(`🎤 Voice server running on port ${PORT}`);
  console.log(`🔗 PeerJS server available at /peerjs`);
  console.log(`🌐 Server ready for connections`);
});