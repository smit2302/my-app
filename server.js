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

// ===============================
// 📌 ENVIRONMENT VARIABLES
// ===============================
// Temporary fix - local database use करो
// Temporary MongoDB connection without Atlas
const MONGODB_URI = "mongodb://localhost:27017/chatsapp";

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => {
  console.log("❌ MongoDB connection warning:", err.message);
});
const SESSION_SECRET = process.env.SESSION_SECRET;
const PORT = process.env.PORT || 5009;

// ===============================
// 📌 ENVIRONMENT VALIDATION
// ===============================
if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI environment variable is required");
    process.exit(1);
}

if (!SESSION_SECRET) {
    console.error("❌ SESSION_SECRET environment variable is required");
    process.exit(1);
}

// ===============================
// 📌 APP AND SERVER SETUP
// ===============================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ===============================
// 📌 MONGOOSE MODELS
// ===============================
// User Model
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 20
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    online: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);

// Message Model
const messageSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: String,
    timestamp: { type: Date, default: Date.now },
    status: { 
        type: String, 
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
    },
    seen: { type: Boolean, default: false }
});

const Message = mongoose.model("Message", messageSchema);

// ===============================
// 📌 MONGO CONNECTION
// ===============================
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => {
  console.log("❌ MongoDB connection warning:", err.message);
  // Don't exit the process, just log the error
});

// ===============================
// 📌 MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000 
    }
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

// Default Route
app.get("/", (req, res) => {
    res.redirect("/login");
});

// Login Page
app.get("/login", (req, res) => {
    if (req.session.userId) return res.redirect("/chat");
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Signup Page
app.get("/signup", (req, res) => {
    if (req.session.userId) return res.redirect("/chat");
    res.sendFile(path.join(__dirname, "public", "signup.html"));
});

// Chat Page
app.get("/chat", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// Friends Page
app.get("/friends", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "friends.html"));
});

// ===============================
// 📌 API ROUTES
// ===============================

// Signup API
app.post("/api/signup", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, message: "All fields required!" });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.json({ success: false, message: "Username already exists!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        req.session.userId = newUser._id;
        res.json({ success: true, message: "Account created successfully!", redirect: "/chat" });

    } catch (err) {
        res.json({ success: false, message: "Server error: " + err.message });
    }
});

// Login API
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.json({ success: false, message: "All fields required!" });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.json({ success: false, message: "User not found!" });
        }

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) {
            return res.json({ success: false, message: "Invalid password!" });
        }

        req.session.userId = user._id;
        await User.findByIdAndUpdate(user._id, { online: true, lastSeen: new Date() });

        res.json({ success: true, message: "Login successful!", redirect: "/chat" });
    } catch (err) {
        res.json({ success: false, message: "Server error: " + err.message });
    }
});

// Logout API
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

// Get Current User API
app.get("/api/me", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select("username _id online");
        res.json({ success: true, user });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Search User API
app.get("/api/search", requireAuth, async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.json({ success: false, message: "Username required" });

        const user = await User.findOne({ 
            username: new RegExp(username, 'i') 
        }).select("username online _id");

        if (!user) return res.json({ success: false, message: "User not found" });
        if (user._id.toString() === req.session.userId) {
            return res.json({ success: false, message: "Cannot add yourself" });
        }

        res.json({ success: true, user });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Add Friend API
app.post("/api/add-friend", requireAuth, async (req, res) => {
    try {
        const { friendId } = req.body;
        const user = await User.findById(req.session.userId);
        
        if (user.friends.includes(friendId)) {
            return res.json({ success: false, message: "Already friends!" });
        }
        
        user.friends.push(friendId);
        await user.save();
        
        res.json({ success: true, message: "Friend added successfully!" });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Get Friends List API
app.get("/api/friends", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId)
            .populate("friends", "username online lastSeen");
        
        res.json({ success: true, friends: user.friends || [] });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// Get Messages API
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
// 📌 SOCKET.IO REAL-TIME COMMUNICATION
// ===============================
const onlineUsers = new Map();

io.on("connection", (socket) => {
    console.log("🔗 User connected:", socket.id);

    socket.on("register", async (userId) => {
        try {
            onlineUsers.set(userId, socket.id);
            socket.userId = userId;

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

    // Private message
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
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 App URL: https://your-app-name.onrender.com`);
    console.log("💬 ChatsApp Ready with All Features!");
    console.log("📱 Real-time messaging | Message status | Offline support");
});

module.exports = app;
