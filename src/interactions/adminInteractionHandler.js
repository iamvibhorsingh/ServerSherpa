const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, InteractionType } = require('discord.js');
const db = require('../db/database.js');

// --- Main Menu --- 
async function sendMainMenu(interactionOrMessage) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Tour Admin: Main Menu')
        .setDescription('Select an option to manage tours:');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('admin_list_tours')
                .setLabel('List Tours')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('admin_create_tour_start')
                .setLabel('Create Tour')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('admin_select_tour_menu')
                .setLabel('Manage Existing Tour')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('admin_set_role_select_tour_menu')
                .setLabel('Set Tour Completion Role')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('admin_killswitch')
                .setLabel('End Interaction')
                .setStyle(ButtonStyle.Danger)
        );
    
    const payload = { embeds: [embed], components: [row], ephemeral: true };

    try {
        if (interactionOrMessage.type === InteractionType.ApplicationCommand) {
            // Initial call from slash command
            await interactionOrMessage.reply(payload);
        } else if (interactionOrMessage.isMessageComponent()) {
            // Subsequent navigation from a button/select menu click
            await interactionOrMessage.update(payload);
        } else if (interactionOrMessage.constructor?.name === 'Message') { // Legacy text command
            console.warn("sendMainMenu was called with a Message object. This path is deprecated.");
            await interactionOrMessage.reply('Please use the `/touradmin tour menu` slash command instead.');
        } else {
            console.error('sendMainMenu received an unhandled source type:', interactionOrMessage);
            let identifiableSource = interactionOrMessage;
            if (interactionOrMessage.isInteraction) identifiableSource = interactionOrMessage.toJSON(); // Log more details if it's an interaction
            console.error('Detailed source object:', identifiableSource);

            // Attempt to inform the user if possible, even if the source type is unexpected
            if (interactionOrMessage.isInteraction && (interactionOrMessage.replied || interactionOrMessage.deferred)) {
                await interactionOrMessage.followUp({ content: "Error: Could not display menu due to an unexpected interaction type.", ephemeral: true }).catch(e => console.error("sendMainMenu fallback followup error:", e));
            } else if (interactionOrMessage.isInteraction && !interactionOrMessage.replied && !interactionOrMessage.deferred) {
                await interactionOrMessage.reply({ content: "Error: Could not display menu due to an unexpected interaction type.", ephemeral: true }).catch(e => console.error("sendMainMenu fallback reply error:", e));
            } else if (typeof interactionOrMessage.channel?.send === 'function') { // Fallback for non-interaction types with a channel
                await interactionOrMessage.channel.send({content: "Error: Could not display menu due to an unknown source.", ephemeral: false}).catch(e => console.error("sendMainMenu fallback channel.send error:", e));
            }
        }
    } catch (error) {
        console.error('Error in sendMainMenu:', error);
        // Error reporting for known interaction types
        if (interactionOrMessage.isInteraction) {
            const interaction = interactionOrMessage;
            const errorPayload = { content: 'Error displaying main menu.', ephemeral: true, embeds:[], components:[] };
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply(errorPayload);
                } else {
                    await interaction.editReply(errorPayload).catch(async e_edit => {
                        console.error("sendMainMenu error handler: editReply failed, trying followup:", e_edit);
                        await interaction.followUp(errorPayload).catch(e_follow => console.error("sendMainMenu error handler: followup also failed:", e_follow));
                    });
                }
            } catch (e) {
                console.error("sendMainMenu: Critical error in error reporting for interaction:", e);
            }
        }
    }
}

// --- Tour Management Menu --- 
async function sendTourManagementMenu(interaction, tourId, statusMessage = null) {
    console.log(`[sendTourManagementMenu] INVOKED for tourId: ${tourId}, interactionId: ${interaction.id}`); 
    try {
        const tour = await db.findTourByNameOrId(interaction.guildId, tourId);
        if (!tour) {
            await interaction.update({ content: `Error: Tour with ID ${tourId} not found.`, embeds: [], components: [], ephemeral: true });
            return;
        }
        const config = await db.getServerConfig(interaction.guildId);
        const isDefault = config && config.default_tour_id === tourId;

        let description = `Description: ${tour.description || 'N/A'}\nCompletion Role: ${tour.completion_role_id ? 'Configured' : 'Not set'}\n${isDefault ? '✨ This is the default tour.' : ''}`;
        if (statusMessage) {
            description = `${statusMessage}\n\n${description}`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`Manage Tour: ${tour.tour_name}`)
            .setDescription(description)
            .setColor(0x0099FF);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`admin_manage_steps_menu_${tourId}`)
                    .setLabel('Manage Steps')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`admin_set_default_tour_${tourId}`)
                    .setLabel(isDefault ? 'Unset Default' : 'Set as Default')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`admin_delete_tour_confirm_${tourId}`)
                    .setLabel('Delete Tour')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('admin_back_to_select_tour') 
                    .setLabel('Back to Tour List')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('admin_killswitch')
                    .setLabel('End Interaction')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.update({ embeds: [embed], components: [row], ephemeral: true });
    } catch (error) {
        console.error(`Error sending tour management menu for tour ${tourId}:`, error);
        const errorMessage = { content: 'Failed to display tour management options.', embeds: [], components: [], ephemeral: true };
        if (interaction.replied || interaction.deferred) { 
            await interaction.editReply(errorMessage).catch(async e => {
                console.error("Error in sendTourManagementMenu editReply (catch), trying followup:", e);
                await interaction.followUp(errorMessage).catch(e2 => console.error("Error in sendTourManagementMenu followup (catch):", e2));
            });
        } else {
            await interaction.reply(errorMessage).catch(e2 => console.error("Error in sendTourManagementMenu reply (catch, unexpected path):", e2));
        }
    }
}

async function handleListTours(interaction) {
    try {
        const tours = await db.getGuildTours(interaction.guildId);
        let description = 'No tours found for this server.';
        let embedTitle = 'Available Tours';

        if (tours && tours.length > 0) {
            const config = await db.getServerConfig(interaction.guildId);
            const defaultTourId = config?.default_tour_id;
            description = tours.map(tour => {
                let tourNameLine = `• ${tour.tour_name}`;
                if (tour.tour_id === defaultTourId) {
                    tourNameLine += ' ✨ Default';
                }
                return tourNameLine;
            }).join('\n');
        } else {
            embedTitle = 'No Tours Found';
        }

        const embed = new EmbedBuilder().setTitle(embedTitle).setDescription(description).setColor(0x0099FF);
        
        const backButton = new ButtonBuilder().setCustomId('admin_back_to_main_menu').setLabel('Back to Main Menu').setStyle(ButtonStyle.Secondary);
        const killSwitchButton = new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End Interaction').setStyle(ButtonStyle.Danger);
        const actionRow = new ActionRowBuilder().addComponents(backButton, killSwitchButton);

        await interaction.update({ embeds: [embed], components: [actionRow], ephemeral: true });
    } catch (error) {
        console.error('Error fetching or listing tours:', error);
        const errorMessage = { content: 'Failed to fetch tours.', ephemeral: true, embeds: [], components: [] };
        if (interaction.replied || interaction.deferred) { 
            await interaction.editReply(errorMessage).catch(async e => {
                console.error("Error in handleListTours editReply (catch), trying followup:", e);
                await interaction.followUp(errorMessage).catch(e2 => console.error("Error in handleListTours followup (catch):", e2));
            });
        } else {
            await interaction.reply(errorMessage).catch(e => console.error("Error in handleListTours reply (catch, unexpected path):", e));
        }
    }
}

async function sendSelectTourMenu(interaction) {
    try {
        const tours = await db.getGuildTours(interaction.guildId);
        const payload = { embeds: [], components: [], ephemeral: true };

        if (!tours || tours.length === 0) {
            payload.embeds.push(new EmbedBuilder().setColor(0xFFCC00).setTitle('Manage Tours').setDescription('No tours found. Create one first.'));
            const backButtonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_back_to_main_menu').setLabel('Back to Main Menu').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End Interaction').setStyle(ButtonStyle.Danger)
            );
            payload.components = [backButtonRow];
        } else {
            const options = tours.slice(0, 25).map(tour => ({
                label: tour.tour_name.substring(0, 100),
                description: (tour.description || 'No description').substring(0, 100),
                value: tour.tour_id.toString(),
            }));
            const selectMenu = new StringSelectMenuBuilder().setCustomId('admin_select_tour_manage').setPlaceholder('Choose a tour to manage').addOptions(options);
            const row = new ActionRowBuilder().addComponents(selectMenu);
            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_back_to_main_menu').setLabel('Back to Main Menu').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('admin_killswitch').setLabel('Cancel & End').setStyle(ButtonStyle.Danger)
            );
            payload.embeds.push(new EmbedBuilder().setTitle('Manage Existing Tour').setDescription('Select a tour:').setColor(0x0099FF));
            payload.components = [row, cancelRow];
        }
        
        await interaction.update(payload);
    } catch (error) {
        console.error('Error sending select tour menu:', error);
        const errorMessage = { content: 'Failed to load tour selection.', embeds: [], components: [], ephemeral: true };
        if (interaction.replied || interaction.deferred) {
             await interaction.editReply(errorMessage).catch(async e => {
                console.error("Error in sendSelectTourMenu editReply (catch), trying followup:", e);
                await interaction.followUp(errorMessage).catch(e2 => console.error("Error in sendSelectTourMenu followup (catch):", e2));
            });
        } else {
            await interaction.reply(errorMessage).catch(e2 => console.error("Error in sendSelectTourMenu reply (catch, unexpected path):", e2));
        }
    }
}

async function sendStepManagementMenu(interaction, tourId) {
    try {
        const tour = await db.findTourByNameOrId(interaction.guildId, tourId);
        if (!tour) {
            await interaction.update({ content: `Error: Tour ${tourId} not found.`, ephemeral: true, embeds:[], components:[] });
            return;
        }
        const steps = await db.getTourSteps(tourId);
        let stepList = 'No steps added.';
        if (steps && steps.length > 0) {
            stepList = steps.map(step => {
                let title = JSON.parse(step.content)?.title || '(No Title)';
                title = title.length > 50 ? title.substring(0, 47) + '...' : title;
                return `\`${step.step_number}:\` ${title}`;
            }).join('\n');
            if (stepList.length > 4000) stepList = stepList.substring(0, 4000) + '\n... (truncated)';
        }

        const embed = new EmbedBuilder().setTitle(`Steps for: ${tour.tour_name}`).setDescription(`**Current Steps:**\n${stepList}`).setColor(0x1E90FF);
        const mainActionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_add_step_channel_select_start_${tourId}`).setLabel('Add Step').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`admin_edit_step_select_${tourId}`).setLabel('Edit Step').setStyle(ButtonStyle.Primary).setDisabled(!steps || steps.length === 0),
            new ButtonBuilder().setCustomId(`admin_remove_step_select_${tourId}`).setLabel('Remove Step').setStyle(ButtonStyle.Danger).setDisabled(!steps || steps.length === 0),
            new ButtonBuilder().setCustomId(`admin_reorder_step_start_${tourId}`).setLabel('Reorder Steps').setStyle(ButtonStyle.Secondary).setDisabled(!steps || steps.length < 2)
        );
        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_back_to_manage_tour_${tourId}`).setLabel('Back to Tour').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End Interaction').setStyle(ButtonStyle.Danger)
        );

        await interaction.update({ embeds: [embed], components: [mainActionRow, navigationRow], ephemeral: true });
    } catch (error) {
        console.error(`Error sendStepManagementMenu for ${tourId}:`, error);
        const errorMsg = { content: 'Failed to load step management.', ephemeral: true, embeds:[], components:[] };
        if (interaction.replied || interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("sSMM err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("sSMM err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("sSMM err reply, unexpected",e));
        }
    }
}

async function sendAddStepModal(interaction, tourId) {
    const modal = new ModalBuilder().setCustomId(`admin_add_step_modal_${tourId}`).setTitle('Add New Step');
    const stepTitleInput = new TextInputBuilder().setCustomId('step_title_input').setLabel("Step Title").setStyle(TextInputStyle.Short).setPlaceholder('e.g., Welcome').setRequired(true).setMaxLength(100);
    const stepDescriptionInput = new TextInputBuilder().setCustomId('step_description_input').setLabel("Step Description").setStyle(TextInputStyle.Paragraph).setPlaceholder('Use <#channel_id> for links.').setRequired(true).setMaxLength(1900);
    modal.addComponents(new ActionRowBuilder().addComponents(stepTitleInput), new ActionRowBuilder().addComponents(stepDescriptionInput));
    try {
        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error showing add step modal:', error);
        const errorPayload = { content: 'Failed to open form.', ephemeral: true };
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(errorPayload).catch(e => console.error("sendAddStepModal reply err", e));
        } else if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorPayload).catch(e => console.error("sendAddStepModal followup err", e));
        }
    }
}

async function handleAddStepSubmit(interaction, tourId) {
    try {
        const stepTitle = interaction.fields.getTextInputValue('step_title_input');
        const stepDescription = interaction.fields.getTextInputValue('step_description_input');
        const stepContentJson = JSON.stringify({ title: stepTitle, description: stepDescription });
        const { stepId, assignedStepNumber } = await db.addTourStep(tourId, null, stepTitle, stepContentJson);
        
        await interaction.reply({ content: `✅ Step "${stepTitle}" added.`, ephemeral: true });
    } catch (error) {
        console.error(`handleAddStepSubmit for ${tourId}:`, error);
        await interaction.reply({ content: '❌ Failed to add step.', ephemeral: true });
    }
}

async function handleEditStepSelect(interaction, tourId) {
    try {
        const steps = await db.getTourSteps(tourId);
        if (!steps || steps.length === 0) {
            await interaction.update({ content: 'No steps to edit.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        const options = steps.slice(0, 25).map(step => {
            let title = JSON.parse(step.content)?.title || '(No Title)';
            title = title.length > 80 ? title.substring(0, 77) + '...' : title;
            return { label: `Step ${step.step_number}: ${title}`, description: `ID: ${step.step_id}`, value: step.step_id.toString() };
        });
        const selectMenu = new StringSelectMenuBuilder().setCustomId(`admin_edit_step_selected_${tourId}`).setPlaceholder('Choose step to edit').addOptions(options);
        const selRow = new ActionRowBuilder().addComponents(selectMenu);
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_back_to_step_management_${tourId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        );
        await interaction.update({ content: 'Select step to edit:', components: [selRow, navRow], ephemeral: true });
    } catch (error) {
        console.error(`Error handleEditStepSelect for ${tourId}:`, error);
        const errorMsg = { content: 'Failed to load steps for editing.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("hESS err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("hESS err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("hESS err reply, unexpected",e));
        }
    }
}

async function sendEditStepModal(interaction, tourId, stepId) {
    try {
        const step = await db.getTourStepById(stepId);
        if (!step) {
            await interaction.update({ content: 'Error: Step not found.', ephemeral: true, components: [], embeds: [] }); 
            return;
        }
        let { title = '', description = step.content } = JSON.parse(step.content || '{}');
        const modal = new ModalBuilder().setCustomId(`admin_edit_step_modal_${tourId}_${stepId}`).setTitle(`Edit Step ${step.step_number}`);
        const titleInput = new TextInputBuilder().setCustomId('step_title_input').setLabel("Title").setStyle(TextInputStyle.Short).setValue(title).setRequired(true).setMaxLength(100);
        const descInput = new TextInputBuilder().setCustomId('step_description_input').setLabel("Description").setStyle(TextInputStyle.Paragraph).setValue(description).setRequired(true).setMaxLength(1900);
        modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
        
        await interaction.showModal(modal);
    } catch (error) {
        console.error(`Error sendEditStepModal for step ${stepId}:`, error);
        const errorPayload = { content: 'Failed to open edit form.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
             await interaction.followUp(errorPayload).catch(e => console.error("sESM followup err",e));
        } else { 
             await interaction.reply(errorPayload).catch(e => console.error("sESM reply err",e));
        }
    }
}

async function handleEditStepSubmit(interaction, tourId, stepId) {
    try {
        const newTitle = interaction.fields.getTextInputValue('step_title_input');
        const newDescription = interaction.fields.getTextInputValue('step_description_input');
        const newContentJson = JSON.stringify({ title: newTitle, description: newDescription });
        const changes = await db.editTourStep(stepId, newTitle, newContentJson);
        
        await interaction.reply({ content: changes > 0 ? `✅ Step updated!` : `⚠️ Step not found or no changes made.`, ephemeral: true });
    } catch (error) {
        console.error(`Error handleEditStepSubmit for ${stepId}:`, error);
        await interaction.reply({ content: '❌ Failed to update step.', ephemeral: true });
    }
}

async function handleRemoveStepSelect(interaction, tourId) {
    try {
        const steps = await db.getTourSteps(tourId);
        if (!steps || steps.length === 0) {
            await interaction.update({ content: 'No steps to remove.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        const options = steps.slice(0, 25).map(step => {
            let title = JSON.parse(step.content)?.title || '(No Title)';
            title = title.length > 80 ? title.substring(0, 77) + '...' : title;
            return { label: `Step ${step.step_number}: ${title}`, description: `ID: ${step.step_id}`, value: step.step_id.toString() };
        });
        const selectMenu = new StringSelectMenuBuilder().setCustomId(`admin_remove_step_selected_${tourId}`).setPlaceholder('Choose step to remove').addOptions(options);
        const selRow = new ActionRowBuilder().addComponents(selectMenu);
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_back_to_step_management_${tourId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        );
        await interaction.update({ content: 'Select step to remove:', components: [selRow, navRow], ephemeral: true });
    } catch (error) {
        console.error(`Error handleRemoveStepSelect for ${tourId}:`, error);
        const errorMsg = { content: 'Failed to load steps for removal.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("hRSS err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("hRSS err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("hRSS err reply, unexpected",e));
        }
    }
}

async function sendRemoveStepConfirmation(interaction, tourId, stepId) {
    try {
        const step = await db.getTourStepById(stepId);
        if (!step) {
            await interaction.update({ content: 'Error: Step not found.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        let title = JSON.parse(step.content)?.title || '(No Title)';
        const embed = new EmbedBuilder().setTitle('⚠️ Confirm Step Deletion').setDescription(`Delete **Step ${step.step_number}: ${title}**?\nThis renumbers other steps.`).setColor(0xFF0000);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_remove_step_execute_${tourId}_${stepId}`).setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`admin_back_to_step_management_${tourId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        );
        await interaction.update({ embeds: [embed], components: [row], ephemeral: true });
    } catch (error) {
        console.error(`Error sendRemoveStepConfirmation for ${stepId}:`, error);
        const errorMsg = { content: 'Failed to show step deletion confirmation.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("sRSC err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("sRSC err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("sRSC err reply, unexpected",e));
        }
    }
}

async function handleRemoveStepExecute(interaction, tourId, stepId) {
    try {
        const step = await db.getTourStepById(stepId);
        const stepNumber = step ? step.step_number : 'unknown';
        const stepTitle = step ? (JSON.parse(step.content)?.title || '(No Title)') : '';
        
        const deletedCount = await db.deleteTourStepAndRenumber(stepId);

        if (deletedCount > 0) {
            await interaction.update({ content: `✅ Step ${stepNumber}: "${stepTitle}" deleted. Steps renumbered.`, embeds: [], components: [], ephemeral: true });
        } else {
            await interaction.update({ content: 'Error: Step not found or not deleted.', embeds: [], components: [], ephemeral: true });
        }
    } catch (error) {
        console.error(`Error deleting step ${stepId} from ${tourId}:`, error);
        const errorPayload = { content: 'Failed to delete step.', ephemeral: true };
        if (interaction.replied || interaction.deferred) { 
             await interaction.editReply(errorPayload).catch(async e => {
                console.error("hRSE: Err editReply, trying followup",e);
                await interaction.followUp(errorPayload).catch(e2 => console.error("hRSE: Err followup",e2));
            });
        } else {
             await interaction.reply(errorPayload).catch(e => console.error("hRSE: Err reply, unexpected",e));
        }
    }
}

async function handleSetDefaultTour(interaction, tourId) {
    let confirmationMessage;
    try {
        const guildId = interaction.guildId;
        const config = await db.getServerConfig(guildId);
        const currentDefaultTourId = config?.default_tour_id;

        if (currentDefaultTourId === tourId) {
            await db.updateServerConfig(guildId, { default_tour_id: null });
            confirmationMessage = `✅ Tour "${(await db.findTourByNameOrId(guildId, tourId))?.tour_name || tourId}" is no longer default.`;
        } else {
            await db.updateServerConfig(guildId, { default_tour_id: tourId });
            confirmationMessage = `✅ Tour "${(await db.findTourByNameOrId(guildId, tourId))?.tour_name || tourId}" is now default.`;
        }
        
        await sendTourManagementMenu(interaction, tourId, confirmationMessage);
    } catch (error) {
        console.error(`Error setting/unsetting default tour ${tourId}:`, error);
        const errorPayload = { content: 'Failed to update default tour status.', ephemeral: true };
        if (interaction.replied || interaction.deferred) { 
            await interaction.editReply(errorPayload).catch(async e=>{
                console.error("hSDT err editReply, trying followup", e);
                await interaction.followUp(errorPayload).catch(e2=>console.error("hSDT err followup", e2));
            });
        } else {
            await interaction.reply(errorPayload).catch(e=>console.error("hSDT err reply, unexpected", e));
        }
    }
}

async function sendDeleteTourConfirmation(interaction, tourId) {
    try {
        const tour = await db.findTourByNameOrId(interaction.guildId, tourId);
        if (!tour) {
            await interaction.update({ content: 'Error: Tour not found.', embeds: [], components: [], ephemeral: true });
            return;
        }
        const embed = new EmbedBuilder().setTitle(`⚠️ Confirm Deletion: ${tour.tour_name}`).setDescription(`Delete "${tour.tour_name}"? This cannot be undone.`).setColor(0xFF0000);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_delete_tour_execute_${tourId}`).setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`admin_back_to_manage_tour_${tourId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        );
        await interaction.update({ embeds: [embed], components: [row], ephemeral: true });
    } catch (error) {
         console.error(`Error sendDeleteTourConfirmation for ${tourId}:`, error);
         const errorMsg = { content: 'Failed to show delete confirmation.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("sDTC err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("sDTC err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("sDTC err reply, unexpected",e));
        }
    }
}

async function handleDeleteTourExecute(interaction, tourId) {
    try {
        const tourName = (await db.findTourByNameOrId(interaction.guildId, tourId))?.tour_name || tourId;
        await db.deleteTourAndSteps(tourId);
        await interaction.update({ content: `✅ Tour "${tourName}" has been deleted.`, embeds: [], components: [], ephemeral: true });
    } catch (error) {
        console.error(`Error deleting tour ${tourId}:`, error);
        const errorPayload = { content: 'Failed to delete tour.', ephemeral: true };
        if (interaction.replied || interaction.deferred) { 
             await interaction.editReply(errorPayload).catch(async e => {
                console.error("handleDeleteTourExecute: Error editReply failed, trying followup",e);
                await interaction.followUp(errorPayload).catch(e2 => console.error("handleDeleteTourExecute: Error followup failed",e2));
            });
        } else {
             await interaction.reply(errorPayload).catch(e => console.error("handleDeleteTourExecute: Error reply failed, unexpected",e));
        }
    }
}

async function sendCreateTourModal(interaction) {
    try {
        const modal = new ModalBuilder()
            .setCustomId('admin_create_tour_modal')
            .setTitle('Create New Tour');
        const tourNameInput = new TextInputBuilder()
            .setCustomId('tour_name_input')
            .setLabel("Tour Name")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g., Server Onboarding Tour')
            .setRequired(true)
            .setMaxLength(100);
        const tourDescriptionInput = new TextInputBuilder()
            .setCustomId('tour_description_input')
            .setLabel("Tour Description (Optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('A brief summary of what this tour covers.')
            .setRequired(false)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder().addComponents(tourNameInput),
            new ActionRowBuilder().addComponents(tourDescriptionInput)
        );
        await interaction.showModal(modal);
    } catch (error) {
        console.error('Error showing create tour modal:', error);
        const errorPayload = { content: 'Failed to open tour creation form.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorPayload).catch(e => console.error("sendCreateTourModal followup err", e));
        } else {
            await interaction.reply(errorPayload).catch(e => console.error("sendCreateTourModal reply err", e));
        }
    }
}

async function handleCreateTourSubmit(interaction) {
    try {
        const tourName = interaction.fields.getTextInputValue('tour_name_input');
        const tourDescription = interaction.fields.getTextInputValue('tour_description_input') || null;
        const completionRoleId = null;

        const newTourId = await db.addTour(interaction.guildId, tourName, tourDescription, completionRoleId);
        const tourId = newTourId;
        console.log(`[handleCreateTourSubmit] newTourId (resolved from db.addTour) is: ${newTourId}, tourId var is: ${tourId}`);

        const embed = new EmbedBuilder()
            .setTitle(`🎉 Tour "${tourName}" Created!`)
            .setDescription(`Completion Role: Not set (use button below)\n\nWhat next?`)
            .setColor(0x00FF00);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_manage_steps_post_create_${tourId}`).setLabel('Manage Steps').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`admin_set_role_post_create_${tourId}`).setLabel('Set/Change Completion Role').setStyle(ButtonStyle.Secondary), 
            new ButtonBuilder().setCustomId('admin_back_to_main_menu').setLabel('Main Menu').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch_modal_reply').setLabel('End Interaction').setStyle(ButtonStyle.Danger) 
        );
        
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    } catch (error) {
        console.error('Error handling create tour submission:', error);
        await interaction.reply({ content: '❌ Failed to create tour.', ephemeral: true });
    }
}

async function sendSelectTourForRoleMenu(interaction) {
    try {
        const tours = await db.getGuildTours(interaction.guildId);
        const payload = { embeds: [], components: [], ephemeral: true };
        if (!tours || tours.length === 0) {
            payload.embeds.push(new EmbedBuilder().setColor(0xFFCC00).setTitle('Set Completion Role').setDescription('No tours found.'));
        } else {
            const options = tours.slice(0, 25).map(t => ({label: t.tour_name.substring(0,100), value: t.tour_id.toString()}));
            payload.embeds.push(new EmbedBuilder().setTitle('Set Completion Role').setDescription('Select tour:').setColor(0x0099FF));
            payload.components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('admin_tour_selected_for_role_setting').setPlaceholder('Choose tour').addOptions(options)));
        }
        payload.components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_back_to_main_menu').setLabel('Back to Main').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        ));
        await interaction.update(payload);
    } catch (error) {
        console.error('Error sendSelectTourForRoleMenu:', error);
        const errorMsg = { content: 'Failed to load tour list for role setting.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("sSTFRM err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("sSTFRM err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("sSTFRM err reply, unexpected",e));
        }
    }
}

async function sendSetRoleForTourUI(interaction, tourId, statusMessage = null) {
    try {
        const tour = await db.findTourByNameOrId(interaction.guildId, tourId);
        if (!tour) {
            await interaction.update({ content: 'Error: Tour not found.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        const roles = interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id && !r.managed && r.editable && r.name !== '@everyone').sort((a,b) => b.position - a.position);
        if (roles.size === 0) {
            await interaction.update({ content: 'No manageable roles found on this server to assign.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        let currentRoleName = tour.completion_role_id ? (interaction.guild.roles.cache.get(tour.completion_role_id)?.name || 'Unknown/Deleted Role') : 'None';
        
        let description = `Current: **${currentRoleName}**\nSelect new role:`;
        if (statusMessage) {
            description = `${statusMessage}\n\n${description}`;
        }

        const roleOptions = roles.map(r => ({label: r.name.substring(0,100), value: r.id.toString()})).slice(0,25);
        const embed = new EmbedBuilder().setTitle(`Set Role for: ${tour.tour_name}`).setDescription(description).setColor(0x1E90FF);
        const selRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`admin_role_selected_for_tour_set_${tourId}`).setPlaceholder('Choose role').addOptions(roleOptions));
        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_clear_role_for_tour_${tourId}`).setLabel('Clear Role').setStyle(ButtonStyle.Danger).setDisabled(!tour.completion_role_id),
            new ButtonBuilder().setCustomId('admin_back_to_set_role_select_tour_menu').setLabel('Back to Tour List').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        );
        await interaction.update({ embeds: [embed], components: [selRow, btnRow], ephemeral: true });
    } catch (error) {
        console.error(`Error sendSetRoleForTourUI for ${tourId}:`, error);
        const errorMsg = { content: 'Failed to load role setting options.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("sSRFTUI err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("sSRFTUI err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("sSRFTUI err reply, unexpected",e));
        }
    }
}

async function handleSaveCompletionRole(interaction, tourId, roleId) {
    let message;
    try {
        await db.updateTourCompletionRole(tourId, roleId);
        const role = interaction.guild.roles.cache.get(roleId);
        message = `✅ Completion role set to: **${role ? role.name : 'the selected role'}**.`
        await sendSetRoleForTourUI(interaction, tourId, message);
    } catch (error) {
        console.error(`Error saving completion role for tour ${tourId}:`, error);
        message = '❌ Failed to save completion role.';
        try {
            await sendSetRoleForTourUI(interaction, tourId, message);
        } catch (refreshError) {
            console.error("handleSaveCompletionRole: Failed to refresh UI after error, sending direct editReply.", refreshError);
            await interaction.editReply({ content: message, embeds: [], components: [], ephemeral: true }).catch(e => console.error("hSCR direct editReply error", e));
        }
    }
}

async function handleClearCompletionRole(interaction, tourId) {
    let message;
    try {
        await db.updateTourCompletionRole(tourId, null);
        message = `✅ Completion role has been cleared.`
        await sendSetRoleForTourUI(interaction, tourId, message);
    } catch (error) {
        console.error(`Error clearing completion role for tour ${tourId}:`, error);
        message = '❌ Failed to clear completion role.';
        try {
            await sendSetRoleForTourUI(interaction, tourId, message);
        } catch (refreshError) {
            console.error("handleClearCompletionRole: Failed to refresh UI after error, sending direct editReply.", refreshError);
            await interaction.editReply({ content: message, embeds: [], components: [], ephemeral: true }).catch(e => console.error("hCCR direct editReply error", e));
        }
    }
}

async function sendReorderStepUI(interaction, tourId) {
    try {
        const tour = await db.findTourByNameOrId(interaction.guildId, tourId);
        if (!tour) {
            await interaction.update({ content: 'Error: Tour not found.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        const steps = await db.getTourSteps(tourId);
        if (!steps || steps.length < 2) {
            await interaction.update({ content: 'Need at least two steps to reorder.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        const options = steps.map(s => ({label: `${s.step_number}: ${(JSON.parse(s.content)?.title || '(No Title)').substring(0,80)}`, value: s.step_id.toString()}));
        const embed = new EmbedBuilder().setTitle(`Reorder Steps: ${tour.tour_name}`).setDescription('1. Select step.\n2. Click Move Up/Down.').setColor(0xFFA500);
        const selRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`admin_reorder_step_select_${tourId}`).setPlaceholder('Select step to move').addOptions(options));
        const actRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_move_step_up_${tourId}_none`).setLabel('Move Up').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId(`admin_move_step_down_${tourId}_none`).setLabel('Move Down').setStyle(ButtonStyle.Primary).setDisabled(true)
        );
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_back_to_step_management_${tourId}`).setLabel('Back to Step List').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        );
        await interaction.update({ embeds: [embed], components: [selRow, actRow, navRow], ephemeral: true });
    } catch (error) {
        console.error(`Error sendReorderStepUI for ${tourId}:`, error);
        const errorMsg = { content: 'Failed to load reorder options.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("sRSUI err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("sRSUI err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("sRSUI err reply, unexpected",e));
        }
    }
}

async function sendAddStepChannelSelect(interaction, tourId) {
    try {
        const guild = interaction.guild;
        if (!guild) {
            await interaction.update({ content: 'Server info not found.', ephemeral: true, embeds:[], components:[] });
            return;
        }
        const channels = guild.channels.cache.filter(c => c.type === 0 && c.viewable).sort((a,b) => a.position - b.position);
        const options = channels.map(c => ({label: `#${c.name}`.substring(0,100), value: c.id.toString()})).slice(0,25);
        const embed = new EmbedBuilder().setTitle('Add New Step').setColor(0x0099FF);
        let components = [];
        if (options.length > 0) {
            embed.setDescription('Select channel or add custom step.');
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`admin_add_step_channel_selected_${tourId}`).setPlaceholder('Select channel').addOptions(options)));
        } else {
            embed.setDescription('No suitable channels. Add custom step.');
        }
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_add_step_modal_start_${tourId}`).setLabel('Add Custom Step').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`admin_back_to_step_management_${tourId}`).setLabel('Back').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('admin_killswitch').setLabel('End').setStyle(ButtonStyle.Danger)
        ));
        await interaction.update({ embeds: [embed], components: components, ephemeral: true });
    } catch (error) {
        console.error(`Error sendAddStepChannelSelect for ${tourId}:`, error);
        const errorMsg = { content: 'Failed to load channel selection.', ephemeral: true, embeds:[], components:[] };
        if(interaction.replied||interaction.deferred) { 
            await interaction.editReply(errorMsg).catch(async e=>{
                console.error("sASCS err editReply, trying followup",e);
                await interaction.followUp(errorMsg).catch(e2=>console.error("sASCS err followup",e2));
            });
        } else {
            await interaction.reply(errorMsg).catch(e=>console.error("sASCS err reply, unexpected",e));
        }
    }
}

async function handleInteraction(interaction) {
    const guildId = interaction.guildId;
    if (!guildId && (interaction.isMessageComponent() || interaction.isModalSubmit())) {
        try { 
            if (!interaction.replied && !interaction.deferred) {
                 await interaction.reply({ content: 'This admin interaction must be used within a server.', ephemeral: true }); 
            } else {
                 await interaction.followUp({ content: 'This admin interaction must be used within a server.', ephemeral: true }); 
            }
        } catch (e) { 
            console.error("Error replying about guild context in admin handler:", e); 
        }
        return;
    }

    const customId = interaction.customId;
    console.log(`[Admin Handler] Received interaction: ${customId}, Type: ${interaction.type}, User: ${interaction.user.tag}`);

    try {
        if (interaction.isMessageComponent()) {
            // REMOVED: await interaction.deferUpdate({ ephemeral: true });
        }

        if (interaction.isButton()) {
            const parts = customId.split('_');
            let tourId = null;
            let stepId = null;
            if (parts.length >= 3 && !isNaN(parseInt(parts[parts.length - 1]))) {
                 tourId = parseInt(parts[parts.length - 1]);
                 if (customId.startsWith('admin_remove_step_execute_') && parts.length >= 5 && !isNaN(parseInt(parts[parts.length - 2]))) {
                      stepId = tourId; 
                      tourId = parseInt(parts[parts.length - 2]);
                 } 
            }
            let moveStepId = null;
            if (customId.startsWith('admin_move_step_up_') || customId.startsWith('admin_move_step_down_')) {
                 if (parts.length >= 5 && parts[parts.length-1] !== 'none' && !isNaN(parseInt(parts[parts.length-1]))) {
                    moveStepId = parseInt(parts[parts.length-1]);
                    tourId = parseInt(parts[parts.length-2]); 
                 } 
                 if (customId.startsWith('admin_remove_step_execute_')) stepId = moveStepId; else stepId = null; 
            }

            if (customId === 'admin_list_tours') { await handleListTours(interaction); } 
            else if (customId === 'admin_create_tour_start') { await sendCreateTourModal(interaction); } 
            else if (customId === 'admin_select_tour_menu') { await sendSelectTourMenu(interaction); } 
            else if (customId.startsWith('admin_manage_steps_menu_') && tourId !== null) { await sendStepManagementMenu(interaction, tourId); } 
            else if (customId.startsWith('admin_set_default_tour_') && tourId !== null) { await handleSetDefaultTour(interaction, tourId); } 
            else if (customId.startsWith('admin_delete_tour_confirm_') && tourId !== null) { await sendDeleteTourConfirmation(interaction, tourId); } 
            else if (customId.startsWith('admin_delete_tour_execute_') && tourId !== null) { await handleDeleteTourExecute(interaction, tourId); } 
            else if (customId === 'admin_back_to_select_tour') { await sendSelectTourMenu(interaction); } 
            else if (customId.startsWith('admin_back_to_manage_tour_') && tourId !== null) { await sendTourManagementMenu(interaction, tourId); }
            else if (customId.startsWith('admin_add_step_channel_select_start_') && tourId !== null) { await sendAddStepChannelSelect(interaction, tourId); }
            else if (customId.startsWith('admin_add_step_modal_start_') && tourId !== null) { await sendAddStepModal(interaction, tourId); }
            else if (customId.startsWith('admin_edit_step_select_') && tourId !== null) { await handleEditStepSelect(interaction, tourId); } 
            else if (customId.startsWith('admin_remove_step_select_') && tourId !== null) { await handleRemoveStepSelect(interaction, tourId); } 
            else if (customId.startsWith('admin_remove_step_execute_') && tourId !== null && stepId !== null) { await handleRemoveStepExecute(interaction, tourId, stepId); } 
            else if (customId.startsWith('admin_back_to_step_management_') && tourId !== null) { await sendStepManagementMenu(interaction, tourId); }
            else if (customId === 'admin_set_role_select_tour_menu') { await sendSelectTourForRoleMenu(interaction); }
            else if (customId.startsWith('admin_manage_steps_post_create_') && tourId !== null) {
                await sendStepManagementMenu(interaction, tourId);
            }
            else if (customId.startsWith('admin_set_role_post_create_') && tourId !== null) {
                await sendSetRoleForTourUI(interaction, tourId);
            }
            else if (customId === 'admin_back_to_main_menu') { await sendMainMenu(interaction); }
            else if (customId === 'admin_back_to_set_role_select_tour_menu') { await sendSelectTourForRoleMenu(interaction); }
            else if (customId.startsWith('admin_clear_role_for_tour_') && tourId !== null) { await handleClearCompletionRole(interaction, tourId); }
            else if (customId.startsWith('admin_reorder_step_start_') && tourId !== null) { await sendReorderStepUI(interaction, tourId); }
            else if (customId.startsWith('admin_move_step_up_') && tourId !== null && moveStepId !== null) { 
                 await db.moveTourStep(moveStepId, 'up'); 
                 await sendStepManagementMenu(interaction, tourId); 
            } 
            else if (customId.startsWith('admin_move_step_down_') && tourId !== null && moveStepId !== null) { 
                 await db.moveTourStep(moveStepId, 'down'); 
                 await sendStepManagementMenu(interaction, tourId);
            } 
            else if (customId === 'admin_killswitch' || customId === 'admin_killswitch_modal_reply') {
                await interaction.update({ 
                    content: "Admin UI session ended. Use `/touradmin tour menu` to start again.", 
                    embeds: [], 
                    components: [], 
                    ephemeral: true 
                }).catch(e2 => console.error("Killswitch (Button/ModalReply): update failed.", e2));
            }
            else {
                await interaction.update({ content: `Unknown button action: ${customId}`, ephemeral: true, embeds: [], components: [] });
            }
        }
        else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            const parts = customId.split('_');
            let tourId = null;
            if (parts.length >= 3 && !isNaN(parseInt(parts[parts.length - 1]))) {
                tourId = parseInt(parts[parts.length - 1]);
            }
            const selectedValue = interaction.values[0];

            if (customId === 'admin_select_tour_manage') {
                await sendTourManagementMenu(interaction, parseInt(selectedValue));
            } else if (customId.startsWith('admin_edit_step_selected_') && tourId !== null) {
                await sendEditStepModal(interaction, tourId, parseInt(selectedValue)); 
            } else if (customId.startsWith('admin_remove_step_selected_') && tourId !== null) {
                await sendRemoveStepConfirmation(interaction, tourId, parseInt(selectedValue)); 
            } else if (customId === 'admin_tour_selected_for_role_setting') {
                await sendSetRoleForTourUI(interaction, parseInt(selectedValue)); 
            } else if (customId.startsWith('admin_role_selected_for_tour_set_') && tourId !== null) {
                await handleSaveCompletionRole(interaction, tourId, selectedValue); 
            } else if (customId.startsWith('admin_add_step_channel_selected_') && tourId !== null) {
                const channelId = selectedValue;
                const channel = interaction.guild.channels.cache.get(channelId);
                if (!channel) {
                    await interaction.update({ content: 'Error: Could not find the selected channel.', ephemeral: true, embeds: [], components: [] });
                    return;
                }
                const stepTitle = `Visit: #${channel.name}`;
                const stepDescription = `Please visit the <#${channelId}> channel.`;
                const stepContentJson = JSON.stringify({ title: stepTitle, description: stepDescription });
                try {
                     const { stepId, assignedStepNumber } = await db.addTourStep(tourId, null, stepTitle, stepContentJson);
                     await interaction.update({ content: `✅ Step "${stepTitle}" pointing to <#${channelId}> added.`, ephemeral: true, embeds: [], components: [] });
                } catch (dbError) {
                     console.error(`Error adding step via channel select for tour ${tourId}:`, dbError);
                     await interaction.update({ content: '❌ Failed to add the step based on channel selection.', ephemeral: true, embeds: [], components: [] });
                }
            } else if (customId.startsWith('admin_reorder_step_select_') && tourId !== null) {
                const stepIdToMove = parseInt(selectedValue);
                const step = await db.getTourStepById(stepIdToMove);
                const maxStep = await db.getMaxStepNumber(tourId);
                if (!step) {
                    await interaction.update({ content: `Error: Could not find details for selected step ${stepIdToMove}.`, ephemeral: true, embeds: [], components: [] });
                    return; 
                }
                const steps = await db.getTourSteps(tourId);
                const originalOptions = steps.map(s => { 
                    let title = '(No Title)';
                    try { title = JSON.parse(s.content).title || title; } catch (e) {}
                    const displayTitle = title.length > 80 ? title.substring(0, 77) + '...' : title;
                    return {
                        label: `Step ${s.step_number}: ${displayTitle}`,
                        description: `Step ID: ${s.step_id}`,
                        value: s.step_id.toString(),
                        default: s.step_id === stepIdToMove 
                    };
                });
                const newSelectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`admin_reorder_step_select_${tourId}`)
                    .setPlaceholder('Select a step to move') 
                    .addOptions(originalOptions);
                const newSelectMenuRow = new ActionRowBuilder().addComponents(newSelectMenu);
                const moveUpButton = new ButtonBuilder()
                    .setCustomId(`admin_move_step_up_${tourId}_${stepIdToMove}`)
                    .setLabel('Move Up')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(step.step_number === 0);
                const moveDownButton = new ButtonBuilder()
                    .setCustomId(`admin_move_step_down_${tourId}_${stepIdToMove}`)
                    .setLabel('Move Down')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(step.step_number === maxStep);
                const backButton = new ButtonBuilder()
                    .setCustomId(`admin_back_to_step_management_${tourId}`)
                    .setLabel('Back to Step List') 
                    .setStyle(ButtonStyle.Secondary);
                const endInteractionButton = new ButtonBuilder()
                    .setCustomId('admin_killswitch')
                    .setLabel('End Interaction')
                    .setStyle(ButtonStyle.Danger);
                const newActionButtonRow = new ActionRowBuilder().addComponents(moveUpButton, moveDownButton);
                const newNavigationRow = new ActionRowBuilder().addComponents(backButton, endInteractionButton);
                await interaction.update({ components: [newSelectMenuRow, newActionButtonRow, newNavigationRow], ephemeral: true });
            } else {
                console.log(`[Admin Handler] Unknown select menu customId: ${customId}`);
                await interaction.update({ content: `Unknown select menu action: ${customId}`, ephemeral: true, embeds: [], components: [] });
            }
        }
        else if (interaction.isModalSubmit()) {
            const parts = customId.split('_');
            let tourId = null;
            let stepId = null;
            if (parts.length >= 3 && !isNaN(parseInt(parts[parts.length - 1]))) {
                if (parts.length >= 4 && !isNaN(parseInt(parts[parts.length - 2]))) {
                    stepId = parseInt(parts[parts.length - 1]);
                    tourId = parseInt(parts[parts.length - 2]);
                } else {
                    tourId = parseInt(parts[parts.length - 1]);
                }
            }

            if (customId === 'admin_create_tour_modal') { await handleCreateTourSubmit(interaction); } 
            else if (customId.startsWith('admin_add_step_modal_') && tourId !== null) { await handleAddStepSubmit(interaction, tourId); } 
            else if (customId.startsWith('admin_edit_step_modal_') && tourId !== null && stepId !== null) { await handleEditStepSubmit(interaction, tourId, stepId); } 
            else if (customId === 'admin_killswitch') {
                await interaction.reply({ 
                    content: "Admin UI session ended. Use `/touradmin tour menu` to start again.", 
                    embeds: [], 
                    components: [], 
                    ephemeral: true 
                }).catch(e => console.error("Killswitch (Modal): Reply failed.", e));
            }
            else {
                if (!interaction.replied && !interaction.deferred) { 
                    await interaction.reply({ content: `Unknown modal submission: ${customId}`, ephemeral: true }); 
                } else if (interaction.replied && interaction.deferred) { // If it was somehow deferred by modal submit logic itself (unlikely for our current modals)
                    await interaction.editReply({ content: `Unknown modal submission (deferred): ${customId}`, ephemeral: true });
                } else { // Already replied, try followup
                     await interaction.followUp({ content: `Unknown modal submission (followup): ${customId}`, ephemeral: true });
                }
            }
        }

    } catch (error) {
        console.error(`Error handling admin interaction ${customId} for user ${interaction.user.tag}:`, error); 
        const errorMsg = { content: 'An error occurred while processing your request.', embeds: [], components: [], ephemeral: true };
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply(errorMsg).catch(async e_edit => {
                    console.error("Main handler: editReply failed, trying followup:", e_edit);
                    await interaction.followUp(errorMsg).catch(e_follow => console.error("Main handler: followup also failed:", e_follow));
                });
            } else {
                await interaction.reply(errorMsg).catch(e_reply => console.error("Main handler: reply failed:", e_reply));
            }
        } catch (errorHandlerError) { 
            console.error('Critical error in adminInteractionHandler error reporting:', errorHandlerError);
        }
    }
}

module.exports = { sendMainMenu, handleInteraction, sendTourManagementMenu, sendStepManagementMenu, sendSetRoleForTourUI }; 