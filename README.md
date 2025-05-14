# Discord Tour Bot 🚩

> **Project Watermark:** This project is uniquely identified by the following watermark for authorship and license proof:
> 
> **Unique ID:** DTB-2023-ORIGINAL-V1  
> **License:** CC BY-NC 4.0  
> **Original Creator**

Hey there, server admin! 👋 Looking for a way to welcome new members and guide them through your awesome Discord server? You've found it!

This bot lets you create interactive tours that walk new members through your server's channels, rules, and features. Think of it like having a friendly guide who shows newcomers around so they feel right at home.

## ✨ What Can This Bot Do?

- **Guided Tours:** Automatically (or manually) walk new members through your server step by step
- **Channel Showcasing:** Link directly to important channels to help members navigate
- **Role Assignment:** Automatically give members a role when they finish a tour (great for verification!)
- **Fully Customizable:** Create different tours for different purposes
- **Admin-Friendly UI:** Easy-to-use commands for setting everything up

## 🔧 Setting Up the Bot

1. Invite the bot to your server (using the invite link provided by your bot host)
2. Make sure the bot has these permissions:
   - Send Messages
   - Embed Links
   - Manage Roles (for assigning roles when tours complete)
   - Read Message History
   - View Channels

## 💻 Developer Setup

If you want to host this bot yourself or contribute to its development:

1. Clone this repository
   ```
   git clone https://github.com/yourusername/discord-tour-bot.git
   cd discord-tour-bot
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create an `.env` file in the root directory with the following variables:
   ```
   DISCORD_BOT_TOKEN=your_bot_token_here
   DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_GUILD_ID=your_test_guild_id_here
   ```

4. Register the slash commands
   ```
   node deploy-commands.js
   ```

5. Start the bot
   ```
   npm start
   ```

The bot uses SQLite for data storage, so no additional database setup is required. The database file (`tour_bot.db`) will be created automatically on first run.

## 🚀 Getting Started (Admin Commands)

### Managing Tours with Slash Commands

The bot uses slash commands for all admin functions. Here's how to use them:

- `/touradmin tour menu` - Opens the main admin menu where you can create and manage tours

All admin commands require Administrator permissions in your server.

### Tour Management Menu

When you use `/touradmin tour menu`, you'll see buttons for:

- **List Tours:** See all tours you've created
- **Create Tour:** Make a new tour from scratch
- **Manage Existing Tour:** Edit an existing tour
- **Set Tour Completion Role:** Choose which role members get when they finish
- **End Interaction:** Close the admin menu

### Creating a Tour

1. Click **Create Tour** in the admin menu
2. Fill in the tour name and optional description
3. After creating, you'll see options for "Manage Steps" and "Set/Change Completion Role"

### Adding Steps to Your Tour

A tour without steps isn't much of a tour! Here's how to add them:

1. Go to **Manage Steps** for your tour
2. Click **Add Step**
3. You can either:
   - Select an existing channel (creates a "Visit #channel-name" step automatically)
   - Create a custom step with your own title and description

#### Pro Tip: Special Channel Placeholders

When writing step descriptions, you can use these placeholders (follow #channel_name_channel_id naming scheme) that auto-convert to channel links:
- `<#rules_channel_id>` - Links to your rules channel
- `<#announcements_channel_id>` - Links to announcements
- `<#guides_channel_id>` - Links to guides

The bot will try to find these channels by name if you haven't specifically configured them.

### Setting a Default Tour

Want a tour to start automatically when new members join?

1. Go to **Manage Existing Tour**
2. Select your tour
3. Click **Set as Default**

Now new members will receive this tour when they join!

## 🙋‍♂️ For Your Members

### How Members Experience Tours

Members can start tours in two ways:

1. **Automatically:** If you've set a default tour, new members will get a message when they join
2. **On Request:** Members can use the `/request_tour` command with a role option to start a tour for a specific role

During the tour, members will see:
- Step-by-step information about your server
- Next/Back buttons to navigate
- Links to relevant channels
- A complete button at the end

When they finish, they'll receive any role you've configured as a completion reward!

## 🔄 Tour Management Options

### Managing Steps

For each tour, you can:
- **Add Steps:** Create new steps in your tour
- **Edit Steps:** Change the content of existing steps
- **Remove Steps:** Delete steps you no longer need
- **Reorder Steps:** Change the order steps appear in

### Setting Completion Roles

When a member completes a tour, you can have the bot automatically assign them a role:

1. From the admin menu, click **Set Tour Completion Role**
2. Select the tour you want to configure
3. Choose a role from the dropdown
4. Members will get this role when they complete the tour!

## 📝 Common Setup Example: Role-Based Access

Here's a practical example of how you might use the tour bot for role-based access in your server:

### Creating a Multi-Level Access System:

1. Create these roles in your Discord server (in this order of hierarchy):
   - Admin (highest)
   - Moderator
   - Trusted Member
   - Member (given to everyone who completes the welcome tour)
   - New Arrival (lowest, given to everyone when they join)

2. Set up your channels with appropriate permissions:
   - **#welcome**: Readable by everyone including New Arrivals
   - **#general**: Requires Member role to access
   - **#trusted-chat**: Requires Trusted Member role to access
   - **#moderator-lounge**: Requires Moderator role to access

3. Create tours for each access level:
   - **Welcome Tour**: Completion grants "Member" role
     - Steps: Server rules, community guidelines, how to get help
   - **Trusted Member Tour**: Completion grants "Trusted Member" role
     - Steps: Advanced features, community expectations
   - **Moderator Tour**: Completion grants "Moderator" role
     - Steps: Moderation tools tutorial, server policies

4. Make the "Welcome Tour" your default tour for new members

5. In your #general channel, add this instruction:
   ```
   Want to get access to #trusted-chat? Use the command: /request_tour role:Trusted Member
   ```

This creates a clear progression path for members and ensures they understand the responsibilities of each role before getting access.

## ❓ Troubleshooting

- **Members aren't getting tours:** Check if you've set a default tour
- **Channel links not working:** Make sure placeholders match your actual channel names
- **Can't see admin menu:** Verify you have Administrator permissions
- **Role assignment not working:** Ensure the bot's role is higher than the role it's trying to assign

## 🎉 And That's It!

You're all set to create amazing tours for your server! If you have questions or need help, please contact your bot provider.

Happy touring! 🚶‍♂️
