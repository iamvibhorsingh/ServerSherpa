const db = require('../db/database.js');

// Helper function to get and validate server config, and update DB if necessary
async function getAndValidateServerConfig(guild) {
    // Note: Removed db parameter, require it directly at the top
    if (!guild) {
        console.error("getAndValidateServerConfig called without a guild object.");
        return null; // Or throw an error, or return a default minimal config
    }
    let currentConfig = await db.getServerConfig(guild.id);
    if (!currentConfig) {
        console.warn(`No server config found for guild ${guild.id} in getAndValidateServerConfig. Ensuring one now.`);
        await db.ensureServerConfig(guild.id); // Attempt to create it if missing
        currentConfig = await db.getServerConfig(guild.id); // Try fetching again
        if (!currentConfig) {
            console.error(`Failed to get or create server config for guild ${guild.id}.`);
            return {}; // Return empty or default to prevent further errors
        }
    }

    const channelTypesToValidate = [
        { key: 'rules_channel_id', name: 'rules', displayName: 'Rules' },
        { key: 'announcements_channel_id', name: 'announcements', displayName: 'Announcements' },
        { key: 'guides_channel_id', name: 'guides', displayName: 'Guides' }
    ];

    let configWasUpdated = false;
    for (const type of channelTypesToValidate) {
        const storedChannelId = currentConfig[type.key];
        let channelIsValid = false;

        if (storedChannelId) {
            const existingChannel = guild.channels.cache.get(storedChannelId);
            if (existingChannel) {
                channelIsValid = true;
            } else {
                console.warn(`Stored ${type.displayName} channel ID ${storedChannelId} for guild ${guild.name} (${guild.id}) is invalid or channel no longer exists.`);
            }
        }

        if (!channelIsValid) {
            // Try finding text channel (type 0) by name
            const foundChannelByName = guild.channels.cache.find(c => c.name.toLowerCase() === type.name.toLowerCase() && c.type === 0);
            if (foundChannelByName) {
                console.log(`Found ${type.displayName} channel "${foundChannelByName.name}" by name in guild ${guild.name} (${guild.id}). Updating config from ${storedChannelId || 'not set'} to ${foundChannelByName.id}.`);
                try {
                    // Use the dynamic updateServerConfig
                    const updateData = {};
                    updateData[type.key] = foundChannelByName.id;
                    await db.updateServerConfig(guild.id, updateData);
                    currentConfig[type.key] = foundChannelByName.id; // Update local copy
                    configWasUpdated = true;
                } catch (error) {
                    console.error(`Error updating ${type.displayName} channel ID in DB for guild ${guild.id}:`, error);
                }
            } else {
                if (storedChannelId) { // Only warn if there was an invalid ID previously
                    console.warn(`Could not find a fallback ${type.displayName} channel by name ('${type.name}') for guild ${guild.name} (${guild.id}) to replace invalid ID ${storedChannelId}.`);
                } else {
                     console.info(`No ${type.displayName} channel configured and no default channel named '${type.name}' found for guild ${guild.name} (${guild.id}).`);
                }
            }
        }
    }

    // If updates were made, the local currentConfig object reflects them.
    // If no updates were made, it's the original config from the DB.
    return currentConfig;
}

module.exports = {
    getAndValidateServerConfig
}; 