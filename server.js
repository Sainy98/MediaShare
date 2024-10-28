const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const cors = require('cors');
const app = express();
const PORT = 3000;
const metadataFilePath = path.join(__dirname, 'fileMetadata.json'); // JSON file for metadata storage

const corsOptions = {
    origin: ["https://quickmediashare.netlify.app", "http://127.0.0.1:5500"]
};

app.use(cors(corsOptions));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`)
});

const upload = multer({ storage });

// Helper function to save metadata to JSON
async function saveMetadata(metadata) {
    await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2));
}

// Helper function to load metadata from JSON
async function loadMetadata() {
    try {
        const data = await fs.readFile(metadataFilePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return []; // Return empty array if file does not exist
    }
}

// Upload endpoint
app.post('/upload', upload.array('mediaFiles', 10), async (req, res) => {
    try {
        const files = req.files;
        const expiryTime = parseInt(req.body.expiryTime, 10); // Expiry in hours

        if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

        const expiryTimestamp = Date.now() + expiryTime * 60 * 60 * 1000;
        const metadata = await loadMetadata();

        const fileLinks = files.map(file => {
            const encodedFilename = encodeURIComponent(file.filename);
            const fileUrl = `https://${req.get('host')}/files/${encodedFilename}`;

            metadata.push({ filename: file.filename, expiryTimestamp });
            return fileUrl;
        });

        await saveMetadata(metadata);
        res.json({ fileLinks, expiryTime });
    } catch (error) {
        console.error('Error handling upload:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE file endpoint
app.delete('/files/:filename', async (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    const filename = req.params.filename;

    try {
        // Check if the file exists
        await fs.access(filePath);

        // Delete the file
        await fs.unlink(filePath);
        
        // Update metadata
        const metadata = await loadMetadata();
        const updatedMetadata = metadata.filter(file => file.filename !== filename);
        await saveMetadata(updatedMetadata);

        res.status(200).json({ message: 'File deleted successfully' });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'File not found' });
        } else {
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// Serve files
app.get('/files/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.sendFile(filePath);
});

// Regularly check for expired files
setInterval(async () => {
    const metadata = await loadMetadata();
    const currentTime = Date.now();
    const updatedMetadata = [];

    for (const file of metadata) {
        if (file.expiryTimestamp <= currentTime) {
            try {
                const filePath = path.join(__dirname, 'uploads', file.filename);
                await fs.unlink(filePath);
                console.log(`File ${file.filename} deleted after expiry.`);
            } catch (err) {
                console.error(`Error deleting file ${file.filename}:`, err);
            }
        } else {
            updatedMetadata.push(file);
        }
    }

    await saveMetadata(updatedMetadata);
}, 10* 60 * 1000); // Run every 10 minutes

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
