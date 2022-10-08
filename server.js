require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
    ],
});

client.login(process.env.DISCORD_TOKEN);

// mongoose
mongoose
    .connect(
        `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@cluster0.xpqjjyf.mongodb.net/?retryWrites=true&w=majority`
    )
    .then(() => {
        console.log("Database connected");
    })
    .catch((err) => {
        console.log("Error connecting");
        console.log(err);
    });

// import models
const User = require("./models/User");

client.on("guildMemberAdd", async (member) => {
    const foundUser = await User.findOne({
        discordUserId: member.id,
    });

    if (!foundUser) return;

    if (foundUser.hasBeenBanned) {
        const guildOwner = await member.guild.fetchOwner();
        guildOwner.send(
            `${member.user.username}#${member.user.discriminator} has joined your server (${member.guild.name}), and they have been banned for hate speech in other servers before, please be cautious.`
        );
    }
});

client.on("messageCreate", async (message) => {
    try {
        if (message?.author.bot) return;

        const response = await axios.post("http:localhost:8000/api/detector/", {
            text: message.content,
        });
        const data = response.data;
        const { hateSpeech, labels } = data;

        if (!hateSpeech) return;

        const foundUser = await User.findOne({
            discordUserId: message.author.id,
        });
        const guildId = message.guild.id;
        if (foundUser) {
            labels.forEach((label) => {
                if (foundUser.pastOffenses.indexOf(label) === -1) {
                    foundUser.pastOffenses.push(label);
                }
            });

            let doesExist = false;
            let strikeIndex = -1;
            foundUser.strikes?.map((strike, index) => {
                if (strike.guildId === guildId) {
                    foundUser.strikes[index].numberOfStrikes += 1;
                    strikeIndex = index;
                    doesExist = true;
                }
            });

            if (!doesExist) {
                foundUser.strikes.push({ guildId, numberOfStrikes: 1 });
                strikeIndex = foundUser.strikes.length - 1;
            }

            if (foundUser.strikes[strikeIndex].numberOfStrikes >= 3) {
                message.guild.members.ban(message.author.id);
                message.channel.send(
                    `Banned ${message.author.toString()} for hate speech`
                );

                foundUser.hasBeenBanned = true;
            } else {
                message.channel.send(
                    `Warning ${message.author.toString()} for hate speech. You have ${
                        3 - foundUser.strikes[strikeIndex].numberOfStrikes
                    } strikes remaining until you go bye bye`
                );
            }

            await foundUser.save();
        } else {
            const newUser = new User({
                discordUserId: message.author.id,
                username: `${message.author.username}#${message.author.discriminator}`,
                strikes: [
                    {
                        guildId,
                        numberOfStrikes: 1,
                    },
                ],
                hasBeenBanned: false,
                pastOffenses: labels,
            });

            message.channel.send(
                `Warning ${message.author.toString()} for hate speech. You have 2 strikes remaining til ya gone kid`
            );

            await newUser.save();
        }

        await message.delete();
    } catch (err) {
        console.log(err);
    }
});
