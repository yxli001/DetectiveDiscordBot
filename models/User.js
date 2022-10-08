const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    discordUserId: String,
    username: String,
    strikes: [
        {
            guildId: String,
            numberOfStrikes: Number,
        },
    ],
    hasBeenBanned: Boolean,
    pastOffenses: [String],
});

module.exports = User = mongoose.model("User", userSchema);
