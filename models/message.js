const mongoose = require("mongoose");

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

module.exports = mongoose.model("Message", messageSchema);