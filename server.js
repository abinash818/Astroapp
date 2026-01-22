const express = require('express');
const cors = require('cors');
const jyotish = require('jyotish-calc');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Main endpoint for astrology calculations
app.post('/calculate', (req, res) => {
    try {
        const birthData = { ...req.body };

        // Ensure lat/lng/timezone are numbers
        birthData.lat = parseFloat(birthData.lat);
        birthData.lng = parseFloat(birthData.lng);
        birthData.timezone = parseFloat(birthData.timezone);

        // Validation for date format (needs YYYY-MM-DD for getValidatedBirthDetails)
        if (birthData.dateString) {
            const [y, m, d] = birthData.dateString.split('-').map(Number);
            const [h, min, s] = (birthData.timeString || "00:00:00").split(':').map(Number);
            birthData.year = y;
            birthData.month = m;
            birthData.date = d;
            birthData.hour = h;
            birthData.min = min;
            birthData.sec = s;
        }

        // 1. Get Graha Positions
        const grahas = jyotish.grahas.getGrahasPosition(birthData);

        // 2. Get Panchanga
        const panchanga = jyotish.panchanga.calculatePanchanga(birthData);

        res.json({
            success: true,
            data: {
                grahas,
                panchanga
            }
        });
    } catch (error) {
        console.error("Calculation Error:", error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
