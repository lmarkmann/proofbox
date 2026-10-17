# Builders Challenge: workshop access

The infra onboarding guide (upstream `docs/BUILDERS-CHALLENGE-INFRA-ONBOARDING.pdf`), as text. The PDF's screenshots are not reproduced.

## Register and sign in

Start with Cosmos Community, then access the workshop.

1. **Register at Cosmos Community.** You must visit <https://community.vastdata.com/c/workshop> and register for an account. Once registered, the community page links to the Builders Challenge Workshop.
2. **Sign in to the workshop.** On the workshop login screen, enter the same email address you registered with, then click **Continue**. Returning users are signed in automatically; new users get an account created for them.

## Open the Builders Challenge lab

3. **Choose Builders Challenge.** On the workshop home screen, click the Builders Challenge tile.
4. **Enter the lab passcode** exactly as shown on the slide, then click **Enter lab**.

## Join your assigned team

Double-check your team number before you confirm: the team-selection screen lets you choose only once. If you do not know your team number, ask the coordinator before continuing.

5. **Select your team.** Click the number your workshop coordinator gave you. If you have already joined a team, this prompt may not appear; continue to step 7.
6. **Confirm your team.** Type the confirmation text exactly as requested on screen, then click **Join Team [number]**. For Team 11, type `Team 11` and click **Join Team 11**.

## Your lab page

7. **Find your workshop tools.** Wait for setup to finish. The lab page then shows your VM, your team, and the tools under *In the browser*:

| Tool | Opens |
|------|-------|
| Build Day Guide | the instructions for the build day |
| Dashboard | your team's dashboard |
| Video Search & Summary | your team's tool |
| App | your team's app |

Below the tools are the steps you run on your laptop to connect with Cursor.

## Install your SSH key

Your key is how you sign in to your VM. Do this before setting up your laptop.

8. **Make a key and install it.**
   1. Make a key, or use one you already have. The page shows the commands for Mac or Linux (Terminal) and Windows (PowerShell). A new key keeps this lab separate from your other SSH keys; you can press Enter at the passphrase prompts.
   2. Copy the public key: the last command prints a line starting with `ssh-ed25519`. Copy that whole line.
   3. Expand **Install the public key**, paste the line, and click **Install public key**. The counter shows *1 installed* when it worked.

   Only the public key, the line from the `.pub` file. The private key stays on your laptop and is never shared.

## Connect with Cursor

Work in Cursor on your own laptop over SSH; this is the recommended way to build.

9. **Set up and connect.**
   1. Configure your laptop. Either prompt Cursor (it installs `cloudflared` and writes the SSH config for you) or do it yourself for your OS. Both write the same connection.
   2. Connect in a terminal first with the command from the page, for example `ssh bc-josh`. A browser login opens, then your key signs you in.
   3. Open a new Cursor window, choose **Connect via SSH**, and pick `bc-<username>`. Cursor reuses the terminal login.

   Use the short name `bc-<username>`, not the full `bc-pool-NNN.thecosmoslabs.com` hostname. The full name skips the laptop config and will fail.

**Can't use Cursor on your laptop?** Click **Open desktop** at the bottom of the lab page for a virtual desktop in the browser. If it disconnects, close extra desktop tabs and click **Open desktop** again. Do not refresh the desktop tab. Your session is kept for about 30 minutes.
