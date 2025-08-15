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
    timestamp: 0,
    structure: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// GitHub repository details
const GITHUB_OWNER = 'Zie619';
const GITHUB_REPO = 'n8n-workflows';
const GITHUB_API_BASE = 'https://api.github.com';

// Helper function to make GitHub API requests
async function githubRequest(endpoint) {
    const url = `${GITHUB_API_BASE}${endpoint}`;
    console.log(`GitHub API Request: ${url}`);
    
    try {
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
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        throw error;
    }
}

// Function to explore repository structure and find JSON workflows
async function exploreRepository() {
    console.log('=== Exploring Repository Structure ===');
    
    try {
        // First, get the root contents
        const rootContents = await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`);
        console.log(`Found ${rootContents.length} items in root`);
        
        // Look for folders and JSON files
        const folders = rootContents.filter(item => item.type === 'dir');
        const rootJsonFiles = rootContents.filter(item => 
            item.type === 'file' && 
            item.name.endsWith('.json') && 
            !item.name.includes('package.json') &&
            !item.name.includes('tsconfig.json') &&
            !item.name.includes('composer.json')
        );
        
        console.log(`Folders found: ${folders.map(f => f.name).join(', ')}`);
        console.log(`JSON files in root: ${rootJsonFiles.length}`);
        
        let allJsonFiles = [...rootJsonFiles];
        
        // Check each folder for JSON files
        for (const folder of folders) {
            console.log(`\nChecking folder: ${folder.name}`);
            try {
                const folderContents = await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${folder.path}`);
                
                // Handle if folderContents is an array
                if (Array.isArray(folderContents)) {
                    const jsonFilesInFolder = folderContents.filter(item => 
                        item.type === 'file' && 
                        item.name.endsWith('.json')
                    );
                    
                    console.log(`  Found ${jsonFilesInFolder.length} JSON files in ${folder.name}`);
                    
                    if (jsonFilesInFolder.length > 0) {
                        // Add folder info to each file
                        jsonFilesInFolder.forEach(file => {
                            file.folder = folder.name;
                        });
                        allJsonFiles.push(...jsonFilesInFolder);
                    }
                    
                    // If this folder has a lot of JSON files, it's probably our workflows folder
                    if (jsonFilesInFolder.length > 100) {
                        console.log(`  >>> This looks like the main workflows folder!`);
                    }
                } else {
                    console.log(`  Folder response was not an array`);
                }
            } catch (error) {
                console.log(`  Could not access folder ${folder.name}: ${error.message}`);
            }
        }
        
        console.log(`\n=== Total JSON files found: ${allJsonFiles.length} ===`);
        
        // Store the structure for debugging
        cache.structure = {
            folders: folders.map(f => f.name),
            totalJsonFiles: allJsonFiles.length,
            filesByFolder: folders.reduce((acc, folder) => {
                const filesInFolder = allJsonFiles.filter(f => f.folder === folder.name);
                if (filesInFolder.length > 0) {
                    acc[folder.name] = filesInFolder.length;
                }
                return acc;
            }, { root: rootJsonFiles.length })
        };
        
        return allJsonFiles;
    } catch (error) {
        console.error('Error exploring repository:', error.message);
        throw error;
    }
}

// Function to fetch and process workflows
async function fetchWorkflows() {
    try {
        // Check cache first
        const now = Date.now();
        if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
            console.log('Returning cached data');
            return cache.data;
        }

        console.log('Fetching fresh workflow data...');
        
        // Explore repository to find all JSON files
        const jsonFiles = await exploreRepository();
        
        if (jsonFiles.length === 0) {
            console.log('No JSON workflow files found in repository');
            return [];
        }
        
        // Process files into workflow objects
        const workflows = jsonFiles.map(file => {
            // Extract readable name from filename
            let displayName = file.name.replace('.json', '');
            
            // Remove leading numbers and underscores (e.g., "0001_" -> "")
            displayName = displayName.replace(/^\d+[-_]/, '');
            
            // Replace underscores and hyphens with spaces
            displayName = displayName.replace(/[_-]/g, ' ');
            
            // Smart capitalization for common terms
            const acronyms = ['HTTP', 'HTTPS', 'API', 'URL', 'JSON', 'XML', 'RSS', 'AI', 'ML', 'SQL', 'PDF', 'CSV', 'FTP', 'SMTP', 'IMAP', 'OAuth', 'JWT', 'REST', 'SOAP', 'AWS', 'GCP'];
            displayName = displayName.split(' ').map(word => {
                const upperWord = word.toUpperCase();
                if (acronyms.includes(upperWord)) {
                    return upperWord;
                }
                // Special cases
                if (word.toLowerCase() === 'n8n') return 'n8n';
                if (word.toLowerCase() === 'github') return 'GitHub';
                if (word.toLowerCase() === 'gitlab') return 'GitLab';
                if (word.toLowerCase() === 'linkedin') return 'LinkedIn';
                if (word.toLowerCase() === 'youtube') return 'YouTube';
                if (word.toLowerCase() === 'facebook') return 'Facebook';
                if (word.toLowerCase() === 'instagram') return 'Instagram';
                if (word.toLowerCase() === 'whatsapp') return 'WhatsApp';
                
                // Regular capitalization
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }).join(' ');
            
            // Clean up extra spaces
            displayName = displayName.replace(/\s+/g, ' ').trim();
            
            return {
                name: displayName || file.name.replace('.json', ''),
                filename: file.name,
                size: file.size,
                url: file.html_url,
                download_url: file.download_url,
                folder: file.folder || 'root',
                path: file.path,
                workflow: null, // Don't fetch content initially for performance
                nodes_count: 0,
                connections_count: 0,
                description: `Workflow: ${displayName}`,
                tags: [],
                created_at: null,
                updated_at: null
            };
        });
        
        console.log(`Successfully processed ${workflows.length} workflows`);
        
        // Update cache
        cache.data = workflows;
        cache.timestamp = now;
        
        return workflows;
    } catch (error) {
        console.error('Error in fetchWorkflows:', error.message);
        // Return empty array instead of throwing to prevent app crash
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
            cached: cache.timestamp ? (Date.now() - cache.timestamp < CACHE_DURATION) : false,
            cache_age: cache.timestamp ? (Date.now() - cache.timestamp) : 0,
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
            structure: cache.structure
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
                console.log(`Fetching content for ${workflow.filename} from ${workflow.download_url}`);
                const contentResponse = await axios.get(workflow.download_url, {
                    timeout: 10000
                });
                workflow.workflow = contentResponse.data;
                workflow.nodes_count = contentResponse.data.nodes ? contentResponse.data.nodes.length : 0;
                workflow.connections_count = contentResponse.data.connections ? Object.keys(contentResponse.data.connections).length : 0;
                workflow.description = contentResponse.data.name || contentResponse.data.description || workflow.description;
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
        const repoData = await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`);
        
        res.json({
            success: true,
            repo: {
                name: repoData.name,
                full_name: repoData.full_name,
                description: repoData.description,
                stars: repoData.stargazers_count,
                forks: repoData.forks_count,
                updated_at: repoData.updated_at,
                html_url: repoData.html_url,
                private: repoData.private,
                default_branch: repoData.default_branch
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

// Repository structure endpoint - shows where files are located
app.get('/api/structure', async (req, res) => {
    try {
        // Force a fresh exploration
        const jsonFiles = await exploreRepository();
        
        res.json({
            success: true,
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
            structure: cache.structure,
            total_files: jsonFiles.length,
            sample_files: jsonFiles.slice(0, 5).map(f => ({
                name: f.name,
                folder: f.folder || 'root',
                path: f.path,
                size: f.size
            }))
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
        cache_age: cache.data ? Date.now() - cache.timestamp : null,
        repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        github_token: process.env.GITHUB_TOKEN ? 'configured' : 'not configured',
        cached_workflows: cache.data ? cache.data.length : 0,
        structure: cache.structure
    });
});

// Clear cache endpoint
app.post('/api/clear-cache', (req, res) => {
    cache.data = null;
    cache.timestamp = 0;
    cache.structure = null;
    res.json({
        success: true,
        message: 'Cache cleared successfully'
    });
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
    res.json({
        repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        github_token_configured: !!process.env.GITHUB_TOKEN,
        cache_duration_minutes: CACHE_DURATION / 60000,
        node_env: process.env.NODE_ENV || 'development',
        cached_data: cache.data ? {
            count: cache.data.length,
            sample: cache.data.slice(0, 3).map(w => w.name)
        } : null,
        structure: cache.structure
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('=====================================');
    console.log(`Server running on port ${PORT}`);
    console.log(`Repository: ${GITHUB_OWNER}/${GITHUB_REPO}`);
    console.log(`GitHub Token: ${process.env.GITHUB_TOKEN ? 'Configured ✓' : 'Not configured (rate limits may apply)'}`);
    console.log(`Visit http://localhost:${PORT} to view the gallery`);
    console.log('=====================================');
});
