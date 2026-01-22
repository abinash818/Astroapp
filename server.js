const express = require('express');
const cors = require('cors');
const jyotish = require('jyotish-calc');
const swisseph = require('swisseph-v2');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper to convert longitude to [signIndex, degree]
const getSignDegree = (long) => {
    const sign = Math.floor(long / 30);
    const deg = long % 30;
    return [sign, deg];
};

app.post('/calculate', (req, res) => {
    try {
        const body = { ...req.body };
        const ayanamsha = parseInt(body.ayanamsha) || 1; // Default Lahiri

        // Parse inputs
        const lat = parseFloat(body.lat);
        const lng = parseFloat(body.lng);
        const timezone = parseFloat(body.timezone);

        let birthData = { ...body, lat, lng, timezone };

        if (body.dateString) {
            const [y, m, d] = body.dateString.split('-').map(Number);
            const [h, min, s] = (body.timeString || "00:00:00").split(':').map(Number);
            birthData = { ...birthData, year: y, month: m, date: d, hour: h, min, sec: s };
        }

        // 1. Get Graha Positions with selected Ayanamsha
        // (The getGrahasPosition internally calls swe_set_sid_mode)
        const grahas = jyotish.grahas.getGrahasPosition(birthData, { ayanamsha });

        // 2. Panchanga
        const panchanga = jyotish.panchanga.calculatePanchanga(birthData);

        // 3. Ashtakavarga
        const avPositions = {
            Sun: grahas.Su.longitude,
            Moon: grahas.Mo.longitude,
            Mars: grahas.Ma.longitude,
            Mercury: grahas.Me.longitude,
            Jupiter: grahas.Ju.longitude,
            Venus: grahas.Ve.longitude,
            Saturn: grahas.Sa.longitude,
            Ascendant: grahas.La.longitude
        };
        const ashtakavarga = jyotish.ashtakavarga.calculateAshtakavarga(avPositions);

        // 4. Dosha Analysis
        // Format: [[planetIndex, [sign, degree]], ...]
        // 0:Sun, 1:Moon, 2:Mars, 3:Mercury, 4:Jupiter, 5:Venus, 6:Saturn, 7:Rahu, 8:Ketu, L/9:Lagna
        const doshaPositions = [
            [0, getSignDegree(grahas.Su.longitude)],
            [1, getSignDegree(grahas.Mo.longitude)],
            [2, getSignDegree(grahas.Ma.longitude)],
            [3, getSignDegree(grahas.Me.longitude)],
            [4, getSignDegree(grahas.Ju.longitude)],
            [5, getSignDegree(grahas.Ve.longitude)],
            [6, getSignDegree(grahas.Sa.longitude)],
            [7, getSignDegree(grahas.Ra.longitude)],
            [8, getSignDegree(grahas.Ke.longitude)],
            ['L', getSignDegree(grahas.La.longitude)]
        ];
        const doshas = jyotish.doshas.getDoshaDetails(doshaPositions, grahas.Mo.longitude);

        // 5. Yogas & Raja Yogas
        const yogas = jyotish.yogas.getYogaDetails(doshaPositions);
        const rajayogas = jyotish.rajayogas.getRajaYogaDetails(doshaPositions);

        // 6. Dashas (Vimshottari)
        const birthDateObj = new Date(birthData.year, birthData.month - 1, birthData.date, birthData.hour, birthData.min);
        const vdashas = jyotish.dashas.vimshottari.calculateMahadashas(birthDateObj, grahas.Mo.longitude);

        // 7. Shadbala
        // Required format: [[sign, degree], ...] for Sun to Saturn
        const shadbalaPositions = [
            getSignDegree(grahas.Su.longitude),
            getSignDegree(grahas.Mo.longitude),
            getSignDegree(grahas.Ma.longitude),
            getSignDegree(grahas.Me.longitude),
            getSignDegree(grahas.Ju.longitude),
            getSignDegree(grahas.Ve.longitude),
            getSignDegree(grahas.Sa.longitude)
        ];
        const julianDay = panchanga.julianDay;
        const shadbala = jyotish.strengths.calculateShadbala(shadbalaPositions, Math.floor(grahas.La.longitude / 30), julianDay, lat, lng);

        // 8. Vargas (D9 example)
        const d9Chart = jyotish.vargas.calculateVargaChart(avPositions, 'D9');

        res.json({
            success: true,
            data: {
                grahas,
                panchanga,
                ashtakavarga: {
                    sav: ashtakavarga.sav,
                    interpretations: ashtakavarga.interpretations
                },
                doshas,
                yogas: yogas.summary.present,
                rajayogas: rajayogas.summary,
                dashas: vdashas,
                shadbala: shadbala,
                vargas: { d9: d9Chart }
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
