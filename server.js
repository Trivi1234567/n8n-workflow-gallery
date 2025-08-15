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
    categories: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// GitHub repository details
const GITHUB_OWNER = 'Zie619';
const GITHUB_REPO = 'n8n-workflows';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

// Function to fetch and parse the search_categories.json file
async function fetchWorkflowsFromCategories() {
    console.log('=== Fetching workflows from context/search_categories.json ===');
    
    try {
        // Fetch the search_categories.json file
        const categoriesUrl = `${GITHUB_RAW_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/main/context/search_categories.json`;
        console.log(`Fetching from: ${categoriesUrl}`);
        
        const response = await axios.get(categoriesUrl, {
            timeout: 30000,
            headers: {
                'User-Agent': 'n8n-workflow-gallery'
            }
        });
        
        const data = response.data;
        console.log(`Received data type: ${typeof data}`);
        console.log(`Data is array: ${Array.isArray(data)}`);
        
        // Parse the structure
        let workflows = [];
        
        if (Array.isArray(data)) {
            // If it's directly an array of workflows
            console.log(`Found array with ${data.length} items`);
            workflows = data.map((item, index) => parseWorkflowItem(item, index));
        } else if (typeof data === 'object') {
            // If it's an object, look for workflow arrays
            const keys = Object.keys(data);
            console.log(`Object with keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
            
            // Check if it has a workflows property
            if (data.workflows && Array.isArray(data.workflows)) {
                workflows = data.workflows.map((item, index) => parseWorkflowItem(item, index));
            } 
            // Check if keys are workflow IDs (like "0001", "0002", etc.)
            else if (keys.length > 100 && keys[0].match(/^\d/)) {
                console.log('Keys appear to be workflow IDs');
                workflows = keys.map(key => {
                    const item = data[key];
                    return parseWorkflowItem({ ...item, id: key }, key);
                });
            }
            // Check for any large arrays in the object
            else {
                for (const key of keys) {
                    if (Array.isArray(data[key]) && data[key].length > 50) {
                        console.log(`Found array at key '${key}' with ${data[key].length} items`);
                        workflows = data[key].map((item, index) => parseWorkflowItem(item, index));
                        break;
                    }
                }
            }
        }
        
        // Also fetch the categories definitions
        try {
            const defCategoriesUrl = `${GITHUB_RAW_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/main/context/def_categories.json`;
            const defResponse = await axios.get(defCategoriesUrl, { timeout: 10000 });
            cache.categories = defResponse.data;
            console.log('Loaded category definitions');
        } catch (error) {
            console.log('Could not load category definitions');
        }
        
        console.log(`✅ Processed ${workflows.length} workflows`);
        return workflows;
    } catch (error) {
        console.error('Error fetching categories file:', error.message);
        throw error;
    }
}

// Helper function to parse a workflow item from the JSON data
function parseWorkflowItem(item, index) {
    // Handle different possible structures
    let filename = item.filename || item.name || item.id || `workflow_${index}.json`;
    let name = item.title || item.name || filename;
    
    // Clean up the name
    name = name.replace(/^\d+[-_]/, '') // Remove leading numbers
               .replace(/\.json$/, '') // Remove .json extension
               .replace(/[_-]/g, ' ') // Replace underscores/dashes with spaces
               .trim();
    
    // Smart capitalization
    const acronyms = ['HTTP', 'HTTPS', 'API', 'URL', 'JSON', 'XML', 'RSS', 'AI', 'ML', 'SQL', 'PDF', 'CSV', 'FTP', 'SMTP', 'IMAP', 'OAuth', 'JWT', 'REST', 'SOAP', 'AWS', 'GCP'];
    name = name.split(' ').map(word => {
        const upperWord = word.toUpperCase();
        if (acronyms.includes(upperWord)) return upperWord;
        
        // Special cases
        const specialCases = {
            'n8n': 'n8n',
            'github': 'GitHub',
            'gitlab': 'GitLab',
            'linkedin': 'LinkedIn',
            'youtube': 'YouTube',
            'facebook': 'Facebook',
            'instagram': 'Instagram',
            'whatsapp': 'WhatsApp',
            'telegram': 'Telegram',
            'discord': 'Discord',
            'slack': 'Slack',
            'openai': 'OpenAI',
            'anthropic': 'Anthropic'
        };
        
        const lower = word.toLowerCase();
        if (specialCases[lower]) return specialCases[lower];
        
        // Regular capitalization
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
    
    // Ensure filename ends with .json
    if (!filename.endsWith('.json')) {
        filename = filename + '.json';
    }
    
    return {
        name: name,
        filename: filename,
        description: item.description || item.category || name,
        nodes_count: item.node_count || item.nodes_count || item.nodes || 0,
        trigger_type: item.trigger_type || item.trigger || 'Unknown',
        complexity: item.complexity || determineComplexity(item.node_count || 0),
        active: item.active !== undefined ? item.active : true,
        integrations: item.integrations || item.services || [],
        category: item.category || 'Uncategorized',
        workflow: item.workflow || null,
        size: item.size || 0,
        url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/workflows/${filename}`,
        download_url: `${GITHUB_RAW_BASE}/${GITHUB_OWNER}/${GITHUB_REPO}/main/workflows/${filename}`
    };
}

// Helper function to determine complexity based on node count
function determineComplexity(nodeCount) {
    if (nodeCount <= 5) return 'Low';
    if (nodeCount <= 15) return 'Medium';
    return 'High';
}

// Main function to fetch workflows
async function fetchWorkflows() {
    try {
        // Check cache
        const now = Date.now();
        if (cache.data && (now - cache.timestamp) < CACHE_DURATION) {
            console.log('Returning cached data');
            return cache.data;
        }

        console.log('\n🔍 Fetching workflows from Python documentation system...\n');
        
        let workflows = await fetchWorkflowsFromCategories();
        
        // If no workflows found, create an informative placeholder
        if (!workflows || workflows.length === 0) {
            console.log('\n⚠️ No workflows extracted, creating placeholder');
            workflows = [{
                name: 'Python Documentation System',
                filename: 'readme.md',
                description: `This repository uses a Python-based system with 2,053 workflows in a SQLite database. Clone and run locally: pip install -r requirements.txt && python run.py`,
                nodes_count: 2053,
                trigger_type: 'Info',
                complexity: 'System',
                active: true,
                integrations: ['Python', 'FastAPI', 'SQLite'],
                category: 'Documentation',
                workflow: null,
                size: 0,
                url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
                download_url: null
            }];
        }
        
        console.log(`\n✅ Total workflows loaded: ${workflows.length}`);
        
        // Update cache
        cache.data = workflows;
        cache.timestamp = now;
        
        return workflows;
    } catch (error) {
        console.error('Error in fetchWorkflows:', error.message);
        
        // Return informative error
        return [{
            name: 'Error Loading Workflows',
            filename: 'error.txt',
            description: `Could not load workflows: ${error.message}. This repository uses a Python documentation system. Visit the GitHub repository for instructions.`,
            nodes_count: 0,
            trigger_type: 'Error',
            complexity: 'N/A',
            active: false,
            integrations: [],
            category: 'Error',
            workflow: null,
            size: 0,
            url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
            download_url: null
        }];
    }
}

// API Routes
app.get('/api/workflows', async (req, res) => {
    try {
        const workflows = await fetchWorkflows();
        
        // Apply search filter if provided
        let filtered = workflows;
        if (req.query.q) {
            const search = req.query.q.toLowerCase();
            filtered = workflows.filter(w => 
                w.name.toLowerCase().includes(search) ||
                w.description.toLowerCase().includes(search) ||
                w.category.toLowerCase().includes(search)
            );
        }
        
        res.json({
            success: true,
            count: filtered.length,
            total: workflows.length,
            workflows: filtered,
            cached: cache.timestamp ? (Date.now() - cache.timestamp < CACHE_DURATION) : false,
            cache_age: cache.timestamp ? (Date.now() - cache.timestamp) : 0,
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
            categories: cache.categories ? Object.keys(cache.categories) : []
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
            message: 'This repository uses a Python documentation system. The workflows are stored in a SQLite database.'
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
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'n8n-workflow-gallery',
                    ...(process.env.GITHUB_TOKEN && {
                        'Authorization': `token ${process.env.GITHUB_TOKEN}`
                    })
                },
                timeout: 5000
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
                html_url: response.data.html_url,
                is_python_system: true,
                total_workflows_claimed: 2053
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get categories
app.get('/api/categories', (req, res) => {
    res.json({
        success: true,
        categories: cache.categories || {},
        available: [
            'AI Agent Development',
            'Business Process Automation',
            'Cloud Storage & File Management',
            'Communication & Messaging',
            'Creative Content & Video Automation',
            'Creative Design Automation',
            'CRM & Sales',
            'Data Processing & Analysis',
            'E-commerce & Retail',
            'Financial & Accounting',
            'Marketing & Advertising Automation',
            'Project Management',
            'Social Media Management',
            'Technical Infrastructure & DevOps',
            'Web Scraping & Data Extraction'
        ]
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        cache_status: cache.data ? 'populated' : 'empty',
        cached_workflows: cache.data ? cache.data.length : 0,
        repository: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        system_type: 'Python Documentation System'
    });
});

// Clear cache
app.post('/api/clear-cache', (req, res) => {
    cache.data = null;
    cache.timestamp = 0;
    cache.categories = null;
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
        system_info: 'Python-based documentation system with SQLite database',
        expected_workflows: 2053,
        loaded_workflows: cache.data ? cache.data.length : 0,
        categories_loaded: !!cache.categories,
        sample_data: cache.data ? cache.data.slice(0, 3).map(w => ({
            name: w.name,
            category: w.category,
            nodes: w.nodes_count
        })) : null
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
    console.log('');
    console.log('📚 This repository uses a Python documentation system');
    console.log('   with 2,053 workflows stored in a SQLite database.');
    console.log('');
    console.log('🔍 Attempting to extract workflow metadata from');
    console.log('   context/search_categories.json file...');
    console.log('');
    console.log(`Visit http://localhost:${PORT} to view the gallery`);
    console.log('=====================================');
});
