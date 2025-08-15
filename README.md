# n8n Workflow Gallery

A dynamic web gallery for browsing n8n workflow templates that automatically syncs with the GitHub repository.

## Features

- 🔄 **Auto-sync**: Automatically fetches the latest workflows from GitHub
- 🔍 **Search**: Search workflows by name or description
- 🗂️ **Sort**: Sort by name, node count, file size, or date
- 👁️ **Preview**: View workflow JSON structure before downloading
- 📊 **Statistics**: See total workflows, nodes, and averages
- 📱 **Responsive**: Works on desktop and mobile devices
- ⚡ **Fast**: 5-minute cache for optimal performance
- 🆓 **Free Hosting**: Designed for Render's free tier

## Deploy to Render (Free Hosting)

### Method 1: One-Click Deploy (Recommended)

1. Create a GitHub repository and upload these files:
   - `server.js`
   - `package.json`
   - `render.yaml`
   - Create a `public` folder and put `index.html` inside it
   - This `README.md`

2. Go to [Render Dashboard](https://dashboard.render.com/)

3. Click "New +" → "Web Service"

4. Connect your GitHub account if not already connected

5. Select your repository

6. Render will auto-detect the configuration from `render.yaml`

7. Click "Create Web Service"

8. Wait for deployment (takes 2-3 minutes)

9. Your gallery will be live at: `https://your-app-name.onrender.com`

### Method 2: Manual Setup

1. Go to [Render Dashboard](https://dashboard.render.com/)

2. Click "New +" → "Web Service"

3. Choose "Build and deploy from a Git repository"

4. Connect your GitHub account and select your repo

5. Configure:
   - **Name**: `n8n-workflow-gallery` (or your choice)
   - **Region**: Choose nearest to you
   - **Branch**: `main` (or your default branch)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

6. Add environment variables (optional):
   - Click "Advanced" → "Add Environment Variable"
   - **Key**: `GITHUB_TOKEN`
   - **Value**: Your GitHub personal access token
   - (This increases API rate limit from 60 to 5,000 requests/hour)

7. Click "Create Web Service"

### Method 3: Deploy Using Render CLI

```bash
# Install Render CLI
npm install -g @render-cli/cli

# Login to Render
render login

# Deploy
render create web-service \
  --name n8n-workflow-gallery \
  --repo https://github.com/YOUR_USERNAME/YOUR_REPO \
  --buildCommand "npm install" \
  --startCommand "npm start"
```

## Create GitHub Token (Optional but Recommended)

To avoid GitHub API rate limits:

1. Go to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name like "n8n-gallery"
4. No special permissions needed (public repo access is default)
5. Copy the token
6. Add it to Render:
   - Go to your service on Render
   - Click "Environment" tab
   - Add variable: `GITHUB_TOKEN` = `your-token-here`
   - Click "Save Changes"

## Local Development

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO

# Install dependencies
npm install

# Create public folder if not exists
mkdir -p public

# Put index.html in public folder
mv index.html public/

# Run locally
npm run dev

# Visit http://localhost:3000
```

## Project Structure

```
n8n-workflow-gallery/
├── server.js          # Node.js backend server
├── package.json       # Dependencies
├── render.yaml        # Render deployment config
├── README.md          # This file
└── public/
    └── index.html     # Frontend interface
```

## Features Explained

### Auto-Sync
- The gallery fetches workflows directly from GitHub API
- No need to redeploy when new workflows are added to the repo
- 5-minute cache to balance freshness and performance

### Search & Filter
- Real-time search through workflow names and descriptions
- Sort by multiple criteria
- Compact view toggle for more items on screen

### Preview Modal
- Click any workflow card to see details
- View full JSON structure
- Direct download and GitHub links

## API Endpoints

- `GET /api/workflows` - Get all workflows
- `GET /api/workflow/:filename` - Get specific workflow
- `GET /api/repo-info` - Get repository information
- `GET /api/health` - Health check endpoint
- `POST /api/clear-cache` - Clear the cache manually

## Monitoring

After deployment on Render:
- Check service health at: `https://your-app.onrender.com/api/health`
- View logs in Render Dashboard → Your Service → "Logs" tab
- Monitor metrics in "Metrics" tab

## Troubleshooting

### "API rate limit exceeded"
- Add a GitHub token to environment variables
- The cache helps minimize API calls

### "Workflows not updating"
- Click the "Refresh" button to clear cache
- Or wait 5 minutes for automatic cache refresh

### "Service sleeping" (on free tier)
- Render free tier services sleep after 15 minutes of inactivity
- First visit after sleep takes 30-50 seconds to wake up
- Consider upgrading to paid tier for always-on service

## Customization

### Change Repository Source
Edit `server.js` lines 19-20:
```javascript
const GITHUB_OWNER = 'Zie619';  // Change to target owner
const GITHUB_REPO = 'n8n-workflows';  // Change to target repo
```

### Adjust Cache Duration
Edit `server.js` line 17:
```javascript
const CACHE_DURATION = 5 * 60 * 1000; // Change minutes here
```

### Modify UI Theme
Edit the CSS variables in `index.html`:
```css
:root {
    --primary: #ff6b00;  /* Change primary color */
    --primary-dark: #e55a00;  /* Change dark variant */
    /* ... other variables ... */
}
```

## Performance

- Initial load: ~2-5 seconds (depends on repo size)
- Cached requests: <100ms
- GitHub API limits:
  - Without token: 60 requests/hour
  - With token: 5,000 requests/hour
- Render free tier limits:
  - 512 MB RAM
  - Shared CPU
  - Sleeps after 15 min inactivity

## Contributing

Feel free to fork and customize this gallery for your own workflow collections!

## License

MIT - Use freely for any purpose

## Support

- For gallery issues: Create an issue in your GitHub repo
- For n8n workflows: Visit the [original repo](https://github.com/Zie619/n8n-workflows)
- For Render issues: Check [Render docs](https://render.com/docs)
