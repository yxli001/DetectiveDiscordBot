require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
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

client.on("ready", async () => {
    client.user.setActivity("I am watching you 0_0");
});

client.on("guildMemberAdd", async (member) => {
    const foundUser = await User.findOne({
        discordUserId: member.id,
    });

    if (!foundUser) return;

    if (foundUser.hasBeenBanned) {
        const guildOwner = await member.guild.fetchOwner();

        let pastOffensesString = "hate speech relating to ";
        foundUser.pastOffenses.forEach((offense, index) => {
            if (index === foundUser.pastOffenses.length - 1) {
                pastOffensesString += offense.toLowerCase() + " ";

                return;
            }

            pastOffensesString += offense.toLowerCase() + ", ";
        });

        const badPersonJoinedEmbed = new EmbedBuilder()
            .setColor("ff4b2b")
            .setTitle(
                `${member.user.username}#${member.user.discriminator} joined ${member.guild.name}`
            )
            .setDescription(
                `${member.user.username}#${member.user.discriminator} has been banned for ${pastOffensesString} in other servers before, please be cautious.`
            )
            .setThumbnail(member.user.avatarURL());
        await guildOwner.send({ embeds: [badPersonJoinedEmbed] });
    }
});

client.on("messageCreate", async (message) => {
    try {
        if (message?.author.bot) return;

        const response = await axios.post(
            "https://detective-discord-1.herokuapp.com/api/detector",
            {
                text: message.content,
            }
        );
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
                const bannedEmbed = new EmbedBuilder()
                    .setColor("ff4b2b")
                    .setTitle(
                        `${message.author.username}#${message.author.discriminator} has been banned`
                    )
                    .setThumbnail(message.author.avatarURL())
                    .setDescription(
                        "A user has been banned! For the safety of our server, please refrain from sending content that may be deemed explicit. Thanks!"
                    );

                message.guild.members.ban(message.author.id);
                await message.channel.send({ embeds: [bannedEmbed] });

                foundUser.hasBeenBanned = true;
                foundUser.strikes[strikeIndex].numberOfStrikes = 0;
            } else {
                const warningEmbed = new EmbedBuilder()
                    .setColor("ffc919")
                    .setTitle(
                        `Warning ${message.author.username}#${message.author.discriminator} for hate speech.`
                    )
                    .setThumbnail(message.author.avatarURL())
                    .setDescription(
                        `${message.author.toString()} has been warned! You have ${
                            3 - foundUser.strikes[strikeIndex].numberOfStrikes
                        } strikes remaining until you go bye byeFor the safety of our server, please refrain from sending content that may be deemed explicit. Thanks!`
                    );

                await message.channel.send({ embeds: [warningEmbed] });
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

            const warningEmbed = new EmbedBuilder()
                .setColor("ffc919")
                .setTitle(
                    `Warning ${message.author.username}#${message.author.discriminator} for hate speech. `
                )
                .setThumbnail(message.author.avatarURL())
                .setDescription(
                    "You have 2 strikes remaining until you explode. Kaboom! For the safety of our server, please refrain from sending content that may be deemed explicit. Thanks!"
                );

            await message.channel.send({ embeds: [warningEmbed] });

            await newUser.save();
        }

        await message.delete();
    } catch (err) {
        console.log(err);
    }
});
