# Waystack & Kirby Marketing Site

These steps walk through getting the project running on a Mac, starting from scratch. They go into extra detail on **Step 2** from the quick-start guide so newcomers can follow along easily.

## 1. Install Node.js (one-time setup)
1. Open Safari and go to [https://nodejs.org](https://nodejs.org).
2. Click the macOS **LTS** installer button and download the `.pkg` file.
3. When the download finishes, double-click the file in Safari's downloads list (or open **Finder → Downloads** and double-click it there).
4. Follow the installer prompts, leaving all options at their defaults. This places the `node` and `npm` commands on your Mac so you can run the project later.

## 2. Put the project folder on your Mac
1. Download or copy the project folder (it should contain files such as `package.json`, `server.js`, and the `public` directory). If it comes as a ZIP file, double-click the ZIP in Finder to unzip it. The unzipped folder is the one you need.
2. Drag that folder into a convenient location, such as your **Desktop** or **Documents** folder. Keeping it somewhere you recognize makes the next step easier.
3. Rename the folder to something memorable (for example, `waystack-site`) if it does not already have a clear name. Finder will let you rename it by clicking once on the folder name and pressing **Return**.

## 3. Open the project in Terminal
1. Open **Spotlight** (click the magnifying-glass icon at the top-right of the screen or press `⌘ + Space`).
2. Type `Terminal` and press **Return** to launch it.
3. In Terminal, type `cd` followed by a space, then drag the project folder from Finder into the Terminal window. macOS will automatically fill in the correct path for you.
4. Press **Return**. Your prompt should now show the folder name at the end of the path.

## 4. Install dependencies
1. Still in Terminal, run:
   ```bash
   npm install
   ```
2. Wait for the command to finish (you will know it is done when the prompt returns and you can type again).

## 5. Start the website locally
1. Run:
   ```bash
   npm start
   ```
2. Leave Terminal open. The command keeps running so that the site stays available.
3. Open Safari (or another browser) and visit [http://localhost:3000](http://localhost:3000). You should see the Waystack & Kirby homepage.

## 6. Stop the server when finished
- Return to Terminal and press `Ctrl + C` to stop the running server.

You can repeat steps 3–6 any time you want to view changes to the site. Edit the files inside the `public/` folder, save them, refresh the browser, and you will see your updates.

## Resolving binary merge conflicts on GitHub
If a pull request shows **"binary files are not supported"** when you click **Update branch**, pull the latest `main` branch locally and merge it into your feature branch instead:

```bash
git fetch origin
git checkout work
git merge origin/main
```

If Git reports a conflict for `public/images/static-site.png`, choose **ours** (keep the version from `main`) or delete the file—this project now serves hosted photography so the legacy screenshot is no longer required. Commit the merge resolution and push your branch; the pull request will update automatically without needing the GitHub button.
