const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store rooms and users
const rooms = new Map();
const users = new Map();

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  // User joins a room
  socket.on('join-room', ({ roomId, username, language = 'en' }) => {
    console.log(`👤 ${username} joining room ${roomId}`);
    
    // Store user info
    users.set(socket.id, {
      username,
      language,
      roomId,
      socketId: socket.id
    });

    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Map(),
        messages: []
      });
    }

    const room = rooms.get(roomId);
    room.users.set(socket.id, users.get(socket.id));
    
    // Join the socket room
    socket.join(roomId);

    // Notify existing users about new user
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      username,
      language
    });

    // Send existing users to the new user
    const existingUsers = Array.from(room.users.values())
      .filter(user => user.socketId !== socket.id);
    
    socket.emit('existing-users', existingUsers);

    // Send room info
    socket.emit('room-joined', {
      roomId,
      userCount: room.users.size,
      messages: room.messages.slice(-50) // Last 50 messages
    });

    console.log(`📊 Room ${roomId} now has ${room.users.size} users`);
  });

  // WebRTC signaling events
  socket.on('offer', ({ targetUserId, offer }) => {
    console.log(`📞 Offer from ${socket.id} to ${targetUserId}`);
    socket.to(targetUserId).emit('offer', {
      fromUserId: socket.id,
      offer
    });
  });

  socket.on('answer', ({ targetUserId, answer }) => {
    console.log(`📱 Answer from ${socket.id} to ${targetUserId}`);
    socket.to(targetUserId).emit('answer', {
      fromUserId: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', ({ targetUserId, candidate }) => {
    socket.to(targetUserId).emit('ice-candidate', {
      fromUserId: socket.id,
      candidate
    });
  });

  // Chat messages
  socket.on('chat-message', ({ message }) => {
    const user = users.get(socket.id);
    if (user && user.roomId) {
      const room = rooms.get(user.roomId);
      const messageData = {
        id: Date.now(),
        username: user.username,
        message,
        timestamp: new Date().toISOString(),
        userId: socket.id
      };

      room.messages.push(messageData);
      
      // Keep only last 100 messages
      if (room.messages.length > 100) {
        room.messages = room.messages.slice(-100);
      }

      io.to(user.roomId).emit('chat-message', messageData);
    }
  });

  // Caption data (for AI translation)
  socket.on('caption-data', ({ text, language, isTranslated }) => {
    const user = users.get(socket.id);
    if (user && user.roomId) {
      socket.to(user.roomId).emit('caption-data', {
        fromUserId: socket.id,
        username: user.username,
        text,
        language,
        isTranslated,
        timestamp: Date.now()
      });
    }
  });

  // Screen sharing events
  socket.on('start-screen-share', () => {
    const user = users.get(socket.id);
    if (user && user.roomId) {
      socket.to(user.roomId).emit('user-started-screen-share', {
        userId: socket.id,
        username: user.username
      });
    }
  });

  socket.on('stop-screen-share', () => {
    const user = users.get(socket.id);
    if (user && user.roomId) {
      socket.to(user.roomId).emit('user-stopped-screen-share', {
        userId: socket.id,
        username: user.username
      });
    }
  });

  // User disconnect
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    
    const user = users.get(socket.id);
    if (user && user.roomId) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.users.delete(socket.id);
        
        // Notify other users
        socket.to(user.roomId).emit('user-left', {
          userId: socket.id,
          username: user.username
        });

        // Clean up empty rooms
        if (room.users.size === 0) {
          rooms.delete(user.roomId);
          console.log(`🧹 Cleaned up empty room: ${user.roomId}`);
        }
      }
    }
    
    users.delete(socket.id);
  });

  // Error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// API endpoints
app.get('/api/rooms/:roomId/info', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  if (room) {
    res.json({
      roomId,
      userCount: room.users.size,
      users: Array.from(room.users.values()).map(user => ({
        username: user.username,
        language: user.language
      }))
    });
  } else {
    res.json({
      roomId,
      userCount: 0,
      users: []
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    activeUsers: users.size
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Global Connect server running on port ${PORT}`);
  console.log(`🌐 Access the app at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});