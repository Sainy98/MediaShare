const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = 3000;

const corsOptions = {
    origin: ["https://quickmediashare.netlify.app"]
};

// const corsOptions = {
//     origin: ["http://127.0.0.1:5500"]
// };


app.use(cors(corsOptions));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.array('mediaFiles', 10), (req, res) => {
    try {
        const files = req.files;
        const expiryTime = req.body.expiryTime;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const fileLinks = files.map(file => {
            const fileUrl = `${req.protocol}://${req.get('host')}/files/${file.filename}`;
            return fileUrl;
        });

        console.log('Generated file links:', fileLinks);
        console.log('Expiry Time:', expiryTime);

        res.json({ fileLinks, expiryTime });

        const expiryInMs = expiryTime * 60 * 60 * 1000;
        setTimeout(() => {
            files.forEach(file => {
                fs.unlink(path.join(__dirname, 'uploads', file.filename), (err) => {
                    if (err) console.log("Error deleting file:", err);
                    else console.log(`File ${file.filename} deleted after ${expiryTime} hours.`);
                });
            });
        }, expiryInMs);
    } catch (error) {
        console.error('Error handling upload:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE file endpoint
app.delete('/files/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);

    // Check if the file exists before attempting to delete it
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error('File does not exist:', err);
            return res.status(404).json({ error: 'File not found' });
        }

        // Delete the file
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
                return res.status(500).json({ error: 'Internal server error' });
            }

            console.log(`File ${req.params.filename} deleted successfully.`);
            res.status(200).json({ message: 'File deleted successfully' });
        });
    });
});


// Serve files
app.get('/files/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.sendFile(filePath);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
