# ServerSherpa 🚩

> **Project Watermark:** This project is uniquely identified by the following watermark for authorship and license proof:
> 
> **Unique ID:** DTB-2023-ORIGINAL-V1  
> **License:** CC BY-NC 4.0  
> **Original Creator** : [Vibhor Singh](https://github.com/iamvibhorsingh)

Hey there, discord admins! 👋 Looking for a way to welcome new members and guide them through your awesome Discord server? You've found it!

This bot (ServerSherpa) lets you create interactive tours that walk new members through your server's channels, rules, and features. Think of it like having a friendly guide who shows newcomers around so they feel right at home.

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
   git clone https://github.com/yourusername/serversherpa.git
   cd serversherpa
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
   node src/commands/deploy-commands.js
   ```

5. Start the bot
   ```
   npm start
   ```

The bot uses SQLite for data storage, so no additional database setup is required. The database file (`src/db/tour_bot.db`) will be created automatically in the `src/db/` directory on first run.

## 🌐 Hosting the Bot

Once you have the bot running locally, you might want to host it on a server so it's online 24/7. Here are general steps and considerations:

1.  **Choose a Hosting Provider:**
    *   **Platform as a Service (PaaS):** Services like Heroku, Render, or Fly.io are often easier to get started with for Node.js apps. They might automatically detect your `package.json` and `Procfile`.
    *   **Virtual Private Server (VPS):** Services like DigitalOcean, Linode, or AWS EC2 give you more control but require manual setup of Node.js, process managers (like PM2), and potentially a firewall.
    *   **Dedicated Bot Hosting:** Some services specialize in hosting Discord bots.

2.  **Prepare Your Code for Deployment:**
    *   Ensure your `package.json` has a `start` script. Ours is `node src/bot.js`.
    *   Your `Procfile` (`worker: node src/bot.js`) is essential for platforms like Heroku, telling them how to run your application.

3.  **Deployment Process (General):**
    *   **Connect to Git:** Most PaaS providers allow you to connect your GitHub repository for automatic deployments when you push changes.
    *   **Manual Upload/CLI:** For VPS or other services, you might clone your repository directly onto the server using `git clone`, or upload your files via SFTP/SCP.

4.  **Environment Variables:**
    *   **DO NOT upload your `.env` file to your Git repository or directly to the hosting service if it's public.** This file contains sensitive information like your bot token.
    *   Hosting providers have a section in their dashboard or settings where you can securely set environment variables (e.g., `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`). Your application will read these from the hosting environment.

5.  **Install Dependencies on the Server:**
    *   After deploying your code, you'll need to install dependencies. Most PaaS providers do this automatically. On a VPS, you'd run `npm install --omit=dev` (or just `npm install` if you also need dev dependencies for some build step, though typically not for a simple bot).

6.  **Run Slash Command Deployment:**
    *   You will need to run `node src/commands/deploy-commands.js` **one time from your hosting environment if it has access to the internet and can make requests to Discord API** to register the slash commands globally.
    *   Alternatively, you can run this command from your local machine before deploying, as slash commands are registered with Discord directly and don't need to be run from the bot's active process once registered. If you update commands, you'll need to re-run this.

7.  **Start the Bot:**
    *   Your hosting provider will use your `npm start` script (or the command in your `Procfile`) to start the bot.
    *   If using a VPS, you'll want to use a process manager like `pm2` to keep the bot running in the background and automatically restart it if it crashes.
        ```bash
        # Example using pm2 on a VPS
        npm install pm2 -g # Install pm2 globally
        pm2 start npm --name "serversherpa" -- run start
        pm2 startup # To ensure it starts on server reboot
        pm2 save
        ```

8.  **Database:**
    *   Since SQLite creates a local file (`src/db/tour_bot.db`), ensure your hosting environment has persistent storage if you're using a PaaS. Some free tiers of PaaS might have ephemeral filesystems, meaning your database could be wiped on restarts or deploys.
    *   For Heroku, the file system is ephemeral. You might need to consider using an add-on for persistent PostgreSQL or another database, which would require changes to `database.js`. For simple use cases and testing, SQLite might work, but be aware of data loss potential.
    *   On a VPS, the database file will persist as long as the server's storage is intact.

9.  **Logging and Monitoring:**
    *   Check your hosting provider's dashboard for logs to monitor your bot's activity and troubleshoot issues.
    *   For a VPS, `pm2 logs` can show you the console output.

These are general guidelines. Specific steps will vary depending on the hosting service you choose. Always refer to your hosting provider's documentation for the most accurate instructions.

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

Here's a practical example of how you might use ServerSherpa for role-based access in your server:

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

You're all set to create amazing tours for your server! If you have questions or need help, please first try whatever chatbot you have access to instead of contacting me. This was just a fun project for me.

Happy touring! 🚶‍♂️
