const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('./database.js');
const configManager = require('./configManager.js');

// Moved from bot.js
async function startTourForNewMember(memberOrUser, sourceMsgOrInteraction = null) {
    const user = memberOrUser.user ? memberOrUser.user : memberOrUser; // Handles both Member and User objects
    const guild = memberOrUser.guild;
    const guildId = guild ? guild.id : null;
    const userId = user.id;

    if (!guildId || !guild) {
        const content = "Could not determine the server context for the tour.";
        // Try to reply to source if it's an interaction/message, otherwise attempt DM (though user object might be the only context)
        if (sourceMsgOrInteraction && sourceMsgOrInteraction.reply) {
             await sourceMsgOrInteraction.reply({ content, ephemeral: true }).catch(console.error);
        } else if (sourceMsgOrInteraction && sourceMsgOrInteraction.channel && sourceMsgOrInteraction.channel.send) {
            await sourceMsgOrInteraction.channel.send({ content: `${user}, ${content}` }).catch(console.error);
        } else {
            await user.send(content).catch(console.error);
        }
        return;
    }

    await db.ensureServerConfig(guildId);
    const existingProgress = await db.getUserProgress(userId, guildId);

    if (existingProgress && existingProgress.status === 'in_progress') {
        const content = "It looks like you are already on a tour! Please use the buttons on your existing tour message.";
        if (sourceMsgOrInteraction && sourceMsgOrInteraction.reply) { // If it's an actual interaction or supports .reply
            await sourceMsgOrInteraction.reply({ content, ephemeral: true }).catch(console.error);
        } else if (sourceMsgOrInteraction && sourceMsgOrInteraction.channel && sourceMsgOrInteraction.channel.send) { // If it's a Message object
            await sourceMsgOrInteraction.channel.send({ content: `${user}, ${content}` }).catch(console.error);
        } else { // Fallback to DM
            await user.send(content).catch(console.error);
        }
        return;
    }

    let tourId = null;
    const initialConfig = await configManager.getAndValidateServerConfig(guild);
    tourId = initialConfig ? initialConfig.default_tour_id : null;

    if (!tourId) {
        const tours = await db.getGuildTours(guildId);
        if (tours.length > 0) {
            tourId = tours[0].tour_id;
        } else {
             const defaultStepsContent = [
                JSON.stringify({ title: "Welcome!", description: "This is the first stop of our basic tour!" }),
                JSON.stringify({ title: "Server Rules", description: `Please review our rules in the <#rules_channel_id> channel. Click the link to go directly!` }),
                JSON.stringify({ title: "Announcements", description: `Stay updated! Visit our announcements in the <#announcements_channel_id> channel. Click the link to view the latest updates.` }),
                JSON.stringify({ title: "Guides", description: `Find helpful guides and resources here: <#guides_channel_id>. Click the link to explore!` }),
                JSON.stringify({ title: "Tour End", description: "You've completed the tour!" })
            ];
            tourId = await db.addDefaultTour(
                guildId,
                'Default Server Tour',
                defaultStepsContent.map((content, index) => ({
                    step_number: index,
                    content: content,
                    title: JSON.parse(content).title
                }))
            );
            await db.updateServerConfig(guildId, { default_tour_id: tourId });
        }
    }

    const serverConfigForStep = await configManager.getAndValidateServerConfig(guild);
    const tourSteps = await db.getTourSteps(tourId);

    if (!tourSteps || tourSteps.length === 0) {
        const content = "Welcome! We'd like to give you a tour, but it seems no steps are configured. Please contact an admin.";
        if (sourceMsgOrInteraction && sourceMsgOrInteraction.reply) {
            await sourceMsgOrInteraction.reply({ content, ephemeral: true }).catch(console.error);
        } else if (sourceMsgOrInteraction && sourceMsgOrInteraction.channel && sourceMsgOrInteraction.channel.send) {
            await sourceMsgOrInteraction.channel.send({ content: `${user}, ${content}` }).catch(console.error);
        } else {
            await user.send(content).catch(console.error);
        }
        return;
    }

    await db.startOrUpdateUserTour(userId, guildId, tourId, tourSteps[0].step_id);
    const firstStep = tourSteps[0];

    const { embed, row } = createTourEmbedWithButtons(firstStep, 0, tourSteps.length, guild, serverConfigForStep, tourId, userId);
    const messagePayload = {
        content: `Welcome to ${guild.name}! Let's start your tour:`,
        embeds: [embed],
        components: [row]
    };

    let sentViaDM = false;
    let tourDeliveryAttempted = false;

    try {
        await user.send(messagePayload);
        sentViaDM = true;
        tourDeliveryAttempted = true;
        console.log(`[tourManager] Tour started via DM for ${user.tag} (User ID: ${userId}) in guild ${guild.id}.`);
        // If the original source was a message (e.g., from !start-tour-manually), acknowledge in channel.
        if (sourceMsgOrInteraction && sourceMsgOrInteraction.channel && typeof sourceMsgOrInteraction.channel.send === 'function' && !sourceMsgOrInteraction.isInteraction) { // !sourceMsgOrInteraction.isInteraction to ensure it's a Message
             sourceMsgOrInteraction.channel.send({ content: `I've sent the tour to your DMs, ${user}!` , allowedMentions: { users: [] } }).catch(console.error); // No ping
        }
    } catch (dmError) {
        console.warn(`[tourManager] Could not DM ${user.tag} (User ID: ${userId}) to start tour for guild ${guild.id}. DM Error: ${dmError.message}.`);
        // If source was a message (e.g. from !start-tour-manually), try to reply in channel as fallback.
        if (sourceMsgOrInteraction && sourceMsgOrInteraction.reply && typeof sourceMsgOrInteraction.reply === 'function' && !sourceMsgOrInteraction.isInteraction) {
            try {
                await sourceMsgOrInteraction.reply({ ...messagePayload, ephemeral: false }); // Explicitly not ephemeral, this is a public fallback
                tourDeliveryAttempted = true;
                console.log(`[tourManager] Tour started via channel reply (DM failed) for ${user.tag} in guild ${guild.id}.`);
            } catch (replyError) {
                console.error(`[tourManager] Failed to send channel reply fallback for ${user.tag} after DM fail:`, replyError);
                // If channel reply also fails, re-throw original dmError so bot.js can handle generic fallback
                throw dmError;
            }
        } else {
            // This is likely from guildMemberAdd and DM failed, or source was an interaction where DM was the only method.
            // Re-throw for bot.js to handle its fallback message or for interaction error handler.
            console.log(`[tourManager] DM failed for ${user.tag} (likely guildMemberAdd or DM-only interaction path), re-throwing.`);
            throw dmError;
        }
    }

    if (tourDeliveryAttempted) {
        await db.logTourEvent(guildId, tourId, userId, 'tour_started_auto_or_manual', firstStep.step_id);
    }
}

// Moved from bot.js
function createTourEmbedWithButtons(step, currentStepIndex, totalSteps, guild, serverConfig, tourId, userId) {
    let stepContent = {};
    try {
        stepContent = JSON.parse(step.content);
    } catch (e) {
        stepContent.description = step.content; // Fallback if content is not JSON
    }

    const serverName = guild ? guild.name : "Server";
    let description = stepContent.description || 'No description for this step.';

    if (guild && serverConfig) {
        // Replace placeholders using IDs from validated serverConfig
        if (serverConfig.rules_channel_id && description.includes('<#rules_channel_id>')) {
            description = description.replace(/<#rules_channel_id>/g, `<#${serverConfig.rules_channel_id}>`);
        }
        if (serverConfig.announcements_channel_id && description.includes('<#announcements_channel_id>')) {
            description = description.replace(/<#announcements_channel_id>/g, `<#${serverConfig.announcements_channel_id}>`);
        }
        if (serverConfig.guides_channel_id && description.includes('<#guides_channel_id>')) {
            description = description.replace(/<#guides_channel_id>/g, `<#${serverConfig.guides_channel_id}>`);
        }

        // On last step, add a link to #general if it exists (using name lookup still)
        if (currentStepIndex === totalSteps - 1) {
            const generalChannel = guild.channels.cache.find(c => c.name.toLowerCase() === 'general');
            if (generalChannel) {
                description += `\nFeel free to explore the server and join the conversation in <#${generalChannel.id}>!`;
            }
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(stepContent.title || 'Tour Step')
        .setDescription(description)
        .setColor(0x00FF00)
        .setFooter({ text: `${serverName} Tour` })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`tourBack_${tourId}_${userId}`)
                .setLabel('Back')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentStepIndex === 0),
            new ButtonBuilder()
                .setCustomId(`tourNext_${tourId}_${userId}`)
                .setLabel(currentStepIndex === totalSteps - 1 ? 'Finish' : 'Next')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`tourEnd_${tourId}_${userId}`)
                .setLabel('End Tour')
                .setStyle(ButtonStyle.Danger)
        );

    return { embed, row };
}

// New function to handle tour button interactions
async function handleTourInteraction(interaction) {
    const userId = interaction.user.id;
    // Custom ID format: action_tourId_buttonUserId
    const [action, tourIdFromButtonStr, buttonUserId] = interaction.customId.split('_');

    if (buttonUserId && buttonUserId !== userId) {
        await interaction.reply({ content: "This button isn't for you!", ephemeral: true });
        return;
    }

    const tourId = parseInt(tourIdFromButtonStr);
    if (isNaN(tourId)) {
        console.error(`[handleTourInteraction] Invalid tourId parsed from customId: ${interaction.customId}`);
        await interaction.reply({ content: "Invalid tour information on this button.", ephemeral: true });
        return;
    }

    try {
        const tourDetails = await db.getTourDetails(tourId);
        if (!tourDetails) {
            await interaction.reply({ content: "This tour no longer exists.", ephemeral: true });
            return;
        }
        const guildId = tourDetails.guild_id;
        const guild = interaction.client.guilds.cache.get(guildId); 
        if (!guild) {
            await interaction.reply({ content: 'Could not determine server context for this tour button. The bot may no longer be in that server.', ephemeral: true });
            return;
        }

        // Use the new specific function to get user progress for this tour
        const userProgress = await db.getUserProgressForSpecificTour(userId, guildId, tourId);
        const serverConfig = await configManager.getAndValidateServerConfig(guild); // Fetch validated server config

        if (!userProgress || userProgress.status !== 'in_progress' || userProgress.tour_id !== tourId) {
            await interaction.reply({ content: "It seems you're not on this tour, your session has expired, or this button is outdated. Please try starting the tour again if needed.", ephemeral: true });
            return;
        }

        const tourSteps = await db.getTourSteps(userProgress.tour_id);
        if (!tourSteps || tourSteps.length === 0) {
            await db.endUserTour(userId, guildId, userProgress.tour_id, 'error_no_steps');
            await interaction.update({ content: "Error: The tour seems to have no steps. Ending tour. Please contact an admin.", embeds: [], components: [] });
            return;
        }

        const currentStepIndex = tourSteps.findIndex(s => s.step_id === userProgress.current_step_id);
        if (currentStepIndex === -1) {
             await db.endUserTour(userId, guildId, userProgress.tour_id, 'error_step_not_found');
             await interaction.update({ content: "Error: Could not find your current tour step. Ending tour. Please try starting again.", embeds: [], components: [] });
             return;
        }

        let nextStepIndex = -1;

        if (action === 'tourNext') {
            if (currentStepIndex < tourSteps.length - 1) {
                nextStepIndex = currentStepIndex + 1;
            } else {
                // Tour Completion Logic
                await db.logTourEvent(guildId, userProgress.tour_id, userId, 'tour_completed_button', userProgress.current_step_id);
                let completionMessage = "You've completed the tour! Thank you.";
                const finalEmbed = new EmbedBuilder()
                    .setTitle("Tour Completed!")
                    .setColor(0x00FF00)
                    .setFooter({ text: `${guild.name} Tour` })
                    .setTimestamp();

                try { // Outer try for the entire completion block
                    await db.logTourEvent(guildId, userProgress.tour_id, userId, 'get_tour_details_started', null);
                    const tourDetailsFromDb = await db.getTourDetails(userProgress.tour_id);
                    await db.logTourEvent(guildId, userProgress.tour_id, userId, 'get_tour_details_succeeded', null, tourDetailsFromDb ? JSON.stringify({ found: true, id: tourDetailsFromDb.tour_id }) : JSON.stringify({ found: false }));

                    if (!tourDetailsFromDb) {
                        console.error(`[tourManager] CRITICAL: tourDetailsFromDb is null for tour_id ${userProgress.tour_id}. Cannot proceed with role assignment.`);
                        await db.logTourEvent(guildId, userProgress.tour_id, userId, 'tour_details_null_error', null, JSON.stringify({ tourId: userProgress.tour_id }));
                        // Update interaction to inform user, then return
                        finalEmbed.setDescription(completionMessage + " (Error: Tour details not found, cannot process completion fully.)");
                        await interaction.update({ content: null, embeds: [finalEmbed], components: [] });
                        await db.completeUserTour(userId, guildId, userProgress.tour_id); // Still mark as complete
                        return;
                    }

                    let memberForRoleAssign = null;
                    if (guild) {
                        await db.logTourEvent(guildId, userProgress.tour_id, userId, 'fetch_member_for_role_started', null);
                        console.log(`[tourManager] Attempting to fetch member ${userId} from guild ${guild.id} for role assignment during tour completion.`);
                        let fetchError = null;
                        memberForRoleAssign = await guild.members.fetch(userId).catch(err => {
                            console.error(`[tourManager] FAILED to fetch member ${userId} from guild ${guild.id} for role assignment:`, err);
                            fetchError = err.message || 'Unknown fetch error';
                            return null;
                        });
                        await db.logTourEvent(guildId, userProgress.tour_id, userId, 'fetch_member_for_role_completed', null, JSON.stringify({ success: !!memberForRoleAssign, memberId: userId, error: fetchError }));
                    } else {
                        await db.logTourEvent(guildId, userProgress.tour_id, userId, 'fetch_member_skipped_no_guild', null);
                    }

                    if (tourDetailsFromDb.completion_role_id) {
                        if (memberForRoleAssign) {
                            try {
                                const role = await guild.roles.fetch(tourDetailsFromDb.completion_role_id);
                                if (role) {
                                    if (!memberForRoleAssign.roles.cache.has(role.id)) {
                                        await memberForRoleAssign.roles.add(role);
                                        completionMessage += ` You have been granted the '${role.name}' role.`;
                                        await db.logTourEvent(guildId, userProgress.tour_id, userId, 'completion_role_assigned', null, JSON.stringify({ roleId: role.id, roleName: role.name }));
                                    } else {
                                        completionMessage += ` You already have the '${role.name}' role.`;
                                        await db.logTourEvent(guildId, userProgress.tour_id, userId, 'completion_role_already_possessed', null, JSON.stringify({ roleId: role.id, roleName: role.name }));
                                    }
                                } else {
                                    console.warn(`[tourManager] Configured completion role ID ${tourDetailsFromDb.completion_role_id} not found in guild ${guild.id}.`);
                                    completionMessage += ` (A configured completion role was not found.)`;
                                    await db.logTourEvent(guildId, userProgress.tour_id, userId, 'completion_role_not_found', null, JSON.stringify({ roleId: tourDetailsFromDb.completion_role_id }));
                                }
                            } catch (roleError) {
                                console.error(`[tourManager] Error processing or assigning configured role ${tourDetailsFromDb.completion_role_id} to user ${userId} in guild ${guild.id}:`, roleError);
                                completionMessage += ` (There was an issue assigning a completion role.)`;
                                const errorDetails = { roleId: tourDetailsFromDb.completion_role_id, error: roleError.message };
                                if (roleError.code) errorDetails.code = roleError.code;
                                await db.logTourEvent(guildId, userProgress.tour_id, userId, 'completion_role_assign_error', null, JSON.stringify(errorDetails));
                            }
                        } else { // memberForRoleAssign is null
                            console.warn(`[tourManager] Member object could not be obtained for user ${userId} in guild ${guild.id} for role assignment.`);
                            completionMessage += ` (Could not assign role as member context is unavailable.)`;
                            await db.logTourEvent(guildId, userProgress.tour_id, userId, 'completion_role_member_unavailable', null, JSON.stringify({ roleId: tourDetailsFromDb.completion_role_id, reason: 'Member not fetched or not found' }));
                        }
                    } else {
                        await db.logTourEvent(guildId, userProgress.tour_id, userId, 'completion_role_not_configured', null);
                        // No specific completion role ID was set for this tour.
                    }
                    finalEmbed.setDescription(completionMessage);

                    if (memberForRoleAssign && guild) {
                        const generalChannel = guild.channels.cache.find(c => c.name === 'general') || guild.systemChannel;
                        if (generalChannel) {
                            generalChannel.send(`<@${userId}> has completed the server tour!`).catch(console.error);
                        }
                    }
                    await interaction.update({ content: null, embeds: [finalEmbed], components: [] });
                    await db.completeUserTour(userId, guildId, userProgress.tour_id);
                } catch (blockError) {
                    console.error("[tourManager] CRITICAL ERROR in tour completion block:", blockError);
                    await db.logTourEvent(guildId, userProgress.tour_id, userId, 'tour_completion_block_error', null, JSON.stringify({ error: blockError.message, stack: blockError.stack ? blockError.stack.split('\n').slice(0,5).join('; ') : null }));
                    // Attempt to inform the user, even if some prior logic failed.
                    try {
                        const errorEmbed = new EmbedBuilder()
                            .setTitle("Tour Completed with Issues")
                            .setDescription("You've completed the tour, but an internal error occurred while finalizing. Please contact an admin.")
                            .setColor(0xFFFF00) // Yellow for warning
                            .setFooter({ text: `${guild.name} Tour` })
                            .setTimestamp();
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                        } else {
                            await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                        }
                    } catch (finalErrorReplyError) {
                        console.error("[tourManager] Failed to send final error reply to user:", finalErrorReplyError);
                    }
                }
                return;
            }
        } else if (action === 'tourBack') {
            if (currentStepIndex > 0) {
                nextStepIndex = currentStepIndex - 1;
            } else {
                await interaction.reply({ content: "You are at the beginning of the tour.", ephemeral: true });
                return;
            }
        } else if (action === 'tourEnd') {
            // Tour End Logic
            const generalChannel = guild.channels.cache.find(c => c.name === 'general');
            if (generalChannel) {
                generalChannel.send(`<@${userId}> has ended the server tour and is now in #general.`).catch(() => {});
            }
            await db.endUserTour(userId, guildId, userProgress.tour_id, 'user_exited_button');
            await db.logTourEvent(guildId, userProgress.tour_id, userId, 'tour_exited_button', userProgress.current_step_id);

            // Assign 'member' role - This logic is for when a user EXITS the tour, not completes it.
            // This can be reviewed separately if its behavior needs to change.
            // For now, ensure member object is fetched for DM context as well if this is to be kept.
            try {
                let memberForExitRoleAssign = interaction.member;
                if (!memberForExitRoleAssign && guild) {
                    memberForExitRoleAssign = await guild.members.fetch(userId).catch(() => null);
                }

                const roleName = 'member'; // This is still hardcoded for tour EXITS
                const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
                
                if (role && memberForExitRoleAssign && !memberForExitRoleAssign.roles.cache.has(role.id)) {
                     await memberForExitRoleAssign.roles.add(role);
                     console.log(`[tourManager] Assigned '${roleName}' role to ${interaction.user.tag} after tour exit.`);
                } else if (!role) {
                    console.warn(`[tourManager] Role '${roleName}' not found in guild ${guildId} for tour exit assignment.`);
                }
            } catch (roleError) {
                console.error(`[tourManager] Error assigning '${'member'}' role on tour exit for user ${userId}:`, roleError);
            }

            const endEmbed = new EmbedBuilder()
                .setTitle("Tour Ended")
                .setDescription("You have exited the tour.")
                .setColor(0xFF0000)
                .setFooter({ text: `${guild.name} Tour` })
                .setTimestamp();
            await interaction.update({ content: "Tour ended.", embeds: [endEmbed], components: [] });
            return;
        }

        // Navigate to next/previous step
        if (nextStepIndex !== -1) {
            const nextStep = tourSteps[nextStepIndex];
            await db.updateUserProgress(userId, guildId, userProgress.tour_id, nextStep.step_id);
            // Pass validated serverConfig
            const { embed, row } = createTourEmbedWithButtons(nextStep, nextStepIndex, tourSteps.length, guild, serverConfig, userProgress.tour_id, userId);
            await interaction.update({ embeds: [embed], components: [row] });
            await db.logTourEvent(guildId, userProgress.tour_id, userId, 'step_viewed_button', nextStep.step_id);
        } else if (action !== 'tourBack') {
             await interaction.reply({ content: "Could not determine the next action or you are at an edge of the tour.", ephemeral: true });
        }

    } catch (error) {
        console.error('Error processing button interaction:', error);
        const errorMessage = 'Sorry, something went wrong while processing your action. Please try again.';
        try {
             if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
             console.error('Error sending error follow-up message:', followUpError);
        }
    }
}

async function startTourByDesiredRole(interaction, desiredRoleId) {
    const guild = interaction.guild;
    const user = interaction.user;
    const member = interaction.member;
    const guildId = guild.id;
    const userId = user.id;

    try {
        // 1. Check if user already has the role
        if (member.roles.cache.has(desiredRoleId)) {
            await interaction.editReply({ content: "You already have the role this tour grants! No need to start the tour.", ephemeral: true });
            return;
        }

        // 2. Find a tour that grants this role
        const allGuildTours = await db.getGuildTours(guildId);
        const targetTour = allGuildTours.find(tour => tour.completion_role_id === desiredRoleId);

        if (!targetTour) {
            const desiredRoleName = guild.roles.cache.get(desiredRoleId)?.name || 'the selected role';
            await interaction.editReply({ content: `Sorry, no tour is currently configured to grant the "${desiredRoleName}".`, ephemeral: true });
            return;
        }

        const tourId = targetTour.tour_id;

        // 3. Check existing tour progress for the user in this guild
        const existingProgress = await db.getUserProgress(userId, guildId);

        if (existingProgress && existingProgress.status === 'in_progress') {
            if (existingProgress.tour_id === tourId) {
                await interaction.editReply({ content: "It looks like you are already on this specific tour! Please use the buttons on your existing tour message, or type `/tour end` if you wish to restart (this will reset your progress).", ephemeral: true });
            } else {
                const currentTourName = (await db.getTourDetails(existingProgress.tour_id))?.tour_name || 'another tour';
                await interaction.editReply({ content: `You are currently in progress on "${currentTourName}". Please complete or end your current tour before starting a new one.`, ephemeral: true });
            }
            return;
        }
        
        // 4. Start the tour (adapted from startTourForNewMember/createTourEmbedWithButtons)
        await db.ensureServerConfig(guildId); // Ensure config for placeholders
        const serverConfigForStep = await configManager.getAndValidateServerConfig(guild);
        const tourSteps = await db.getTourSteps(tourId);

        if (!tourSteps || tourSteps.length === 0) {
            await interaction.editReply({ content: `The tour for "${targetTour.tour_name}" has no steps configured. Please contact an admin.`, ephemeral: true });
            return;
        }

        await db.startOrUpdateUserTour(userId, guildId, tourId, tourSteps[0].step_id);
        const firstStep = tourSteps[0];

        const { embed, row } = createTourEmbedWithButtons(firstStep, 0, tourSteps.length, guild, serverConfigForStep, tourId, userId);
        const messagePayload = {
            content: `Starting the tour: "${targetTour.tour_name}"! Here is the first step:`, 
            embeds: [embed],
            components: [row]
        };

        // Always send publicly in the interaction channel
        await interaction.editReply({ ...messagePayload, ephemeral: false });
        await db.logTourEvent(guildId, tourId, userId, 'tour_started_via_request_role_public', firstStep.step_id, JSON.stringify({ roleId: desiredRoleId}));

    } catch (error) {
        console.error(`[tourManager] Error in startTourByDesiredRole for role ${desiredRoleId}, user ${userId}:`, error);
        // Ensure the deferred reply is handled, even if an unexpected error occurs early
        // Check if interaction is still deferrable and not yet replied to
        if (interaction.deferred && !interaction.replied && !interaction.ephemeral) { // Check if not already replied/followed up
            try {
                await interaction.editReply({ content: 'An unexpected error occurred while trying to start the tour for the selected role. Please try again later.', ephemeral: true });
            } catch (e) {
                console.error("[tourManager] startTourByDesiredRole emergency fallback editReply failed:", e);
                // If editReply fails (e.g. token expired), try to followUp if it's a command interaction
                if (interaction.isCommand()) { 
                    await interaction.followUp({ content: 'An unexpected error occurred and I could not update the original message. Please try again later.', ephemeral: true }).catch(fe => console.error("[tourManager] startTourByDesiredRole emergency followUp failed:", fe));
                }
            }
        } else if (!interaction.replied && !interaction.deferred) {
            // If not deferred and not replied, attempt a direct reply (less likely path here due to bot.js deferring)
            try {
                await interaction.reply({ content: 'An unexpected error occurred very early. Please try again.', ephemeral: true });
            } catch (re) {
                 console.error("[tourManager] startTourByDesiredRole emergency reply failed:", re);
            }
        }
    }
}

module.exports = {
    startTourForNewMember,
    handleTourInteraction,
    startTourByDesiredRole // Export the new function
    // createTourEmbedWithButtons is only used internally now, no need to export unless needed elsewhere
}; 