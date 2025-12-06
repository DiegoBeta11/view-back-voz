# ViewCall Voice Server

Voice transmission server for ViewCall application using WebRTC, Socket.IO, and PeerJS.

## Features

- Real-time voice communication via WebRTC
- Peer-to-peer connections using PeerJS
- Signaling server using Socket.IO
- STUN server configuration for NAT traversal
- TypeScript support
- CORS enabled for frontend integration

## Architecture

The voice server implements a client-server architecture for voice transmission:

- **Socket.IO**: Handles signaling for WebRTC connection establishment
- **PeerJS**: Manages peer-to-peer connections for audio streams
- **WebRTC**: Provides the underlying technology for real-time communication
- **STUN Servers**: Assist with NAT traversal for peer connections

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the root directory:

```env
PORT=4000
ORIGIN=http://localhost:5173,https://viewcall-frontend.vercel.app
STUN_SERVER=stun:stun.l.google.com:19302
PEERJS_PORT=9000
PEERJS_PATH=/peerjs
```

## Development

```bash
npm run dev
```

## Production Build

```bash
npm run build
npm start
```

## Deployment

This server is configured for deployment on Render:

1. Connect your GitHub repository
2. Set the build command: `npm run build`
3. Set the start command: `npm start`
4. Configure environment variables in Render dashboard

## API Endpoints

- `GET /`: Health check endpoint

## Socket Events

### Voice Signaling

- `join:voice-room`: Join a voice room
- `voice:offer`: Send WebRTC offer
- `voice:answer`: Send WebRTC answer
- `voice:ice-candidate`: Send ICE candidate
- `voice:mic:toggle`: Toggle microphone state

### Room Management

- `voice:user:joined`: User joined the room
- `voice:user:left`: User left the room
- `voice:existing:users`: List of existing users
- `voice:room:full`: Room is at capacity

## Technologies Used

- Node.js
- TypeScript
- Express.js
- Socket.IO
- PeerJS
- WebRTC
- CORS

## License

ISC