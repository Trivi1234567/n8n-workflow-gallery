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
const WORKFLOWS_FOLDER = 'workflows'; // The workflows are in this folder!

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
        console.log(`Looking in folder: ${WORKFLOWS_FOLDER}`);
        
        // Fetch the workflows folder contents
        const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${WORKFLOWS_FOLDER}`;
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

        console.log(`Found ${response.data.length} items in workflows folder`);

        // Filter JSON files only
        const jsonFiles = response.data.filter(file => 
            file.name.endsWith('.json') && file.type === 'file'
        );

        console.log(`Found ${jsonFiles.length} JSON workflow files`);

        // Process in batches to avoid timeout
        const batchSize = 20;
        const allWorkflows = [];
        
        for (let i = 0; i < jsonFiles.length; i += batchSize) {
            const batch = jsonFiles.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(jsonFiles.length/batchSize)}`);
            
            const batchWorkflows = await Promise.all(
                batch.map(async (file) => {
                    try {
                        // For large collections, we'll skip downloading full content initially
                        // Just use the metadata to make it faster
                        
                        // Extract readable name from filename
                        // Format: 0001_Service_Name_Type.json -> Service Name Type
                        let displayName = file.name.replace('.json', '');
                        
                        // Remove leading numbers and underscores
                        displayName = displayName.replace(/^\d+_/, '');
                        
                        // Replace underscores with spaces
                        displayName = displayName.replace(/_/g, ' ');
                        
                        // Smart capitalization
                        displayName = displayName.split(' ').map(word => {
                            // Keep acronyms uppercase
                            if (['HTTP', 'API', 'URL', 'JSON', 'XML', 'RSS', 'AI', 'ML', 'SQL'].includes(word.toUpperCase())) {
                                return word.toUpperCase();
                            }
                            // Capitalize first letter
                            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                        }).join(' ');
                        
                        return {
                            name: displayName,
                            filename: file.name,
                            size: file.size,
                            url: file.html_url,
                            download_url: file.download_url,
                            workflow: null, // Don't fetch content initially for performance
                            nodes_count: 0,
                            connections_count: 0,
                            description: displayName,
                            tags: [],
                            created_at: null,
                            updated_at: null
                        };
                    } catch (error) {
                        console.error(`Error processing workflow ${file.name}:`, error.message);
                        return null;
                    }
                })
            );
            
            allWorkflows.push(...batchWorkflows.filter(w => w !== null));
        }

        console.log(`Successfully processed ${allWorkflows.length} workflows`);

        // Update cache
        cache.data = allWorkflows;
        cache.timestamp = now;

        return allWorkflows;
    } catch (error) {
        console.error('Error fetching workflows:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
            
            // If it's a 404, the folder might not exist
            if (error.response.status === 404) {
                console.error('Workflows folder not found. Trying root directory...');
                return fetchWorkflowsFromRoot();
            }
        }
        throw error;
    }
}

// Fallback function to fetch from root if workflows folder doesn't exist
async function fetchWorkflowsFromRoot() {
    try {
        console.log('Attempting to fetch from repository root');
        
        const url = `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'n8n-workflow-gallery',
                ...(process.env.GITHUB_TOKEN && {
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`
                })
            },
            timeout: 10000
        });

        // Filter JSON files only
        const jsonFiles = response.data.filter(file => 
            file.name.endsWith('.json') && 
            file.type === 'file' &&
            !file.name.includes('package.json') &&
            !file.name.includes('tsconfig.json')
        );

        console.log(`Found ${jsonFiles.length} JSON files in root`);

        const workflows = jsonFiles.map(file => ({
            name: file.name.replace('.json', '').replace(/_/g, ' '),
            filename: file.name,
            size: file.size,
            url: file.html_url,
            download_url: file.download_url,
            workflow: null,
            nodes_count: 0,
            connections_count: 0,
            description: '',
            tags: [],
            created_at: null,
            updated_at: null
        }));

        return workflows;
    } catch (error) {
        console.error('Error fetching from root:', error.message);
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
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
            folder: WORKFLOWS_FOLDER
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

// Get single workflow with full content
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
        
        // If we don't have the full content, fetch it now
        if (!workflow.workflow) {
            try {
                const contentResponse = await axios.get(workflow.download_url, {
                    timeout: 5000
                });
                workflow.workflow = contentResponse.data;
                workflow.nodes_count = contentResponse.data.nodes ? contentResponse.data.nodes.length : 0;
                workflow.connections_count = contentResponse.data.connections ? Object.keys(contentResponse.data.connections).length : 0;
            } catch (error) {
                console.error('Error fetching workflow content:', error.message);
            }
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
        workflows_folder: WORKFLOWS_FOLDER,
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
        workflows_folder: WORKFLOWS_FOLDER,
        github_api_url: `${GITHUB_API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${WORKFLOWS_FOLDER}`,
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
    console.log(`Workflows folder: ${WORKFLOWS_FOLDER}`);
    console.log(`GitHub Token: ${process.env.GITHUB_TOKEN ? 'Configured' : 'Not configured'}`);
    console.log(`Visit http://localhost:${PORT} to view the gallery`);
});
