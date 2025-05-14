require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const clientId = process.env.DISCORD_CLIENT_ID; // Your bot's client ID
const guildId = process.env.DISCORD_GUILD_ID; // The ID of the guild where you want to deploy commands (for testing)
const token = process.env.DISCORD_BOT_TOKEN; // Your bot's token

if (!clientId || !token) {
    console.error('Error: DISCORD_CLIENT_ID or DISCORD_BOT_TOKEN is missing in .env file.');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('touradmin')
        .setDescription('Access administrative tour functions.')
        // .setDefaultMemberPermissions(0) // Keep this if you want to restrict by default, or manage perms in server settings
        .addSubcommandGroup(group =>
            group
                .setName('tour')
                .setDescription('Manage tours.')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('menu')
                        .setDescription('Shows the main tour administration menu.')
                )
        ),
    new SlashCommandBuilder()
        .setName('request_tour')
        .setDescription('Request to start a tour to achieve a specific role.')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role you hope to gain by completing the tour.')
                .setRequired(true)
        ),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            // Deploying globally. For guild-specific during dev, use:
            // Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), 
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error reloading application commands:', error);
    }
})(); 