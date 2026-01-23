import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import { EphemerisEngine, KPSubLord, calculatePanchanga, calculateVarga, calculateHouseCusps } from '@node-jhora/core';
import { PoruthamMatch } from '@node-jhora/match';
// Importing these for hierarchical calculation logic if needed, but we used core functional exports
import { generateVimshottari } from '@node-jhora/prediction';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. Initialize Astrology Engine
const eph = EphemerisEngine.getInstance();
await eph.initialize();

const PLANET_NAMES = {
    0: 'Sun', 1: 'Moon', 2: 'Mercury', 3: 'Venus', 4: 'Mars',
    5: 'Jupiter', 6: 'Saturn', 11: 'Rahu', 99: 'Ketu'
};

const TAMIL_DATA = {
    planets: { 'Sun': 'சூரியன்', 'Moon': 'சந்திரன்', 'Mars': 'செவ்வாய்', 'Mercury': 'புதன்', 'Jupiter': 'குரு', 'Venus': 'சுக்கிரன்', 'Saturn': 'சனி', 'Rahu': 'ராகு', 'Ketu': 'கேது', 'Ascendant': 'லக்னம்' },
    signs: { 'Aries': 'மேஷம்', 'Taurus': 'ரிஷபம்', 'Gemini': 'மிதுனம்', 'Cancer': 'கடகம்', 'Leo': 'சிம்மம்', 'Virgo': 'கன்னி', 'Libra': 'துலாம்', 'Scorpio': 'விருச்சிகம்', 'Sagittarius': 'தனுசு', 'Capricorn': 'மகரம்', 'Aquarius': 'கும்பம்', 'Pisces': 'மீனம்' },
    nakshatras: ["அஸ்வினி", "பரணி", "கிருத்திகை", "ரோகிணி", "மிருகசீரிஷம்", "திருவாதிரை", "புனர்பூசம்", "பூசம்", "ஆயில்யம்", "மகம்", "பூரம்", "உத்திரம்", "அஸ்தம்", "சித்திரை", "சுவாதி", "விசாகம்", "அனுஷம்", "கேட்டை", "மூலம்", "பூராடம்", "உத்திராடம்", "திருவோணம்", "அவிட்டம்", "சதயம்", "பூரட்டாதி", "உத்திரட்டாதி", "ரேவதி"],
    dignities: { 'Exalted': 'உச்சம்', 'Debilitated': 'நீசம்', 'Own House': 'ஆட்சி', 'Great Friend': 'அதி நட்பு', 'Friend': 'நட்பு', 'Neutral': 'சமம்', 'Enemy': 'பகை', 'Great Enemy': 'அதி பகை', 'Moolatrikona': 'மூலத்திரிகோணம்' }
};

const getDignity = (planetId, longitude) => {
    const signIdx = Math.floor(longitude / 30);
    const deg = longitude % 30;

    const exaltations = { 0: [0, 10], 1: [1, 3], 4: [9, 28], 2: [5, 15], 5: [3, 5], 3: [11, 27], 6: [6, 20] };
    const debilitations = { 0: [6, 10], 1: [7, 3], 4: [3, 28], 2: [11, 15], 5: [9, 5], 3: [5, 27], 6: [0, 20] };
    const ownSigns = { 0: [4], 1: [3], 4: [0, 7], 2: [2, 5], 5: [8, 11], 3: [1, 6], 6: [9, 10] };

    // Simple logic for Demo
    if (exaltations[planetId] && signIdx === exaltations[planetId][0]) return 'Exalted';
    if (debilitations[planetId] && signIdx === debilitations[planetId][0]) return 'Debilitated';
    if (ownSigns[planetId] && ownSigns[planetId].includes(signIdx)) return 'Own House';

    const friends = {
        0: [1, 4, 5], 1: [0, 2], 4: [0, 1, 5], 2: [0, 3], 5: [0, 1, 4], 3: [2, 6], 6: [2, 3]
    };
    const enemies = {
        0: [3, 6], 1: [], 4: [2], 2: [1], 5: [2, 3], 3: [0, 1], 6: [0, 1, 4]
    };

    // Owner of current sign (Standard Rulers)
    const signRulers = [4, 3, 2, 1, 0, 2, 3, 4, 5, 6, 6, 5];
    const ruler = signRulers[signIdx];

    if (friends[planetId] && friends[planetId].includes(ruler)) return 'Friend';
    if (enemies[planetId] && enemies[planetId].includes(ruler)) return 'Enemy';
    return 'Neutral';
};

const getSignName = (lon) => {
    const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    return signs[Math.floor(lon / 30)];
};

const getLordName = (id) => {
    // KP SubLord uses: 0:Sun, 1:Mon, 2:Mer, 3:Ven, 4:Mar, 5:Jup, 6:Sat, 7:Rah, 8:Ket
    const names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"];
    return names[id];
};

// Geocoding Proxy (Prioritize India)
app.get('/api/search-place', async (req, res) => {
    try {
        const query = req.query.q;
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&countrycodes=in`, {
            headers: { 'User-Agent': 'AstroApp/1.0' }
        });
        const filtered = response.data.filter(item => item.lat && item.lon);
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Main Calculation
app.post('/calculate', async (req, res) => {
    try {
        const { dateString, timeString, lat, lng, timezone, ayanamsha } = req.body;

        // Parse into Luxon DateTime
        // dateString: YYYY-MM-DD
        // timeString: HH:mm:ss
        const [year, month, day] = dateString.split('-').map(Number);
        const [hour, min, sec] = timeString.split(':').map(Number);
        const dt = DateTime.fromObject({ year, month, day, hour, minute: min, second: sec }, { zone: `UTC${parseFloat(timezone) >= 0 ? '+' : ''}${parseFloat(timezone)}` });

        const location = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        const ayanMode = parseInt(ayanamsha) || 1;

        // 1. Get Planets
        const planetPositions = eph.getPlanets(dt, location, ayanMode, true);
        const results = {};

        const NAK_LENGTH = 360 / 27;
        const getNakDetails = (lon) => {
            const nakVal = lon / NAK_LENGTH;
            const idx = Math.floor(nakVal);
            const nakPercent = (nakVal - idx) * 100;
            return {
                name: TAMIL_DATA.nakshatras[idx],
                lord: getLordName([8, 3, 0, 1, 4, 7, 5, 6, 2][idx % 9]),
                pada: Math.floor(nakPercent / 25) + 1
            };
        };

        planetPositions.forEach(p => {
            if (PLANET_NAMES[p.id]) {
                const kp = KPSubLord.calculateKPSignificators(p.longitude);
                const pName = PLANET_NAMES[p.id];
                const dignity = getDignity(p.id, p.longitude);
                const nak = getNakDetails(p.longitude);

                results[pName] = {
                    id: p.id,
                    longitude: p.longitude,
                    sign: getSignName(p.longitude),
                    signTamil: TAMIL_DATA.signs[getSignName(p.longitude)],
                    nameTamil: TAMIL_DATA.planets[pName],
                    dignity,
                    dignityTamil: TAMIL_DATA.dignities[dignity],
                    nakshatra: nak,
                    kp: {
                        signLord: getLordName(kp.signLord),
                        starLord: getLordName(kp.starLord),
                        subLord: getLordName(kp.subLord),
                        subSubLord: getLordName(kp.subSubLord)
                    }
                };
            }
        });

        // 2. Get Houses (Placidus for KP)
        const houses = calculateHouseCusps(dt, location.latitude, location.longitude, 'Placidus', eph);
        const houseResults = houses.cusps.map((c, i) => {
            const kp = KPSubLord.calculateKPSignificators(c);
            return {
                id: i + 1,
                longitude: c,
                sign: getSignName(c),
                kp: {
                    signLord: getLordName(kp.signLord),
                    starLord: getLordName(kp.starLord),
                    subLord: getLordName(kp.subLord),
                    subSubLord: getLordName(kp.subSubLord)
                }
            };
        });

        // 3. Panchanga
        const sun = planetPositions.find(p => p.id === 0);
        const moon = planetPositions.find(p => p.id === 1);
        const panchanga = calculatePanchanga(sun.longitude, moon.longitude, dt);

        // 4. Vargas (D1, D9, D10)
        const vargas = { D1: {}, D9: {}, D10: {} };
        [1, 9, 10].forEach(v => {
            planetPositions.forEach(p => {
                if (PLANET_NAMES[p.id]) {
                    const vLong = calculateVarga(p.longitude, v);
                    vargas[`D${v}`][PLANET_NAMES[p.id]] = { sign: getSignName(vLong), signTamil: TAMIL_DATA.signs[getSignName(vLong)] };
                }
            });
            const ascVarga = calculateVarga(houses.ascendant, v);
            vargas[`D${v}`]['Ascendant'] = { sign: getSignName(ascVarga), signTamil: TAMIL_DATA.signs[getSignName(ascVarga)] };
        });

        // 5. Dashas (Hierarchical)
        const dashaStart = dt.toJSDate();
        const dashas = generateVimshottari(dashaStart, moon.longitude);

        res.json({
            success: true,
            data: {
                planets: results,
                houses: houseResults,
                panchanga,
                vargas,
                dashas,
                ascendant: houses.ascendant,
                tamilData: TAMIL_DATA
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Porutham Endpoint
app.post('/api/porutham', (req, res) => {
    try {
        const { boyNak, girlNak, boySign, girlSign } = req.body;
        // match(boyNak, girlNak, boySign, girlSign)
        // boySign/girlSign: 1-12 from internal match logic
        const match = PoruthamMatch.match(
            parseInt(boyNak),
            parseInt(girlNak),
            parseInt(boySign) + 1,
            parseInt(girlSign) + 1
        );
        res.json({ success: true, match });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.listen(port, () => console.log(`Server running on port ${port}`));
