# My Projects

A side panel for Claude Code that shows your projects, the files inside each one, and the chats that go with it.

Hi there 👋  I'm Melynda, The Orderly Entrepreneur.  I help solopreneurs and creators get their tech and systems running smoothly.

I built this because Claude Code keeps every chat, but it doesn't group them by project.  I wanted to click on a project and see its files AND its chats in one spot.  I'm techy, but NOT a coder, and I built it with Claude.

## What it shows

**Your projects.**  Each project folder gets its own colored card with how many chats belong to it.  Click one to open it.

Inside a project there are two buttons:

- 💬 **Chats:** the chats that go with this project, newest first.
  - **Named for this project** are chats with the project's name in the title.
  - **Also worked in this folder** are chats that opened or changed files in the project's folder.
  - Click a chat to see the date, your last message, and Claude's last reply.  Use **Open chat** to jump into it, or **Copy title** to paste it into your sidebar search.  After a jump, a **Back to** button above the message box takes you back to the chat you came from.
- 📁 **Files:** the files and folders inside the project.  Click a folder to go into it.  Click a file to preview it, then **Open** it or **Show in Finder**.

Press **Refresh** any time to pick up new chats and folders.

## How it finds your projects

It looks in the main folder you start your Claude Code chats from.

- If that folder has a folder named **Projects**, each folder inside Projects is a project.
- If not, each folder in your main folder is a project.

**The tip that makes it work best:** put the project's name in your chat titles.  A chat called "Website homepage fixes" lands in your Website project on its own.

## How to open it

Type `/projects`.  The first time, it reads all your saved chats, so you'll see a count go up for a bit.  After that it only rereads chats that changed.

## Install

**In the Claude desktop app:**

1. Open **Settings**, then click **Customize**, then **Plugins**.
2. Click **Add**, then **Add marketplace**, then **Add from a repository**.
3. In the box, paste `https://github.com/ordertoeverything/my-projects` and click **Sync**.
4. Start a new chat and type `/projects`.

**In Claude Code in a terminal:** type this and press Enter, then type `y` when it asks to add the marketplace.

```
/plugin install my-projects --marketplace ordertoeverything/my-projects
```

Then type `/projects` to open it.

## Optional settings

You don't need these.  They're here if your folders are set up differently, or you like short codes in your chat titles.

- **Projects folder:** the folder that holds your projects, if it isn't called Projects.
- **Extra project folders:** other folders that should also show as projects, separated by commas.
- **Chat title codes:** short codes you use in chat titles.  Example: `Tech and Systems = TECH; Website = WEB, Homepage`.  Codes match exact capitals, so TECH matches "TECH" and not "tech."

In Claude Code in a terminal, you'll find them in `/config`.

## Privacy

It sends nothing anywhere.  It reads your project folders and the chats Claude Code already saves on your computer.

It keeps one small list of your chat titles and dates so it doesn't have to reread every chat each time.  That list lives in Claude Code's own settings folder on your computer.

The only other things it does happen when you click: open a file or a chat, show a file in Finder, or copy a chat title.

## Good to know

- **Open chat** works in the Claude desktop app.  Anywhere else, use **Copy title** and paste it into your sidebar search.
- It only sees chats you started from your main folder.

## License

PolyForm Shield 1.0.0.  You can use it, even for your business.  You can't sell it or offer a competing version.  Full text in [LICENSE.md](LICENSE.md).

Copyright (c) 2026 Order to Everything, LLC (The Orderly Entrepreneur)
