// ===============================
// 📌 IMPORTS
// ===============================
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const session = require("express-session");

// Models
const User = require("./models/User");
const Message = require("./models/Message");

// ===============================
// 📌 APP AND SERVER
// ===============================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===============================
// 📌 MONGO CONNECTION
// ===============================
mongoose.connect("mongodb://127.0.0.1:27017/chatDB")
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.log("❌ Mongo Error:", err));

// ===============================
// 📌 MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
  secret: "chat-app-secret-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ===============================
// 📌 AUTH MIDDLEWARE
// ===============================
const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect("/login");
  next();
};

// ===============================
// 📌 ROUTES
// ===============================

// Default
app.get("/", (req, res) => res.redirect("/login"));

// Login Page
app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/chat");
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// Signup Page
app.get("/signup", (req, res) => {
  if (req.session.userId) return res.redirect("/chat");
  res.sendFile(path.join(__dirname, "public/signup.html"));
});

// Chat Page
app.get("/chat", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/chat.html"));
});

// Friends Page
app.get("/friends", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public/friends.html"));
});

// ===============================
// 📌 API: SIGNUP
// ===============================
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.json({ success: false, message: "All fields required!" });

    const existing = await User.findOne({ username });
    if (existing)
      return res.json({ success: false, message: "Username already exists!" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashed });

    await newUser.save();

    req.session.userId = newUser._id;
    res.json({ success: true, message: "Account created!", redirect: "/chat" });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===============================
// 📌 API: LOGIN
// ===============================
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.json({ success: false, message: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ success: false, message: "Invalid password" });

    req.session.userId = user._id;
    await User.findByIdAndUpdate(user._id, { 
      online: true,
      lastSeen: new Date()
    });

    res.json({ success: true, message: "Login successful!", redirect: "/chat" });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===============================
// 📌 API: LOGOUT
// ===============================
app.post("/api/logout", async (req, res) => {
  if (req.session.userId) {
    await User.findByIdAndUpdate(req.session.userId, { 
      online: false,
      lastSeen: new Date()
    });
  }
  req.session.destroy();
  res.json({ success: true, redirect: "/login" });
});

// ===============================
// 📌 API: GET CURRENT USER
// ===============================
app.get("/api/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId).select("username _id online");
  res.json({ success: true, user });
});

// ===============================
// 📌 API: SEARCH USER
// ===============================
app.get("/api/search", requireAuth, async (req, res) => {
  try {
    const { username } = req.query;

    const user = await User.findOne({
      username: new RegExp(username, "i")
    }).select("username _id online lastSeen");

    if (!user) return res.json({ success: false, message: "User not found" });

    if (user._id.toString() === req.session.userId)
      return res.json({ success: false, message: "Cannot add yourself" });

    res.json({ success: true, user });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===============================
// 📌 API: ADD FRIEND
// ===============================
app.post("/api/add-friend", requireAuth, async (req, res) => {
  try {
    const { friendId } = req.body;

    const me = await User.findById(req.session.userId);

    if (me.friends.includes(friendId))
      return res.json({ success: false, message: "Already friends!" });

    me.friends.push(friendId);
    await me.save();

    res.json({ success: true, message: "Friend added successfully!" });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===============================
// 📌 API: GET FRIEND LIST
// ===============================
app.get("/api/friends", requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.session.userId)
      .populate("friends", "username online lastSeen unreadCount");
    
    res.json({ success: true, friends: me.friends });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===============================
// 📌 API: GET MESSAGES
// ===============================
app.get("/api/messages/:userId", requireAuth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    const myId = req.session.userId;

    const messages = await Message.find({
      $or: [
        { from: myId, to: otherUserId },
        { from: otherUserId, to: myId }
      ]
    })
    .populate('from', 'username')
    .populate('to', 'username')
    .sort({ timestamp: 1 });

    // Mark messages as read
    await Message.updateMany(
      { from: otherUserId, to: myId, seen: false },
      { seen: true, status: 'read' }
    );

    res.json({ success: true, messages });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ===============================
// 📌 SOCKET.IO — FIXED MESSAGING SYSTEM
// ===============================
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("🔵 User Connected:", socket.id);

  // Register user when chat page opens
  socket.on("register", async (userId) => {
    try {
      socket.userId = userId;
      onlineUsers.set(userId, socket.id);

      await User.findByIdAndUpdate(userId, { 
        online: true,
        lastSeen: new Date()
      });

      console.log(`✅ User ${userId} registered with socket ${socket.id}`);

      // Send pending messages
      const pendingMessages = await Message.find({ 
        to: userId, 
        seen: false 
      }).populate('from', 'username');

      pendingMessages.forEach(msg => {
        socket.emit("privateMessage", {
          _id: msg._id,
          fromId: msg.from._id.toString(),
          fromName: msg.from.username,
          message: msg.message,
          timestamp: msg.timestamp.toLocaleTimeString(),
          sent: false
        });
      });

    } catch (err) {
      console.log("❌ Registration error:", err);
    }
  });

  // FIXED: Private message handling
  socket.on("privateMessage", async (data) => {
    try {
      const { to, message } = data;
      
      if (!message || !message.trim()) {
        console.log("❌ Empty message");
        return;
      }

      if (!socket.userId) {
        console.log("❌ User not registered");
        return;
      }

      console.log(`📨 Message from ${socket.userId} to ${to}: ${message}`);

      // Get sender info
      const fromUser = await User.findById(socket.userId);
      if (!fromUser) {
        console.log("❌ Sender not found");
        return;
      }

      // Create and save message to database
      const newMessage = new Message({
        from: socket.userId,
        to: to,
        message: message.trim(),
        timestamp: new Date(),
        status: 'sent'
      });

      await newMessage.save();
      console.log("✅ Message saved to database");

      const messageData = {
        _id: newMessage._id,
        fromId: socket.userId,
        fromName: fromUser.username,
        message: newMessage.message,
        timestamp: newMessage.timestamp.toLocaleTimeString(),
        status: 'sent'
      };

      // Check if recipient is online
      const recipientSocketId = onlineUsers.get(to);
      
      if (recipientSocketId) {
        console.log(`✅ Recipient ${to} is online, sending message`);
        
        // Update message status to delivered
        newMessage.status = 'delivered';
        await newMessage.save();
        messageData.status = 'delivered';

        // Send to recipient
        io.to(recipientSocketId).emit("privateMessage", {
          ...messageData,
          sent: false
        });
        
        console.log("✅ Message delivered to recipient");
      } else {
        console.log(`❌ Recipient ${to} is offline, message saved`);
        // Message will be delivered when recipient comes online
      }

      // Echo to sender (ALWAYS send back to sender)
      socket.emit("privateMessage", {
        ...messageData,
        sent: true
      });

      console.log("✅ Echo sent to sender");

    } catch (err) {
      console.log("❌ Message error:", err);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Message status updates
  socket.on("messageStatusUpdate", async (data) => {
    try {
      const { messageId, status } = data;
      await Message.findByIdAndUpdate(messageId, { status });
      console.log(`✅ Message ${messageId} status updated to ${status}`);
    } catch (err) {
      console.log("❌ Status update error:", err);
    }
  });

  // Typing indicators
  socket.on("typing", (data) => {
    const recipientSocketId = onlineUsers.get(data.to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("typing", {
        from: socket.userId,
        typing: data.typing
      });
    }
  });

  // Disconnect
  socket.on("disconnect", async () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      
      await User.findByIdAndUpdate(socket.userId, { 
        online: false,
        lastSeen: new Date()
      });
      
      console.log(`🔴 User ${socket.userId} disconnected`);
    }
  });
});

// ===============================
// 📌 START SERVER
// ===============================
const PORT = process.env.PORT || 5010;
server.listen(PORT, () => {
  console.log(`🚀 Server running: http://localhost:${PORT}`);
  console.log("💬 FIXED Chat App Ready!");
  console.log("📱 Messages will now work properly!");
});