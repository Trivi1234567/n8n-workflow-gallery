const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Cache configuration
let cache = {
    data: null,
    timestamp: 0
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// GitHub repository details
const GITHUB_OWNER = 'Zie619';
const GITHUB_REPO = 'n8n-workflows';
const GITHUB_API_BASE = 'https://api.github.com';

// Function to fetch repository contents
async function fetchWorkflows() {
    try {
        // Check cache first
        const now = Date.now();
        if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
            console.log('Returning cached data');
            return cache.data;
        }

        console.log('Fetching fresh data from GitHub');
        
        // Fetch repository contents
        const response = await axios.get(
            `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    // Add GitHub token if you have one (optional, increases rate limit)
                    ...(process.env.GITHUB_TOKEN && {
                        'Authorization': `token ${process.env.GITHUB_TOKEN}`
                    })
                }
            }
        );

        // Filter JSON files only
        const jsonFiles = response.data.filter(file => 
            file.name.endsWith('.json') && file.type === 'file'
        );

        // Fetch content for each JSON file
        const workflows = await Promise.all(
            jsonFiles.map(async (file) => {
                try {
                    // Fetch file content
                    const contentResponse = await axios.get(file.download_url);
                    const workflow = contentResponse.data;
                    
                    return {
                        name: file.name.replace('.json', ''),
                        filename: file.name,
                        size: file.size,
                        url: file.html_url,
                        download_url: file.download_url,
                        workflow: workflow,
                        nodes_count: workflow.nodes ? workflow.nodes.length : 0,
                        connections_count: workflow.connections ? Object.keys(workflow.connections).length : 0,
                        description: workflow.description || '',
                        tags: workflow.tags || [],
                        created_at: workflow.createdAt || null,
                        updated_at: workflow.updatedAt || null
                    };
                } catch (error) {
                    console.error(`Error fetching workflow ${file.name}:`, error.message);
                    return null;
                }
            })
        );

        // Filter out any failed fetches
        const validWorkflows = workflows.filter(w => w !== null);

        // Update cache
        cache.data = validWorkflows;
        cache.timestamp = now;

        return validWorkflows;
    } catch (error) {
        console.error('Error fetching workflows:', error.message);
        throw error;
    }
}

// API Routes
app.get('/api/workflows', async (req, res) => {
    try {
        const workflows = await fetchWorkflows();
        res.json({
            success: true,
            count: workflows.length,
            workflows: workflows,
            cached: Date.now() - cache.timestamp < CACHE_DURATION,
            cache_age: Date.now() - cache.timestamp
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get single workflow
app.get('/api/workflow/:filename', async (req, res) => {
    try {
        const workflows = await fetchWorkflows();
        const workflow = workflows.find(w => w.filename === req.params.filename);
        
        if (!workflow) {
            return res.status(404).json({
                success: false,
                error: 'Workflow not found'
            });
        }
        
        res.json({
            success: true,
            workflow: workflow
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Repository info endpoint
app.get('/api/repo-info', async (req, res) => {
    try {
        const response = await axios.get(
            `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    ...(process.env.GITHUB_TOKEN && {
                        'Authorization': `token ${process.env.GITHUB_TOKEN}`
                    })
                }
            }
        );
        
        res.json({
            success: true,
            repo: {
                name: response.data.name,
                full_name: response.data.full_name,
                description: response.data.description,
                stars: response.data.stargazers_count,
                forks: response.data.forks_count,
                updated_at: response.data.updated_at,
                html_url: response.data.html_url
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cache_status: cache.data ? 'populated' : 'empty',
        cache_age: cache.data ? Date.now() - cache.timestamp : null
    });
});

// Clear cache endpoint
app.post('/api/clear-cache', (req, res) => {
    cache.data = null;
    cache.timestamp = 0;
    res.json({
        success: true,
        message: 'Cache cleared successfully'
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to view the gallery`);
});
