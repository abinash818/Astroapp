const express = require('express');
const cors = require('cors');
const jyotish = require('jyotish-calc');
const moment = require('moment-timezone');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const getSignDegree = (long) => {
    const sign = Math.floor(long / 30);
    const deg = long % 30;
    return [sign, deg];
};

// Geocoding Proxy (Prioritize India)
app.get('/api/search-place', async (req, res) => {
    try {
        const query = req.query.q;
        // Added countrycodes=in to prioritize India as requested
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&countrycodes=in`, {
            headers: { 'User-Agent': 'AstroApp/1.0' }
        });
        // Filter out results without lat/lon
        const filtered = response.data.filter(item => item.lat && item.lon);
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper for Tamil Date Correction (Ensuring Thai 1 is Jan 15, 2026)
const getCorrectedTamilDate = (panchanga, lat, lng, timezone) => {
    const jd = panchanga.julianDay;
    const place = { latitude: lat, longitude: lng, timezone: timezone };

    // Get standard calculation
    let tc = jyotish.panchanga.tamilSolarMonthAndDate(jd, place);

    // Tamil Date Logic Fix:
    // If Sankranti happens after sunset, the month starts the next day.
    // We check the Sun's longitude at the time of calculation.
    const sunLong = panchanga.solarMonth.sunLongitude;
    const currentSign = Math.floor(sunLong / 30);

    // Find when the Sun actually entered this sign
    const sankranti = jyotish.panchanga.previousSankranti(jd, place, currentSign);

    if (sankranti) {
        const sunset = jyotish.panchanga.sunset(sankranti.jd, place);
        // If Sankranti happened after sunset on that day, the month begins on the NEXT day.
        let monthStartJD = sankranti.jd;
        if (sankranti.time > sunset.hours) {
            monthStartJD += 1;
        }

        // Tamil Date is current JD - monthStartJD + 1
        const tamilDate = Math.floor(jd - monthStartJD) + 1;

        if (tamilDate > 0) {
            tc.date = tamilDate;
        }
    }

    return tc;
};

app.post('/calculate', (req, res) => {
    try {
        const body = { ...req.body };
        const ayanamsha = parseInt(body.ayanamsha) || 1;

        const lat = parseFloat(body.lat);
        const lng = parseFloat(body.lng);
        const timezone = parseFloat(body.timezone);

        let birthData = { ...body, lat, lng, timezone };

        if (body.dateString) {
            const [y, m, d] = body.dateString.split('-').map(Number);
            const [h, min, s] = (body.timeString || "00:00:00").split(':').map(Number);
            birthData = { ...birthData, year: y, month: m, date: d, hour: h, min, sec: s };
        }

        const grahas = jyotish.grahas.getGrahasPosition(birthData, { ayanamsha });
        const panchanga = jyotish.panchanga.calculatePanchanga(birthData);

        const avPositions = {
            Sun: grahas.Su.longitude, Moon: grahas.Mo.longitude, Mars: grahas.Ma.longitude,
            Mercury: grahas.Me.longitude, Jupiter: grahas.Ju.longitude, Venus: grahas.Ve.longitude,
            Saturn: grahas.Sa.longitude, Ascendant: grahas.La.longitude, Rahu: grahas.Ra.longitude, Ketu: grahas.Ke.longitude
        };

        const vargaList = ['D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12', 'D60'];
        const vargas = {};
        vargaList.forEach(v => vargas[v] = jyotish.vargas.calculateVargaChart(avPositions, v));

        const birthDateObj = new Date(birthData.year, birthData.month - 1, birthData.date, birthData.hour, birthData.min);
        const dashaTree = jyotish.dashas.vimshottari.generateDashaTree(birthDateObj, grahas.Mo.longitude, 4);

        const doshaPositions = [
            [0, getSignDegree(grahas.Su.longitude)], [1, getSignDegree(grahas.Mo.longitude)],
            [2, getSignDegree(grahas.Ma.longitude)], [3, getSignDegree(grahas.Me.longitude)],
            [4, getSignDegree(grahas.Ju.longitude)], [5, getSignDegree(grahas.Ve.longitude)],
            [6, getSignDegree(grahas.Sa.longitude)], [7, getSignDegree(grahas.Ra.longitude)],
            [8, getSignDegree(grahas.Ke.longitude)], ['L', getSignDegree(grahas.La.longitude)]
        ];
        const doshas = jyotish.doshas.getDoshaDetails(doshaPositions, grahas.Mo.longitude);
        const yogas = jyotish.yogas.getYogaDetails(doshaPositions);

        const shadbalaPositions = [
            getSignDegree(grahas.Su.longitude), getSignDegree(grahas.Mo.longitude), getSignDegree(grahas.Ma.longitude),
            getSignDegree(grahas.Me.longitude), getSignDegree(grahas.Ju.longitude), getSignDegree(grahas.Ve.longitude),
            getSignDegree(grahas.Sa.longitude)
        ];
        const shadbala = jyotish.strengths.calculateShadbala(shadbalaPositions, Math.floor(grahas.La.longitude / 30), panchanga.julianDay, lat, lng);

        // Tamil Calendar Data with correction logic
        const tamilCal = getCorrectedTamilDate(panchanga, lat, lng, timezone);

        res.json({
            success: true,
            data: {
                grahas,
                panchanga,
                tamilCalendar: tamilCal,
                vargas,
                dashaTree,
                doshas,
                yogas: yogas.summary.present,
                shadbala
            }
        });
    } catch (error) {
        console.error("Calculation Error:", error);
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.listen(port, () => console.log(`Server is running on port ${port}`));
