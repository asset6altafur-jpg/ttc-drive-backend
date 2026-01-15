const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
// app.use(cors());
app.use(express.json());
// ====== API PROTECTION MIDDLEWARE ======
const crypto = require("crypto");

app.use("/api", (req, res, next) => {
    const signature = req.headers["x-signature"];
    const timestamp = req.headers["x-timestamp"];

    if (!signature || !timestamp) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const now = Date.now();
    if (Math.abs(now - timestamp) > 60_000) {
        return res.status(401).json({ error: "Request expired" });
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.API_SECRET)
        .update(req.originalUrl + timestamp)
        .digest("hex");

    if (signature !== expectedSignature) {
        return res.status(403).json({ error: "Invalid signature" });
    }

    next();
});


// Configuration for BOTH folders
const CONFIG = {
    API_KEY: process.env.API_KEY,
    FILE_FOLDER_ID: process.env.FILE_FOLDER_ID, // আপনার File Folder
    VIDEO_FOLDER_ID: process.env.VIDEO_FOLDER_ID, // আপনার Video Folder ID
    CACHE_DURATION: 60000
};
// Cache objects for both
let fileCache = {
    data: null,
    timestamp: null
};

let videoCache = {
    data: null,
    timestamp: null
};

// ========== COMMON FUNCTIONS ==========


// api secure start 




// api secure end 





// MIME type mapping
const MIME_TYPE_MAP = {
    // Video Files
    'video/mp4': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    'video/x-matroska': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    'video/quicktime': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    'video/x-msvideo': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    'video/x-ms-wmv': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    'video/webm': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    'video/ogg': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    'video/x-flv': { class: 'video', icon: 'file-earmark-play', category: 'Video' },
    
    // PDF
    'application/pdf': { class: 'pdf', icon: 'file-earmark-pdf', category: 'PDF Document' },
    
    // Word
    'application/msword': { class: 'docx', icon: 'file-earmark-word', category: 'Word Document' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { class: 'docx', icon: 'file-earmark-word', category: 'Word Document' },
    
    // Excel
    'application/vnd.ms-excel': { class: 'xlsx', icon: 'file-earmark-excel', category: 'Excel Spreadsheet' },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { class: 'xlsx', icon: 'file-earmark-excel', category: 'Excel Spreadsheet' },
    
    // PowerPoint
    'application/vnd.ms-powerpoint': { class: 'pptx', icon: 'file-earmark-ppt', category: 'PowerPoint Presentation' },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { class: 'pptx', icon: 'file-earmark-ppt', category: 'PowerPoint Presentation' },
    
    // Default
    'default': { class: 'other', icon: 'file-earmark', category: 'Other File' }
};

function getFileInfo(mimeType) {
    const mime = mimeType.toLowerCase();
    
    if (MIME_TYPE_MAP[mime]) {
        return MIME_TYPE_MAP[mime];
    }
    
    if (mime.startsWith('video/')) {
        return MIME_TYPE_MAP['video/mp4'];
    }
    
    if (mime.includes('word') || mime.includes('document')) {
        return MIME_TYPE_MAP['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    }
    
    if (mime.includes('excel') || mime.includes('spreadsheet')) {
        return MIME_TYPE_MAP['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    }
    
    if (mime.includes('powerpoint') || mime.includes('presentation')) {
        return MIME_TYPE_MAP['application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    }
    
    return MIME_TYPE_MAP['default'];
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ========== FILE ENDPOINTS (Existing) ==========

// 1. GET ALL FILES
app.get('/api/files', async (req, res) => {
    try {
        const now = Date.now();
        if (fileCache.data && fileCache.timestamp && (now - fileCache.timestamp) < CONFIG.CACHE_DURATION) {
            return res.json(fileCache.data);
        }

        console.log('🔄 Fetching files from Google Drive...');
        
        const url = 'https://www.googleapis.com/drive/v3/files';
        const params = {
            q: `'${CONFIG.FILE_FOLDER_ID}' in parents and trashed = false`,
            key: CONFIG.API_KEY,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink)',
            orderBy: 'createdTime desc',
            pageSize: 100
        };

        const response = await axios.get(url, { params });
        
        if (!response.data.files) {
            return res.json({
                success: true,
                count: 0,
                files: [],
                categories: {},
                message: 'No files found'
            });
        }

        const files = response.data.files.map(file => {
            const fileInfo = getFileInfo(file.mimeType);
            
            return {
                id: file.id,
                name: file.name,
                type: file.mimeType,
                size: file.size ? parseInt(file.size) : 0,
                sizeFormatted: formatFileSize(file.size),
                createdTime: file.createdTime,
                modifiedTime: file.modifiedTime,
                viewUrl: `https://drive.google.com/file/d/${file.id}/preview`,
                downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
                directLink: file.webContentLink,
                iconClass: fileInfo.class,
                iconName: fileInfo.icon,
                category: fileInfo.category,
                thumbnail: file.thumbnailLink || null,
                isVideo: file.mimeType.startsWith('video/')
            };
        });

        // Filter out videos (we'll handle them separately)
        const nonVideoFiles = files.filter(file => !file.isVideo);
        
        const categories = {};
        nonVideoFiles.forEach(file => {
            if (!categories[file.category]) {
                categories[file.category] = { count: 0, files: [] };
            }
            categories[file.category].count++;
            categories[file.category].files.push(file);
        });

        const result = {
            success: true,
            count: nonVideoFiles.length,
            categoriesCount: Object.keys(categories).length,
            files: nonVideoFiles,
            categories: categories,
            lastUpdated: new Date().toISOString(),
            type: 'files'
        };

        fileCache = { data: result, timestamp: now };
        
        console.log(`✅ Successfully fetched ${nonVideoFiles.length} files`);
        res.json(result);

    } catch (error) {
        console.error('❌ Error fetching files:', error.message);
        
        if (fileCache.data) {
            return res.json({
                ...fileCache.data,
                cached: true,
                error: 'Using cached data'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to fetch files'
        });
    }
});

// ========== VIDEO ENDPOINTS (New) ==========

// 2. GET ALL VIDEOS
app.get('/api/videos', async (req, res) => {
    try {
        const now = Date.now();
        if (videoCache.data && videoCache.timestamp && (now - videoCache.timestamp) < CONFIG.CACHE_DURATION) {
            return res.json(videoCache.data);
        }

        console.log('🎬 Fetching videos from Google Drive...');
        
        const url = 'https://www.googleapis.com/drive/v3/files';
        const params = {
            q: `'${CONFIG.VIDEO_FOLDER_ID}' in parents and trashed = false`,
            key: CONFIG.API_KEY,
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, videoMediaMetadata)',
            orderBy: 'createdTime desc',
            pageSize: 100
        };

        const response = await axios.get(url, { params });
        
        if (!response.data.files) {
            return res.json({
                success: true,
                count: 0,
                videos: [],
                message: 'No videos found'
            });
        }

        // Filter only video files
        const videoFiles = response.data.files.filter(file => 
            file.mimeType && file.mimeType.startsWith('video/')
        );

        const videos = videoFiles.map(file => {
            const fileInfo = getFileInfo(file.mimeType);
            const duration = file.videoMediaMetadata ? 
                formatDuration(parseInt(file.videoMediaMetadata.durationMillis) / 1000) : 
                'Unknown';
            
            return {
                id: file.id,
                name: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
                type: file.mimeType,
                size: file.size ? parseInt(file.size) : 0,
                sizeFormatted: formatFileSize(file.size),
                duration: duration,
                createdTime: file.createdTime,
                modifiedTime: file.modifiedTime,
                viewUrl: `https://drive.google.com/file/d/${file.id}/preview`,
                downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
                embedUrl: `https://drive.google.com/file/d/${file.id}/preview?autoplay=1`,
                thumbnail: file.thumbnailLink || 'https://img.icons8.com/color/96/000000/video.png',
                iconClass: fileInfo.class,
                iconName: fileInfo.icon,
                category: 'Video Tutorial',
                resolution: file.videoMediaMetadata ? 
                    `${file.videoMediaMetadata.width}x${file.videoMediaMetadata.height}` : 
                    'Unknown'
            };
        });

        // Group by category or playlist (you can customize this)
        const playlists = {
            'All Videos': {
                count: videos.length,
                videos: videos
            }
        };

        const result = {
            success: true,
            count: videos.length,
            playlistsCount: Object.keys(playlists).length,
            videos: videos,
            playlists: playlists,
            lastUpdated: new Date().toISOString(),
            type: 'videos'
        };

        videoCache = { data: result, timestamp: now };
        
        console.log(`✅ Successfully fetched ${videos.length} videos`);
        res.json(result);

    } catch (error) {
        console.error('❌ Error fetching videos:', error.message);
        
        if (videoCache.data) {
            return res.json({
                ...videoCache.data,
                cached: true,
                error: 'Using cached data'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to fetch videos',
            details: error.message
        });
    }
});

// 3. GET SINGLE VIDEO
app.get('/api/video/:id', async (req, res) => {
    try {
        const videoId = req.params.id;
        const url = `https://www.googleapis.com/drive/v3/files/${videoId}`;
        
        const params = {
            key: CONFIG.API_KEY,
            fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, videoMediaMetadata'
        };

        const response = await axios.get(url, { params });
        const file = response.data;

        const fileInfo = getFileInfo(file.mimeType);
        const duration = file.videoMediaMetadata ? 
            formatDuration(parseInt(file.videoMediaMetadata.durationMillis) / 1000) : 
            'Unknown';
        
        const video = {
            id: file.id,
            name: file.name.replace(/\.[^/.]+$/, ""),
            type: file.mimeType,
            size: file.size ? parseInt(file.size) : 0,
            sizeFormatted: formatFileSize(file.size),
            duration: duration,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            viewUrl: `https://drive.google.com/file/d/${file.id}/preview`,
            downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
            embedUrl: `https://drive.google.com/file/d/${file.id}/preview?autoplay=1`,
            thumbnail: file.thumbnailLink || 'https://img.icons8.com/color/96/000000/video.png',
            iconClass: fileInfo.class,
            iconName: fileInfo.icon,
            category: 'Video Tutorial',
            resolution: file.videoMediaMetadata ? 
                `${file.videoMediaMetadata.width}x${file.videoMediaMetadata.height}` : 
                'Unknown',
            description: `${file.name} - Video Tutorial`
        };

        res.json({
            success: true,
            video: video
        });

    } catch (error) {
        console.error('Error fetching video:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch video'
        });
    }
});

// 4. SEARCH VIDEOS
app.get('/api/videos/search', async (req, res) => {
    try {
        const searchQuery = req.query.q;
        if (!searchQuery) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        const url = 'https://www.googleapis.com/drive/v3/files';
        const params = {
            q: `'${CONFIG.VIDEO_FOLDER_ID}' in parents and name contains '${searchQuery}' and trashed = false and mimeType contains 'video/'`,
            key: CONFIG.API_KEY,
            fields: 'files(id, name, mimeType, size, createdTime, videoMediaMetadata)',
            pageSize: 50
        };

        const response = await axios.get(url, { params });
        
        const videos = response.data.files.map(file => {
            const fileInfo = getFileInfo(file.mimeType);
            const duration = file.videoMediaMetadata ? 
                formatDuration(parseInt(file.videoMediaMetadata.durationMillis) / 1000) : 
                'Unknown';
            
            return {
                id: file.id,
                name: file.name.replace(/\.[^/.]+$/, ""),
                type: file.mimeType,
                size: file.size ? parseInt(file.size) : 0,
                sizeFormatted: formatFileSize(file.size),
                duration: duration,
                createdTime: file.createdTime,
                viewUrl: `https://drive.google.com/file/d/${file.id}/preview`,
                downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
                embedUrl: `https://drive.google.com/file/d/${file.id}/preview?autoplay=1`,
                thumbnail: 'https://img.icons8.com/color/96/000000/video.png',
                iconClass: fileInfo.class,
                iconName: fileInfo.icon
            };
        });

        res.json({
            success: true,
            query: searchQuery,
            count: videos.length,
            videos: videos
        });

    } catch (error) {
        console.error('Error searching videos:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search videos'
        });
    }
});

// ========== COMBINED ENDPOINTS ==========

// 5. GET ALL CONTENT (Files + Videos)
app.get('/api/content', async (req, res) => {
    try {
        // Fetch both in parallel
        const [filesResponse, videosResponse] = await Promise.all([
            axios.get(`http://localhost:${PORT}/api/files`),
            axios.get(`http://localhost:${PORT}/api/videos`)
        ]);

        const result = {
            success: true,
            files: filesResponse.data.success ? filesResponse.data.files.length : 0,
            videos: videosResponse.data.success ? videosResponse.data.videos.length : 0,
            total: (filesResponse.data.success ? filesResponse.data.files.length : 0) + 
                   (videosResponse.data.success ? videosResponse.data.videos.length : 0),
            lastUpdated: new Date().toISOString()
        };

        res.json(result);

    } catch (error) {
        console.error('Error fetching combined content:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch combined content'
        });
    }
});

// 6. CLEAR ALL CACHE
app.get('/api/clear-all-cache', (req, res) => {
    fileCache = { data: null, timestamp: null };
    videoCache = { data: null, timestamp: null };
    res.json({
        success: true,
        message: 'All cache cleared successfully',
        timestamp: new Date().toISOString()
    });
});

// 7. GET SERVER STATUS
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        server: 'Google Drive File & Video API Server',
        version: '2.0.0',
        configuration: {
            fileFolderId: CONFIG.FILE_FOLDER_ID,
            videoFolderId: CONFIG.VIDEO_FOLDER_ID,
            apiKey: CONFIG.API_KEY ? 'Configured' : 'Not configured'
        },
        cache: {
            files: fileCache.data ? 'Cached' : 'Empty',
            videos: videoCache.data ? 'Cached' : 'Empty'
        },
        endpoints: [
            'GET /api/files - Get all files',
            'GET /api/videos - Get all videos',
            'GET /api/video/:id - Get single video',
            'GET /api/videos/search?q=query - Search videos',
            'GET /api/content - Get combined stats',
            'GET /api/clear-all-cache - Clear all cache',
            'GET /api/status - Server status'
        ],
        timestamp: new Date().toISOString()
    });
});

// 8. HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        services: {
            files: 'Active',
            videos: 'Active'
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 9. ROOT ENDPOINT
app.get('/', (req, res) => {
    res.json({
        message: 'Google Drive File & Video API Server',
        services: {
            files: `/api/files (Folder: ${CONFIG.FILE_FOLDER_ID})`,
            videos: `/api/videos (Folder: ${CONFIG.VIDEO_FOLDER_ID})`
        },
        endpoints: {
            api: '/api/files',
            videos: '/api/videos',
            status: '/api/status',
            health: '/health'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Google Drive File & Video Server Started`);
    console.log(`=========================================`);
    console.log(`📂 File Folder: ${CONFIG.FILE_FOLDER_ID}`);
    console.log(`🎬 Video Folder: ${CONFIG.VIDEO_FOLDER_ID}`);
    console.log(`🔑 API Key: ${CONFIG.API_KEY ? '✓ Configured' : '✗ Not configured'}`);
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📊 Files API: http://localhost:${PORT}/api/files`);
    console.log(`🎥 Videos API: http://localhost:${PORT}/api/videos`);
    console.log(`📈 Status: http://localhost:${PORT}/api/status`);
    console.log(`⏰ Cache: ${CONFIG.CACHE_DURATION / 1000} seconds`);
    console.log(`=========================================`);
    console.log(`✅ Ready to serve API requests!`);
    console.log(`=========================================`);
});