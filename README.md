# GitToDoc 🚀

Inspired by https://www.gittodoc.com/
A powerful tool to convert Git repositories into AI-friendly documentation. This Express.js application processes Git repositories and generates comprehensive documentation that can be easily consumed by AI systems.

## Features

- **Multiple Input Methods**:
  - Clone repositories directly from Git URLs
  - Upload repository ZIP files
  - Process local directories

- **Comprehensive Documentation Generation**:
  - Project structure analysis
  - File content extraction
  - Metadata collection (package.json, README, etc.)
  - Binary file detection
  - Gitignore pattern respect

- **Multiple Output Formats**:
  - JSON format for programmatic use
  - Markdown format for human reading
  - Web interface for easy interaction
  - Auto-save functionality with file management

- **File Management System**:
  - Automatic saving of generated documentation
  - Saved Files tab for managing documentation history
  - Download, view, and delete saved files
  - Persistent file storage across server restarts

- **Smart Filtering**:
  - Respects .gitignore patterns
  - Excludes common build artifacts
  - Handles binary files appropriately

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd gittodoc
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Usage

### Web Interface

Open your browser and navigate to `http://localhost:3000` to use the web interface.

#### Features:
- **Generate Documentation**: Convert repositories using multiple input methods
- **Saved Files**: View and manage previously generated documentation
  - Refresh to load saved files
  - Download files in JSON or Markdown format
  - Delete unwanted files
  - View file metadata (name, format, creation date, size)

### API Endpoints

#### 1. Clone Repository
```bash
POST /api/clone
Content-Type: application/json

{
  "repoUrl": "https://github.com/user/repo.git",
  "branch": "main" // optional, defaults to "main"
}
```

#### 2. Upload ZIP File
```bash
POST /api/upload
Content-Type: multipart/form-data

# Form field: repository (file)
```

#### 3. Process Local Directory
```bash
POST /api/local
Content-Type: application/json

{
  "path": "/path/to/your/project"
}
```

#### 4. Download Documentation
```bash
POST /api/download/json
Content-Type: application/json

{
  "documentation": <documentation-object>
}

POST /api/download/markdown
Content-Type: application/json

{
  "documentation": <documentation-object>
}
```

#### 5. File Management
```bash
# List all saved files
GET /api/files

# Download saved file by ID
GET /api/files/:fileId

# Delete saved file by ID
DELETE /api/files/:fileId
```

#### 6. Health Check
```bash
GET /health
```

## Response Format

All API endpoints return a JSON response with the following structure:

```json
{
  "success": true,
  "documentation": {
    "projectInfo": {
      "name": "Project Name",
      "description": "Project description",
      "version": "1.0.0",
      "dependencies": {},
      "devDependencies": {}
    },
    "readme": "README content",
    "fileTree": [
      {
        "name": "src",
        "type": "directory",
        "path": "src",
        "children": [...]
      }
    ],
    "files": [
      {
        "path": "src/index.js",
        "name": "index.js",
        "content": "file content",
        "encoding": "utf8",
        "size": 1234
      }
    ],
    "stats": {
      "totalFiles": 10,
      "totalSize": 12345,
      "fileTypes": {
        ".js": 5,
        ".json": 2,
        ".md": 1
      }
    },
    "generatedAt": "2023-12-07T10:30:00.000Z"
  },
  "source": {
    "type": "git_clone", // or "file_upload" or "local_directory"
    "url": "https://github.com/user/repo.git",
    "branch": "main"
  }
}
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)

### File Storage

- Generated documentation is automatically saved to the `outputs/` directory
- Files are named with timestamp: `ProjectName_YYYY-MM-DDTHH-mm-ss-sssZ.format`
- Metadata is maintained in memory and restored on server startup

### File Size Limits

- Maximum upload size: 100MB
- Individual file reading limit: No specific limit, but binary files are detected and marked

### Ignored Patterns

The tool automatically ignores:
- `.git/` directory
- `node_modules/` directory
- Build artifacts (`dist/`, `build/`)
- Log files (`*.log`)
- Environment files (`.env*`)
- Temporary files (`*.tmp`, `*.temp`)
- System files (`.DS_Store`)
- Custom patterns from `.gitignore`

## Use Cases

### For AI Systems

1. **Code Analysis**: Feed the JSON output to AI models for code review, analysis, or documentation generation
2. **Project Understanding**: Help AI understand project structure and dependencies
3. **Code Migration**: Provide context for code migration or refactoring tasks

### For Developers

1. **Project Documentation**: Generate comprehensive project documentation
2. **Code Review**: Get a complete overview of repository contents
3. **Project Onboarding**: Help new team members understand project structure

## Examples

### Clone a Public Repository
```bash
curl -X POST http://localhost:3000/api/clone \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/expressjs/express.git"}'
```

### Process Local Directory
```bash
curl -X POST http://localhost:3000/api/local \
  -H "Content-Type: application/json" \
  -d '{"path": "/Users/username/my-project"}'
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200`: Success
- `400`: Bad request (missing parameters, invalid input)
- `404`: Resource not found (local path doesn't exist)
- `500`: Internal server error

Error responses include details:
```json
{
  "error": "Error description",
  "details": "Detailed error message"
}
```

## Security Considerations

- The tool processes code locally and doesn't send data to external services
- Be cautious when processing repositories with sensitive information!
- Local directory access is limited to the paths you explicitly provide
- Uploaded files are temporarily stored and cleaned up after processing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Recent Improvements

### Version 2.0 Features

- **Enhanced File Management**: Complete file saving and management system
- **Improved API Design**: Changed download endpoints from GET to POST to handle large documentation
- **Persistent Storage**: Files now persist across server restarts
- **Better Error Handling**: Improved error messages and status codes
- **UI Enhancements**: New Saved Files tab with comprehensive file management

### Bug Fixes

- **Fixed HTTP 431 Error**: Resolved "Request Header Fields Too Large" by switching download endpoints to POST
- **Fixed File Loading**: Corrected saved files not appearing after server restart
- **Fixed API Response Parsing**: Aligned frontend expectations with backend response format

## Troubleshooting

### Common Issues

1. **"Repository not found" error**: Check if the repository URL is correct and accessible
2. **"Path does not exist" error**: Verify the local path exists and is accessible
3. **Upload fails**: Check if the file is a valid ZIP and under 100MB
4. **Memory issues**: Large repositories might consume significant memory during processing
5. **"Failed to load saved files"**: Ensure the server has been restarted after recent updates
6. **Download issues**: Large documentation files now use POST requests instead of GET

### Performance Tips

- For large repositories, consider using the ZIP upload method instead of cloning
- The tool respects .gitignore to reduce processing time
- Binary files are detected and their content is not processed, saving memory

## Dependencies

- **express**: Web framework
- **simple-git**: Git operations
- **multer**: File upload handling
- **fs-extra**: Enhanced file system operations
- **archiver**: ZIP file creation
- **yauzl**: ZIP file extraction
- **ignore**: .gitignore pattern matching
- **cors**: Cross-origin resource sharing

---

**GitToDoc** - Making repositories AI-ready, one commit at a time! 🤖📚