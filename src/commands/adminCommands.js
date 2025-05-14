// Placeholder for admin command logic
const db = require('../db/database.js');
const configManager = require('../managers/configManager.js'); // May need this later
const { PermissionsBitField, EmbedBuilder, roleMention } = require('discord.js');

// Helper function to parse role input (mention, ID, or name)
async function findRole(guild, input) {
    // Check if input is a role mention (<@&ID>)
    const roleMentionMatch = input.match(/^<@&(\d+)>$/);
    if (roleMentionMatch) {
        const roleId = roleMentionMatch[1];
        return guild.roles.fetch(roleId).catch(() => null);
    }

    // Check if input is a raw ID
    if (/^\d+$/.test(input)) {
        return guild.roles.fetch(input).catch(() => null);
    }

    // Otherwise, search by name (case-insensitive)
    const lowerInput = input.toLowerCase();
    return guild.roles.cache.find(role => role.name.toLowerCase() === lowerInput);
}

// Main handler function
async function handleAdminCommand(message, args) {
    if (!message.guild) return; // Ensure commands are run in a server

    // Basic permission check
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        // This check is also done in bot.js, but double-checking here is good practice.
        return message.reply({ content: 'You need Administrator permissions to use admin commands.', ephemeral: true });
    }

    const [commandGroup, subCommand, ...restArgs] = args;
    const guildId = message.guild.id;

    if (commandGroup !== 'tour') {
        return message.reply({ content: 'Unknown admin command group. Use `!admin tour ...`', ephemeral: true });
    }

    // --- Tour Subcommand Logic ---
    try {
        switch (subCommand?.toLowerCase()) {
            case 'list': {
                const tours = await db.getGuildTours(guildId);
                const config = await db.getServerConfig(guildId); // For default tour ID
                if (!tours || tours.length === 0) {
                    return message.reply('No tours found for this server.');
                }
                const embed = new EmbedBuilder()
                    .setTitle(`Tours for ${message.guild.name}`)
                    .setColor(0x0099FF);
                tours.forEach(tour => {
                    let name = `${tour.tour_name} (ID: ${tour.tour_id})`;
                    if (config && config.default_tour_id === tour.tour_id) {
                        name += ' [DEFAULT]';
                    }
                    let value = tour.description || 'No description.';
                    if(tour.completion_role_id) {
                        value += `\nCompletion Role: <@&${tour.completion_role_id}> (ID: ${tour.completion_role_id})`;
                    }
                    embed.addFields({ name: name, value: value });
                });
                return message.reply({ embeds: [embed] });
            }

            case 'create': {
                const tourName = restArgs.join(' ');
                if (!tourName) {
                    return message.reply('Usage: `!admin tour create <Tour Name>`');
                }
                // Check if tour with this name already exists
                const existing = await db.findTourByNameOrId(guildId, tourName);
                if (existing) {
                    return message.reply(`A tour with the name "${tourName}" already exists (ID: ${existing.tour_id}).`);
                }
                const newTourId = await db.addTour(guildId, tourName);
                return message.reply(`Successfully created new tour "${tourName}" with ID: ${newTourId}. Use \`!admin tour addstep ${newTourId} ...\` to add steps.`);
            }

            case 'delete': {
                const identifier = restArgs.join(' ');
                if (!identifier) {
                    return message.reply('Usage: `!admin tour delete <Tour ID or Name>`');
                }
                const tour = await db.findTourByNameOrId(guildId, identifier);
                if (!tour) {
                    return message.reply(`Could not find a tour with identifier "${identifier}".`);
                }
                // Confirmation maybe? For now, just delete.
                const config = await db.getServerConfig(guildId);
                if(config && config.default_tour_id === tour.tour_id) {
                    // Unset default tour if deleting the default
                    await db.updateServerConfig(guildId, { default_tour_id: null });
                    message.channel.send(`Note: Tour ${tour.tour_id} was the default tour. The default tour has been unset.`);
                }
                
                await db.deleteTourAndSteps(tour.tour_id);
                return message.reply(`Successfully deleted tour "${tour.tour_name}" (ID: ${tour.tour_id}) and all its associated steps and progress.`);
            }

            case 'setdefault': {
                const identifier = restArgs.join(' ');
                if (!identifier) {
                    return message.reply('Usage: `!admin tour setdefault <Tour ID or Name>`');
                }
                const tour = await db.findTourByNameOrId(guildId, identifier);
                if (!tour) {
                    return message.reply(`Could not find a tour with identifier "${identifier}".`);
                }
                await db.updateServerConfig(guildId, { default_tour_id: tour.tour_id });
                return message.reply(`Set "${tour.tour_name}" (ID: ${tour.tour_id}) as the default tour for new members.`);
            }

            case 'setrole': {
                const [tourIdentifier, ...roleInputParts] = restArgs;
                const roleInput = roleInputParts.join(' ');
                if (!tourIdentifier || !roleInput) {
                    return message.reply('Usage: `!admin tour setrole <Tour ID or Name> <Role ID, Name, or Mention>`');
                }

                const tour = await db.findTourByNameOrId(guildId, tourIdentifier);
                if (!tour) {
                    return message.reply(`Could not find a tour with identifier "${tourIdentifier}".`);
                }

                const role = await findRole(message.guild, roleInput);
                if (!role) {
                    return message.reply(`Could not find a role matching "${roleInput}". Please use the role ID, exact name, or mention.`);
                }

                await db.updateTourCompletionRole(tour.tour_id, role.id);
                return message.reply(`Set completion role for tour "${tour.tour_name}" (ID: ${tour.tour_id}) to ${roleMention(role.id)}.`);
            }

            case 'liststeps': {
                const tourIdentifier = restArgs.join(' ');
                if (!tourIdentifier) {
                    return message.reply('Usage: `!admin tour liststeps <Tour ID or Name>`');
                }
                const tour = await db.findTourByNameOrId(guildId, tourIdentifier);
                if (!tour) {
                    return message.reply(`Could not find a tour with identifier "${tourIdentifier}".`);
                }
                const steps = await db.getTourSteps(tour.tour_id);
                if (!steps || steps.length === 0) {
                    return message.reply(`No steps found for tour "${tour.tour_name}" (ID: ${tour.tour_id}).`);
                }
                const embed = new EmbedBuilder()
                    .setTitle(`Steps for Tour: ${tour.tour_name} (ID: ${tour.tour_id})`)
                    .setColor(0x0099FF);
                steps.forEach(step => {
                    let contentParsed = {};
                    try { contentParsed = JSON.parse(step.content); } catch (e) { /* ignore */ }
                    embed.addFields({
                        name: `Step ${step.step_number} (ID: ${step.step_id}) - ${step.title || contentParsed.title || 'Untitled'}`,
                        value: contentParsed.description || step.content || 'No description.'
                    });
                });
                return message.reply({ embeds: [embed] });
            }

            case 'addstep': {
                // Usage: !admin tour addstep <Tour ID or Name> [Step Number] <Title> | <Description>
                const tourIdentifier = restArgs.shift();
                if (!tourIdentifier) {
                    return message.reply('Usage: `!admin tour addstep <Tour ID or Name> [Step Number] <Title> | <Description>`');
                }
                const tour = await db.findTourByNameOrId(guildId, tourIdentifier);
                if (!tour) {
                    return message.reply(`Could not find a tour with identifier "${tourIdentifier}".`);
                }

                let stepNumber = null;
                let contentToParse = restArgs.join(' ');

                // Check if the next arg is a number (optional step number)
                if (restArgs.length > 0 && !isNaN(parseInt(restArgs[0]))) {
                    stepNumber = parseInt(restArgs.shift());
                    contentToParse = restArgs.join(' ');
                }

                const parts = contentToParse.split('|').map(p => p.trim());
                const title = parts[0];
                const description = parts[1] || ''; // Allow empty description

                if (!title) {
                    return message.reply('Missing title. Usage: `... <Title> | <Description>`');
                }
                const contentJson = JSON.stringify({ title, description });
                const { stepId, assignedStepNumber } = await db.addTourStep(tour.tour_id, stepNumber, title, contentJson);
                return message.reply(`Added new step (ID: ${stepId}) with title "${title}" as step number ${assignedStepNumber} to tour "${tour.tour_name}".`);
            }

            case 'editstep': {
                 // Usage: !admin tour editstep <Tour ID or Name> <Step ID> <New Title> | <New Description>
                const tourIdentifier = restArgs.shift();
                const stepIdToEditStr = restArgs.shift();
                const contentToParse = restArgs.join(' ');

                if (!tourIdentifier || !stepIdToEditStr || !contentToParse) {
                    return message.reply('Usage: `!admin tour editstep <Tour ID or Name> <Step ID> <New Title> | <New Description>`');
                }
                const tour = await db.findTourByNameOrId(guildId, tourIdentifier);
                if (!tour) {
                    return message.reply(`Could not find a tour with identifier "${tourIdentifier}".`);
                }
                const stepIdToEdit = parseInt(stepIdToEditStr);
                if (isNaN(stepIdToEdit)) {
                    return message.reply('<Step ID> must be a number.');
                }
                const step = await db.getTourStepById(stepIdToEdit);
                if (!step || step.tour_id !== tour.tour_id) {
                    return message.reply(`Step ID ${stepIdToEdit} not found or does not belong to tour "${tour.tour_name}".`);
                }

                const parts = contentToParse.split('|').map(p => p.trim());
                const newTitle = parts[0];
                const newDescription = parts[1] || '';
                if (!newTitle) {
                     return message.reply('Missing new title. Usage: `... <New Title> | <New Description>`');
                }

                const newContentJson = JSON.stringify({ title: newTitle, description: newDescription });
                await db.editTourStep(stepIdToEdit, newTitle, newContentJson);
                return message.reply(`Successfully edited step ID ${stepIdToEdit} (Step ${step.step_number}) in tour "${tour.tour_name}".`);
            }

            case 'removestep': {
                // Usage: !admin tour removestep <Tour ID or Name> <Step ID>
                const tourIdentifier = restArgs.shift();
                const stepIdToRemoveStr = restArgs.shift();

                if (!tourIdentifier || !stepIdToRemoveStr) {
                    return message.reply('Usage: `!admin tour removestep <Tour ID or Name> <Step ID>`');
                }
                const tour = await db.findTourByNameOrId(guildId, tourIdentifier);
                if (!tour) {
                    return message.reply(`Could not find a tour with identifier "${tourIdentifier}".`);
                }
                const stepIdToRemove = parseInt(stepIdToRemoveStr);
                if (isNaN(stepIdToRemove)) {
                    return message.reply('<Step ID> must be a number.');
                }

                const step = await db.getTourStepById(stepIdToRemove); // Check if step exists and belongs to this tour
                if (!step || step.tour_id !== tour.tour_id) {
                    return message.reply(`Step ID ${stepIdToRemove} not found or does not belong to tour "${tour.tour_name}".`);
                }

                await db.deleteTourStepAndRenumber(stepIdToRemove);
                return message.reply(`Successfully removed step ID ${stepIdToRemove} from tour "${tour.tour_name}" and renumbered subsequent steps.`);
            }

            default: {
                // Provide help or list commands
                const helpEmbed = new EmbedBuilder()
                    .setTitle('Tour Admin Commands')
                    .setDescription('Manage server tours and their steps.')
                    .addFields(
                        { name: '!admin tour list', value: 'Lists all tours.' },
                        { name: '!admin tour create <Name>', value: 'Creates a new tour.' },
                        { name: '!admin tour delete <ID or Name>', value: 'Deletes a tour and its steps/progress.' },
                        { name: '!admin tour setdefault <ID or Name>', value: 'Sets the default tour for new members.' },
                        { name: '!admin tour setrole <Tour ID or Name> <Role ID/Name/Mention>', value: 'Sets the role granted upon tour completion.' },
                        { name: '!admin tour liststeps <Tour ID or Name>', value: 'Lists all steps for a specific tour.' },
                        { name: '!admin tour addstep <Tour ID or Name> [Step Num] <Title> | <Desc>', value: 'Adds a step to a tour. Step num is optional (appends if omitted).' },
                        { name: '!admin tour editstep <Tour ID or Name> <Step ID> <New Title> | <New Desc>', value: 'Edits an existing step by its unique ID.' },
                        { name: '!admin tour removestep <Tour ID or Name> <Step ID>', value: 'Removes a step from a tour by its unique ID and renumbers others.' }
                        // Add more commands here as they are implemented
                    )
                    .setColor(0x0099FF);
                return message.reply({ embeds: [helpEmbed] });
            }
        }
    } catch (error) {
        console.error('Error processing admin command:', error);
        return message.reply('An error occurred while processing the command. Please check the logs or command usage.');
    }
}

module.exports = {
    handleAdminCommand
}; 