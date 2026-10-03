# iPhone Shortcut: "Send to Forkcast"

This puts **Forkcast** in the iPhone Share menu. In Safari (or any app) on a recipe page, tap Share > Send to Forkcast, and the recipe lands in your recipe book.

You need first: Forkcast running at `https://forkcast.example.com`, and the `FORKCAST_SHARE_TOKEN` value from the server's `.env` file (see DEPLOY.md). Also the Cloudflare bypass for `/api/share` (DEPLOY.md, step 6).

## Build it
1. Open the **Shortcuts** app > tap **+** (top right).
2. Tap the name at the top > **Rename** > type `Send to Forkcast`. Tap the icon to pick a colour if you like.
3. Tap the **(i)** / settings button at the bottom and turn on **Show in Share Sheet**. Under "Share Sheet Types" leave only **URLs** (and **Safari web pages**) ticked.
4. Tap **Add Action**, search **Get Contents of URL**, add it. (The shortcut's "Shortcut Input" is the URL being shared. Shortcuts fills this in for you as the first step "Receive URLs input from Share Sheet".)
5. In the **Get Contents of URL** action:
   - **URL**: type `https://forkcast.example.com/api/share`
   - Tap the **>** arrow to expand. **Method**: change GET to **POST**.
   - **Headers** > **Add new header**: Key `X-Share-Token`, Text = your token.
   - **Request Body**: **JSON**. Tap **Add new field** > **Text**: Key `url`, Value = tap the field and choose the variable **Shortcut Input**.
6. Add another action: search **Get Dictionary Value**. Set "Get **Value** for `title` in **Contents of URL**".
7. Add action **Show Notification**. Body: type `Saved to Forkcast: ` then tap the variable **Dictionary Value**. (Title: `Forkcast`.)
8. Tap **Done**.

## Use it
Open a recipe in Safari > **Share** button > scroll down > **Send to Forkcast**. After a few seconds you see "Saved to Forkcast: <recipe title>". It appears in the app under Recipes.

## If it doesn't work
- **Notification says `unauthorized`**: the token header is wrong. It must match `.env` exactly (no spaces).
- **Nothing / a login page appears**: the Cloudflare bypass for `api/share` isn't set up yet (DEPLOY.md step 6). With the service-token option, add headers `CF-Access-Client-Id` and `CF-Access-Client-Secret`.
- **"blocks automatic downloads"**: that website refuses servers. Open Forkcast and use **Paste text**.
- Recipes you share twice are not duplicated; the existing one is returned.
- Tracking junk in the link (`?utm_source=...`) is ignored automatically.
