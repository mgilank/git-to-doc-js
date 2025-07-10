const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');
const archiver = require('archiver');
const yauzl = require('yauzl');
const ignore = require('ignore');

const app = express();
const PORT = process.env.PORT || 3000;

// Create outputs directory for saved files
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// Check and create outputs directory if it doesn't exist
function ensureOutputsDirectory() {
  try {
    if (!fs.existsSync(OUTPUTS_DIR)) {
      console.log('Creating outputs directory...');
      fs.ensureDirSync(OUTPUTS_DIR);
      console.log(`✓ Created outputs directory at: ${OUTPUTS_DIR}`);
    } else {
      console.log(`✓ Outputs directory exists at: ${OUTPUTS_DIR}`);
    }
  } catch (error) {
    console.error('Error creating outputs directory:', error);
    throw new Error(`Failed to create outputs directory: ${error.message}`);
  }
}

// Initialize outputs directory
ensureOutputsDirectory();

// In-memory store for saved documentation metadata
const savedDocuments = new Map();

// Function to load existing files from outputs directory on startup
function loadExistingFiles() {
  try {
    if (!fs.existsSync(OUTPUTS_DIR)) {
      return;
    }
    
    const files = fs.readdirSync(OUTPUTS_DIR);
    
    files.forEach(filename => {
      const filePath = path.join(OUTPUTS_DIR, filename);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        // Extract metadata from filename
        const ext = path.extname(filename);
        const format = ext === '.json' ? 'json' : 'markdown';
        const baseName = path.basename(filename, ext);
        
        // Generate a unique ID based on filename
        const id = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
        
        // Extract project name and timestamp from filename pattern
        const parts = baseName.split('_');
        const projectName = parts.slice(0, -1).join('_') || 'Unknown_Project';
        const timestamp = parts[parts.length - 1];
        
        const fileMetadata = {
          id: id,
          filename: filename,
          format: format,
          projectName: projectName,
          source: {
            type: 'restored_from_disk',
            timestamp: timestamp
          },
          createdAt: stats.birthtime.toISOString(),
          size: stats.size,
          filePath: filePath,
          downloadUrl: `/api/files/${id}`
        };
        
        savedDocuments.set(id, fileMetadata);
      }
    });
    
    console.log(`Loaded ${savedDocuments.size} existing files from outputs directory`);
  } catch (error) {
    console.error('Error loading existing files:', error);
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Utility function to read .gitignore patterns
function getIgnorePatterns(repoPath) {
  const gitignorePath = path.join(repoPath, '.gitignore');
  const ig = ignore();
  
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    ig.add(gitignoreContent);
  }
  
  // Add common patterns to ignore
  ig.add([
    'node_modules/**',
    '.git/**',
    '*.log',
    '.DS_Store',
    'dist/**',
    'build/**',
    '.env*',
    '*.tmp',
    '*.temp'
  ]);
  
  return ig;
}

// Function to get file tree structure
function getFileTree(dirPath, basePath = '', ig = null) {
  const items = [];
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const relativePath = path.join(basePath, file);
    
    // Skip if ignored
    if (ig && ig.ignores(relativePath)) {
      continue;
    }
    
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      const children = getFileTree(fullPath, relativePath, ig);
      if (children.length > 0) {
        items.push({
          name: file,
          type: 'directory',
          path: relativePath,
          children
        });
      }
    } else {
      items.push({
        name: file,
        type: 'file',
        path: relativePath,
        size: stat.size
      });
    }
  }
  
  return items;
}

// Function to read file content with encoding detection
function readFileContent(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // Check if file is binary
    const isBinary = buffer.some(byte => byte === 0);
    
    if (isBinary) {
      return {
        content: '[Binary file]',
        encoding: 'binary',
        size: buffer.length
      };
    }
    
    return {
      content: buffer.toString('utf8'),
      encoding: 'utf8',
      size: buffer.length
    };
  } catch (error) {
    return {
      content: `[Error reading file: ${error.message}]`,
      encoding: 'error',
      size: 0
    };
  }
}

// Function to generate documentation from repository
function generateDocumentation(repoPath) {
  const ig = getIgnorePatterns(repoPath);
  const fileTree = getFileTree(repoPath, '', ig);
  
  // Read package.json or similar config files for project info
  let projectInfo = {};
  const packageJsonPath = path.join(repoPath, 'package.json');
  const readmePath = path.join(repoPath, 'README.md');
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      projectInfo = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (error) {
      console.error('Error reading package.json:', error);
    }
  }
  
  let readmeContent = '';
  if (fs.existsSync(readmePath)) {
    readmeContent = fs.readFileSync(readmePath, 'utf8');
  }
  
  // Collect all file contents
  const files = [];
  
  function collectFiles(items, currentPath = '') {
    for (const item of items) {
      if (item.type === 'file') {
        const fullPath = path.join(repoPath, item.path);
        const fileContent = readFileContent(fullPath);
        
        files.push({
          path: item.path,
          name: item.name,
          content: fileContent.content,
          encoding: fileContent.encoding,
          size: fileContent.size
        });
      } else if (item.type === 'directory' && item.children) {
        collectFiles(item.children, item.path);
      }
    }
  }
  
  collectFiles(fileTree);
  
  return {
    projectInfo: {
      name: projectInfo.name || 'Unknown Project',
      description: projectInfo.description || '',
      version: projectInfo.version || '',
      dependencies: projectInfo.dependencies || {},
      devDependencies: projectInfo.devDependencies || {}
    },
    readme: readmeContent,
    fileTree,
    files,
    stats: {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      fileTypes: files.reduce((types, file) => {
        const ext = path.extname(file.name).toLowerCase();
        types[ext] = (types[ext] || 0) + 1;
        return types;
      }, {})
    },
    generatedAt: new Date().toISOString()
  };
}

// Utility function to save documentation to file
function saveDocumentationToFile(documentation, source, format = 'json') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const projectName = documentation.projectInfo.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `${projectName}_${timestamp}.${format}`;
  const filePath = path.join(OUTPUTS_DIR, filename);
  
  let content;
  if (format === 'json') {
    content = JSON.stringify(documentation, null, 2);
  } else if (format === 'markdown') {
    content = convertToMarkdown(documentation);
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  
  const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const metadata = {
    id: fileId,
    filename,
    filePath,
    format,
    projectName: documentation.projectInfo.name,
    source,
    createdAt: new Date().toISOString(),
    size: fs.statSync(filePath).size,
    downloadUrl: `/api/files/${fileId}`
  };
  
  savedDocuments.set(fileId, metadata);
  
  return metadata;
}

// Function to convert documentation to markdown
function convertToMarkdown(doc) {
  let markdown = `# ${doc.projectInfo.name}\n\n`;
  
  if (doc.projectInfo.description) {
    markdown += `${doc.projectInfo.description}\n\n`;
  }
  
  if (doc.readme) {
    markdown += `## README\n\n${doc.readme}\n\n`;
  }
  
  markdown += `## Project Structure\n\n`;
  
  function addTreeToMarkdown(items, level = 0) {
    let result = '';
    for (const item of items) {
      const indent = '  '.repeat(level);
      result += `${indent}- ${item.name}${item.type === 'directory' ? '/' : ''}\n`;
      if (item.children) {
        result += addTreeToMarkdown(item.children, level + 1);
      }
    }
    return result;
  }
  
  markdown += addTreeToMarkdown(doc.fileTree);
  
  markdown += `\n## Files\n\n`;
  
  for (const file of doc.files) {
    if (file.encoding !== 'binary') {
      markdown += `### ${file.path}\n\n`;
      markdown += `\`\`\`\n${file.content}\n\`\`\`\n\n`;
    }
  }
  
  return markdown;
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Clone repository from URL
app.post('/api/clone', async (req, res) => {
  try {
    const { repoUrl, branch = 'main' } = req.body;
    
    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }
    
    const tempDir = path.join(__dirname, 'temp', `repo_${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    const git = simpleGit();
    
    console.log(`Cloning repository: ${repoUrl}`);
    await git.clone(repoUrl, tempDir, ['--depth', '1', '--branch', branch]);
    
    const documentation = generateDocumentation(tempDir);
    
    // Save documentation to files
    const source = {
      type: 'git_clone',
      url: repoUrl,
      branch
    };
    
    const jsonFile = saveDocumentationToFile(documentation, source, 'json');
    const markdownFile = saveDocumentationToFile(documentation, source, 'markdown');
    
    // Clean up
    await fs.remove(tempDir);
    
    res.json({
      success: true,
      documentation,
      source,
      savedFiles: {
        json: jsonFile,
        markdown: markdownFile
      }
    });
    
  } catch (error) {
    console.error('Error cloning repository:', error);
    res.status(500).json({ 
      error: 'Failed to clone repository', 
      details: error.message 
    });
  }
});

// Upload repository as ZIP file
app.post('/api/upload', upload.single('repository'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const tempDir = path.join(__dirname, 'temp', `upload_${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    // Extract ZIP file
    await new Promise((resolve, reject) => {
      yauzl.open(req.file.path, { lazyEntries: true }, (err, zipfile) => {
        if (err) return reject(err);
        
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            // Directory
            zipfile.readEntry();
          } else {
            // File
            const filePath = path.join(tempDir, entry.fileName);
            fs.ensureDirSync(path.dirname(filePath));
            
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) return reject(err);
              
              const writeStream = fs.createWriteStream(filePath);
              readStream.pipe(writeStream);
              writeStream.on('close', () => zipfile.readEntry());
            });
          }
        });
        
        zipfile.on('end', resolve);
        zipfile.on('error', reject);
      });
    });
    
    const documentation = generateDocumentation(tempDir);
    
    // Save documentation to files
    const source = {
      type: 'file_upload',
      filename: req.file.originalname
    };
    
    const jsonFile = saveDocumentationToFile(documentation, source, 'json');
    const markdownFile = saveDocumentationToFile(documentation, source, 'markdown');
    
    // Clean up
    await fs.remove(tempDir);
    await fs.remove(req.file.path);
    
    res.json({
      success: true,
      documentation,
      source,
      savedFiles: {
        json: jsonFile,
        markdown: markdownFile
      }
    });
    
  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({ 
      error: 'Failed to process uploaded file', 
      details: error.message 
    });
  }
});

// Generate documentation for local directory
app.post('/api/local', (req, res) => {
  try {
    const { path: localPath } = req.body;
    
    if (!localPath) {
      return res.status(400).json({ error: 'Local path is required' });
    }
    
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Path does not exist' });
    }
    
    const documentation = generateDocumentation(localPath);
    
    // Save documentation to files
    const source = {
      type: 'local_directory',
      path: localPath
    };
    
    const jsonFile = saveDocumentationToFile(documentation, source, 'json');
    const markdownFile = saveDocumentationToFile(documentation, source, 'markdown');
    
    res.json({
      success: true,
      documentation,
      source,
      savedFiles: {
        json: jsonFile,
        markdown: markdownFile
      }
    });
    
  } catch (error) {
    console.error('Error processing local directory:', error);
    res.status(500).json({ 
      error: 'Failed to process local directory', 
      details: error.message 
    });
  }
});

// Get list of saved files
app.get('/api/files', (req, res) => {
  const files = Array.from(savedDocuments.values()).map(file => ({
    id: file.id,
    filename: file.filename,
    format: file.format,
    projectName: file.projectName,
    source: file.source,
    createdAt: file.createdAt,
    size: file.size,
    downloadUrl: file.downloadUrl
  }));
  
  res.json({
    success: true,
    files: files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  });
});

// Download saved file by ID
app.get('/api/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  const fileMetadata = savedDocuments.get(fileId);
  
  if (!fileMetadata) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  if (!fs.existsSync(fileMetadata.filePath)) {
    savedDocuments.delete(fileId);
    return res.status(404).json({ error: 'File no longer exists on disk' });
  }
  
  const contentType = fileMetadata.format === 'json' ? 'application/json' : 'text/markdown';
  
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.filename}"`);
  res.sendFile(fileMetadata.filePath);
});

// Delete saved file
app.delete('/api/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  const fileMetadata = savedDocuments.get(fileId);
  
  if (!fileMetadata) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  try {
    if (fs.existsSync(fileMetadata.filePath)) {
      fs.unlinkSync(fileMetadata.filePath);
    }
    savedDocuments.delete(fileId);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete file',
      details: error.message
    });
  }
});

// Download documentation as JSON/Markdown (POST endpoint to handle large data)
app.post('/api/download/:format', (req, res) => {
  const { format } = req.params;
  const { documentation } = req.body;
  
  if (!documentation) {
    return res.status(400).json({ error: 'Documentation data is required' });
  }
  
  try {
    const doc = typeof documentation === 'string' ? JSON.parse(documentation) : documentation;
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="documentation.json"');
      res.send(JSON.stringify(doc, null, 2));
    } else if (format === 'markdown') {
      // Convert to markdown format
      let markdown = `# ${doc.projectInfo.name}\n\n`;
      
      if (doc.projectInfo.description) {
        markdown += `${doc.projectInfo.description}\n\n`;
      }
      
      if (doc.readme) {
        markdown += `## README\n\n${doc.readme}\n\n`;
      }
      
      markdown += `## Project Structure\n\n`;
      
      function addTreeToMarkdown(items, level = 0) {
        let result = '';
        for (const item of items) {
          const indent = '  '.repeat(level);
          result += `${indent}- ${item.name}${item.type === 'directory' ? '/' : ''}\n`;
          if (item.children) {
            result += addTreeToMarkdown(item.children, level + 1);
          }
        }
        return result;
      }
      
      markdown += addTreeToMarkdown(doc.fileTree);
      
      markdown += `\n## Files\n\n`;
      
      for (const file of doc.files) {
        if (file.encoding !== 'binary') {
          markdown += `### ${file.path}\n\n`;
          markdown += `\`\`\`\n${file.content}\n\`\`\`\n\n`;
        }
      }
      
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', 'attachment; filename="documentation.md"');
      res.send(markdown);
    } else {
      res.status(400).json({ error: 'Unsupported format' });
    }
  } catch (error) {
    res.status(400).json({ error: 'Invalid documentation data' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error', 
    details: error.message 
  });
});

// Load existing files on startup
loadExistingFiles();

// Start server
app.listen(PORT, () => {
  console.log(`GitToDoc server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});