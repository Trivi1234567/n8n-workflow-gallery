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
        console.log(`Repository: ${GITHUB_OWNER}/${GITHUB_REPO}`);
        
        // Fetch repository contents
        const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
        console.log(`Fetching from: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'n8n-workflow-gallery',
                // Add GitHub token if you have one (optional, increases rate limit)
                ...(process.env.GITHUB_TOKEN && {
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`
                })
            },
            timeout: 10000 // 10 second timeout
        });

        console.log(`Found ${response.data.length} items in repository`);

        // Filter JSON files only
        const jsonFiles = response.data.filter(file => 
            file.name.endsWith('.json') && file.type === 'file'
        );

        console.log(`Found ${jsonFiles.length} JSON files`);

        // Limit to first 50 files to avoid timeout issues
        const filesToProcess = jsonFiles.slice(0, 50);
        if (jsonFiles.length > 50) {
            console.log(`Processing first 50 of ${jsonFiles.length} files`);
        }

        // Fetch content for each JSON file with better error handling
        const workflows = await Promise.all(
            filesToProcess.map(async (file) => {
                try {
                    console.log(`Fetching workflow: ${file.name}`);
                    
                    // Fetch file content with timeout
                    const contentResponse = await axios.get(file.download_url, {
                        timeout: 5000 // 5 second timeout per file
                    });
                    
                    const workflow = contentResponse.data;
                    
                    // Validate that it's a valid n8n workflow
                    if (typeof workflow !== 'object') {
                        console.log(`Skipping ${file.name}: Not a valid JSON object`);
                        return null;
                    }
                    
                    return {
                        name: file.name.replace('.json', ''),
                        filename: file.name,
                        size: file.size,
                        url: file.html_url,
                        download_url: file.download_url,
                        workflow: workflow,
                        nodes_count: workflow.nodes ? workflow.nodes.length : 0,
                        connections_count: workflow.connections ? Object.keys(workflow.connections).length : 0,
                        description: workflow.name || workflow.description || '',
                        tags: workflow.tags || [],
                        created_at: workflow.createdAt || null,
                        updated_at: workflow.updatedAt || null
                    };
                } catch (error) {
                    console.error(`Error fetching workflow ${file.name}:`, error.message);
                    // Return basic info even if we can't fetch content
                    return {
                        name: file.name.replace('.json', ''),
                        filename: file.name,
                        size: file.size,
                        url: file.html_url,
                        download_url: file.download_url,
                        workflow: {},
                        nodes_count: 0,
                        connections_count: 0,
                        description: 'Unable to load workflow details',
                        tags: [],
                        created_at: null,
                        updated_at: null
                    };
                }
            })
        );

        // Filter out any null values
        const validWorkflows = workflows.filter(w => w !== null);
        console.log(`Successfully processed ${validWorkflows.length} workflows`);

        // Update cache
        cache.data = validWorkflows;
        cache.timestamp = now;

        return validWorkflows;
    } catch (error) {
        console.error('Error fetching workflows:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        // Return empty array instead of throwing
        // This prevents the app from crashing
        return [];
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
            cache_age: Date.now() - cache.timestamp,
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`
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
        const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
        console.log(`Fetching repo info from: ${url}`);
        
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'n8n-workflow-gallery',
                ...(process.env.GITHUB_TOKEN && {
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`
                })
            },
            timeout: 5000
        });
        
        res.json({
            success: true,
            repo: {
                name: response.data.name,
                full_name: response.data.full_name,
                description: response.data.description,
                stars: response.data.stargazers_count,
                forks: response.data.forks_count,
                updated_at: response.data.updated_at,
                html_url: response.data.html_url,
                private: response.data.private
            }
        });
    } catch (error) {
        console.error('Repo info error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`
        });
    }
});

// Health check endpoint with more details
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cache_status: cache.data ? 'populated' : 'empty',
        cache_age: cache.data ? Date.now() - cache.timestamp : null,
        repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        github_token: process.env.GITHUB_TOKEN ? 'configured' : 'not configured',
        cached_workflows: cache.data ? cache.data.length : 0
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

// Debug endpoint to check current configuration
app.get('/api/debug', (req, res) => {
    res.json({
        repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        github_api_url: `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`,
        github_token_configured: !!process.env.GITHUB_TOKEN,
        cache_duration_minutes: CACHE_DURATION / 60000,
        node_env: process.env.NODE_ENV || 'development'
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Repository: ${GITHUB_OWNER}/${GITHUB_REPO}`);
    console.log(`GitHub Token: ${process.env.GITHUB_TOKEN ? 'Configured' : 'Not configured'}`);
    console.log(`Visit http://localhost:${PORT} to view the gallery`);
});
