const express = require('express');
const cors = require('cors');
const jyotish = require('jyotish-calc');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Main endpoint for astrology calculations
app.post('/calculate', (req, res) => {
    try {
        const birthData = req.body;

        // Validation: Verify if the required fields are present
        // birthData should have: dateString, timeString, lat, lng, timezone
        // OR year, month, date, hour, min, sec, lat, lng, timezone for panchanga

        // 1. Get Graha Positions
        const grahas = jyotish.grahas.getGrahasPosition(birthData);

        // 2. Get Panchanga
        // Ensure manual fields are present for panchanga if not provided
        if (!birthData.year && birthData.dateString) {
            const [y, m, d] = birthData.dateString.split('-').map(Number);
            const [h, min, s] = (birthData.timeString || "00:00:00").split(':').map(Number);
            birthData.year = y;
            birthData.month = m;
            birthData.date = d;
            birthData.hour = h;
            birthData.min = min;
            birthData.sec = s;
        }

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
    res.send('Astrology API is running. use POST /calculate to get data.');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
