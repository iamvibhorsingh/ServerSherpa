// --- Project Watermark: Discord Tour Bot by original author, licensed CC BY-NC 4.0 ---
// Unique ID: DTB-2023-ORIGINAL-V1

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType, PermissionsBitField } = require('discord.js'); // Modified: Added ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType, PermissionsBitField
const db = require('./db/database.js'); // Import database module
const configManager = require('./managers/configManager.js'); // Import configManager module
const tourManager = require('./managers/tourManager.js'); // Require the new tour manager
const adminCommandHandler = require('./commands/adminCommands.js'); // Require the new admin command handler
const adminInteractionHandler = require('./interactions/adminInteractionHandler.js'); // Require the new interaction handler

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    // Watermark log for authorship proof
    console.log('WATERMARK: Discord Tour Bot | Unique ID: DTB-2023-ORIGINAL-V1 | License: CC BY-NC 4.0 | Author: github.com/iamvibhorsingh');
    // Ensure database is initialized (the database.js module handles this on require, but good to log)
    console.log('Database module loaded. Tables should be initializing if not present.');
    // Potentially, iterate over guilds the bot is in and ensure default tours/configs
    client.guilds.cache.forEach(guild => {
        db.ensureServerConfig(guild.id);
        // db.ensureDefaultTour(guild.id); // We'll call this when a tour is first requested or via an admin command
    });
});

// Basic welcome message for new members
client.on('guildMemberAdd', async member => {
    try {
        // Ensure config exists first (ensureServerConfig is quick)
        await db.ensureServerConfig(member.guild.id);
        // Attempt to start the tour for the new member directly using the tour manager
        await tourManager.startTourForNewMember(member); 
    } catch (error) {
        console.error('Error in guildMemberAdd processing or starting tour:', error);
        // Fallback: Send a message to a system/welcome channel if DM fails or tour start fails
        const config = await db.getServerConfig(member.guild.id).catch(() => null);
        let welcomeChannel = member.guild.systemChannel;
        if (config && config.welcome_channel_id) {
            const channel = member.guild.channels.cache.get(config.welcome_channel_id);
            if (channel) welcomeChannel = channel;
        }
        if (welcomeChannel) {
            welcomeChannel.send(`Welcome, ${member}! We tried to start an interactive tour for you, but encountered an issue. You can try \`!start-tour-manually\` if available, or contact an admin.`).catch(console.error);
        }
    }
});

const ADMIN_COMMAND_PREFIX = '!admin'; // Define an admin command prefix
const ADMIN_UI_COMMAND = 'ui'; // Subcommand for the interaction UI

client.on('messageCreate', async msg => {
    if (msg.author.bot || !msg.guild) return;

    // Simple ping command (remains unchanged)
    if (msg.content === 'ping') {
        msg.reply('pong');
        return;
    }

    // Admin Command Handling - Text commands are being phased out but kept for now.
    if (msg.content.startsWith(ADMIN_COMMAND_PREFIX)) {
        // Check for Administrator permission before processing further
        if (!msg.member || !msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            // Do not reply with ephemeral here for text commands, just return or send normal reply.
            return msg.reply('You need Administrator permissions to use this command.');
        }

        const args = msg.content.slice(ADMIN_COMMAND_PREFIX.length).trim().split(/\s+/);
        const command = args.shift().toLowerCase(); // e.g., 'tour'
        
        // Deprecate !admin ui tour for slash command
        if (command === ADMIN_UI_COMMAND) {
            const uiGroup = args.shift()?.toLowerCase();
            if (uiGroup === 'tour') {
                // Trigger the main admin UI menu for tours
                // await adminInteractionHandler.sendMainMenu(msg); // OLD WAY
                return msg.reply('Please use the `/touradmin tour menu` slash command instead.');
            } else {
                return msg.reply('Unknown UI group. Use `/touradmin tour menu`.');
            }
        }
        
        // Pass to the admin command handler for other text-based admin commands
        adminCommandHandler.handleAdminCommand(msg, [command, ...args]);
        return; // Stop further processing if it was an admin command
    }

    // Regular user command handling (e.g., !start-tour-manually)
    const userId = msg.author.id;
    const guildId = msg.guild.id;
    const userCommand = msg.content.toLowerCase(); // Renamed from 'command' to avoid conflict

    if (userCommand === '!start-tour-manually') {
        try {
            await tourManager.startTourForNewMember(msg.member, msg);
        } catch (error) {
            console.error("Error starting tour manually via command:", error);
            msg.reply({ content: "Sorry, couldn't start the tour. Please contact an admin.", ephemeral: true }).catch(console.error);
        }
        return;
    }
    
    // Removed old tour commands (!start-tour, !next, !back, !end-tour)
    // They are now handled by button interactions

    // Keep other command processing if any
});

client.on('interactionCreate', async interaction => {
    console.log(`[bot.js] Received interaction: ${interaction.id}, Type: ${interaction.type}, CustomID: ${interaction.customId}`);

    // Handle slash commands first
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;
        console.log(`[bot.js] Slash command received: /${commandName}`);

        if (commandName === 'touradmin') {
            // Check for Administrator permission
            if (!interaction.member || !interaction.member.permissions || !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
            }

            const subcommandGroup = options.getSubcommandGroup(false); // false means it's optional
            const subcommand = options.getSubcommand(false);

            console.log(`[bot.js] /touradmin: SubcommandGroup: ${subcommandGroup}, Subcommand: ${subcommand}`);

            if (subcommandGroup === 'tour' && subcommand === 'menu') {
                try {
                    await adminInteractionHandler.sendMainMenu(interaction); // Pass the interaction directly
                    console.log(`[bot.js] Called sendMainMenu for /touradmin tour menu`);
                } catch (error) {
                    console.error('[bot.js] Error calling sendMainMenu for slash command:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'Error displaying admin menu.', ephemeral: true }).catch(e => console.error("Error reply for sendMainMenu failure:", e));
                    } else {
                        await interaction.followUp({ content: 'Error displaying admin menu.', ephemeral: true }).catch(e => console.error("Error followup for sendMainMenu failure:", e));
                    }
                }
                return; // Handled
            }
            // Add other /touradmin tour subcommands here if needed
            // e.g., else if (subcommandGroup === 'tour' && subcommand === 'create') { ... }
        }
        // Add other top-level slash commands here if needed
        else if (commandName === 'request_tour') {
            const role = options.getRole('role');
            if (!role) {
                return interaction.reply({ content: 'You must specify a role.', ephemeral: true });
            }

            // Defer the reply as finding and starting the tour might take a moment
            await interaction.deferReply({ ephemeral: true });

            try {
                await tourManager.startTourByDesiredRole(interaction, role.id);
                // tourManager.startTourByDesiredRole will handle its own follow-up messages.
    } catch (error) {
                console.error(`[bot.js] Error calling startTourByDesiredRole for role ${role.name} (ID: ${role.id}):`, error);
                // Generic fallback error for the user if tourManager didn't send a specific one
                await interaction.editReply({ content: 'An error occurred while trying to start the tour for the selected role.', ephemeral: true }).catch(e => console.error("Error sending fallback error for request_tour:", e));
            }
            return; // Handled
        }
    }

    // Handle tour buttons FIRST, as they operate in DMs (no guild context for interaction.guild)
    if (interaction.isButton() && (interaction.customId.startsWith('tourNext_') || interaction.customId.startsWith('tourBack_') || interaction.customId.startsWith('tourEnd_'))) {
        console.log(`[bot.js] Routing to tourManager for DM tour interaction ${interaction.id}`);
        await tourManager.handleTourInteraction(interaction);
        return; // Handled
    }

    // Now, for other interactions, enforce guild context
    if (!interaction.guild) {
        console.log(`Interaction ${interaction.id} (CustomID: ${interaction.customId}) ignored (no guild context and not a tour button).`);
        try {
             if (interaction.isRepliable()) {
                 await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
             }
        } catch (e) { console.error("Error replying about missing guild:", e); }
        return; 
    }

    // Handle admin UI interactions (buttons, select menus, modals) - these require a guild
    if (interaction.customId?.startsWith('admin_')) { 
        console.log(`[bot.js] Detected admin interaction: ${interaction.id}, CustomID: ${interaction.customId}`);
        // Check for admin permissions
        if (!interaction.member || !interaction.member.permissions || !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            console.log(`[bot.js] Admin permission check failed for interaction ${interaction.id}`); // Added log
            // For component interactions, we might not be ableto simply reply if already deferred/replied by component handler.
            // The component handlers themselves should ideally manage this, or we can try a followup.
            try {
                if (!interaction.replied && !interaction.deferred) {
                    return interaction.reply({ content: 'You need Administrator permissions to interact with this.', ephemeral: true });
                }
                // If already replied/deferred, can't send a new reply. Maybe followup if appropriate, or rely on component handler's own logic.
                // For now, let's assume component handlers are robust or this will be caught by them.
            } catch (permError) {
                 console.error("[bot.js] Error trying to reply to permission check failure on component:", permError);
            }
            return; 
        }
        console.log(`[bot.js] Admin permission check passed for interaction ${interaction.id}. Routing to adminInteractionHandler...`); // Added log
        try {
            await adminInteractionHandler.handleInteraction(interaction);
            console.log(`[bot.js] adminInteractionHandler finished for ${interaction.id}.`); // Added log
        } catch (handlerError) {
             console.error(`[bot.js] Error occurred within adminInteractionHandler for interaction ${interaction.id}:`, handlerError);
             // Try to reply to the interaction if possible
             const errorMsg = { content: 'An error occurred processing this admin interaction.', ephemeral: true };
             try {
                 if (!interaction.replied && !interaction.deferred) {
                     await interaction.reply(errorMsg);
                 } else {
                     await interaction.followUp(errorMsg);
                 }
             } catch (replyError) {
                 console.error(`[bot.js] Failed to send error reply for interaction ${interaction.id}:`, replyError);
             }
        }
    } else {
        // Log unhandled interactions
        console.log(`[bot.js] Received unhandled interaction ${interaction.id}, Type: ${interaction.type}, CustomID: ${interaction.customId}`); // Modified log
        // Reply to avoid "Interaction failed"
        try {
             if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: 'This interaction is not recognized or is no longer valid.', ephemeral: true });
             }
         } catch (e) { console.error(`[bot.js] Error replying to unhandled interaction ${interaction.id}:`, e); }
    }
});

client.login(process.env.DISCORD_BOT_TOKEN); 