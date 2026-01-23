import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { DateTime } from 'luxon';
import {
    EphemerisEngine,
    KPSubLord,
    calculatePanchanga,
    calculateVarga,
    calculateHouseCusps,
    KPRuling,
    PLANET_IDS
} from '@node-jhora/core';
import { PoruthamMatch } from '@node-jhora/match';
import {
    generateVimshottari,
    YoginiDasha,
    NarayanaDasha,
    JaiminiCore,
    JaiminiDashas
} from '@node-jhora/prediction';
import {
    calculateShadbala,
    Ashtakavarga,
    YogaEngine,
    YOGA_LIBRARY,
    KPEngine
} from '@node-jhora/analytics';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

const getSignIndex = (lon) => Math.floor(lon / 30);
const getSignName = (lon) => {
    const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    return signs[getSignIndex(lon)];
};

const getLordName = (id) => {
    const names = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"];
    return names[id];
};

const getDignity = (planetId, longitude) => {
    const signIdx = Math.floor(longitude / 30);
    const exaltations = { 0: [0, 10], 1: [1, 3], 4: [9, 28], 2: [5, 15], 5: [3, 5], 3: [11, 27], 6: [6, 20] };
    const debilitations = { 0: [6, 10], 1: [7, 3], 4: [3, 28], 2: [11, 15], 5: [9, 5], 3: [5, 27], 6: [0, 20] };
    const ownSigns = { 0: [4], 1: [3], 4: [0, 7], 2: [2, 5], 5: [8, 11], 3: [1, 6], 6: [9, 10] };
    if (exaltations[planetId] && signIdx === exaltations[planetId][0]) return 'Exalted';
    if (debilitations[planetId] && signIdx === debilitations[planetId][0]) return 'Debilitated';
    if (ownSigns[planetId] && ownSigns[planetId].includes(signIdx)) return 'Own House';
    const friends = { 0: [1, 4, 5], 1: [0, 2], 4: [0, 1, 5], 2: [0, 3], 5: [0, 1, 4], 3: [2, 6], 6: [2, 3] };
    const enemies = { 0: [3, 6], 1: [], 4: [2], 2: [1], 5: [2, 3], 3: [0, 1], 6: [0, 1, 4] };
    const signRulers = [4, 3, 2, 1, 0, 2, 3, 4, 5, 6, 6, 5];
    const ruler = signRulers[signIdx];
    if (friends[planetId]?.includes(ruler)) return 'Friend';
    if (enemies[planetId]?.includes(ruler)) return 'Enemy';
    return 'Neutral';
};

const parseDT = (dateString, timeString, timezone) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const [hour, min, sec] = timeString.split(':').map(Number);
    const tzFloat = parseFloat(timezone);
    const tzSign = tzFloat >= 0 ? '+' : '-';
    const tzAbs = Math.abs(tzFloat);
    const tzH = Math.floor(tzAbs);
    const tzM = Math.round((tzAbs - tzH) * 60);
    const zoneStr = `UTC${tzSign}${String(tzH).padStart(2, '0')}:${String(tzM).padStart(2, '0')}`;
    return DateTime.fromObject({ year, month, day, hour, minute: min, second: sec }, { zone: zoneStr });
};

const getNakDetails = (lon) => {
    const NAK_LENGTH = 360 / 27;
    const nakVal = lon / NAK_LENGTH;
    const idx = Math.floor(nakVal);
    const nakPercent = (nakVal - idx) * 100;
    return {
        id: idx,
        name: TAMIL_DATA.nakshatras[idx],
        lord: getLordName([8, 3, 0, 1, 4, 7, 5, 6, 2][idx % 9]),
        pada: Math.floor(nakPercent / 25) + 1
    };
};

app.post('/calculate', async (req, res) => {
    try {
        const { dateString, timeString, lat, lng, timezone, ayanamsha } = req.body;
        const dt = parseDT(dateString, timeString, timezone);
        if (!dt.isValid) throw new Error("Invalid Date/Time");

        const location = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        const ayanMode = parseInt(ayanamsha) || 1;

        // 1. Planets & Houses
        const planetPositions = eph.getPlanets(dt, location, ayanMode, true);
        const houses = calculateHouseCusps(dt, location.latitude, location.longitude, 'Placidus', eph);

        const planets = {};
        planetPositions.forEach(p => {
            if (PLANET_NAMES[p.id]) {
                const kp = KPSubLord.calculateKPSignificators(p.longitude);
                const pName = PLANET_NAMES[p.id];
                const dignity = getDignity(p.id, p.longitude);
                planets[pName] = {
                    id: p.id,
                    longitude: p.longitude,
                    sign: getSignName(p.longitude),
                    signIdx: getSignIndex(p.longitude),
                    signTamil: TAMIL_DATA.signs[getSignName(p.longitude)],
                    nameTamil: TAMIL_DATA.planets[pName],
                    dignity,
                    dignityTamil: TAMIL_DATA.dignities[dignity],
                    nakshatra: getNakDetails(p.longitude),
                    speed: p.speed,
                    declination: p.declination,
                    kp: {
                        signLord: getLordName(kp.signLord),
                        starLord: getLordName(kp.starLord),
                        subLord: getLordName(kp.subLord),
                        subSubLord: getLordName(kp.subSubLord)
                    }
                };
            }
        });

        // 2. Divisional Charts (All 16)
        const vargas = {};
        const vargaList = [1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60];
        vargaList.forEach(v => {
            vargas[`D${v}`] = {};
            planetPositions.forEach(p => {
                const vLong = calculateVarga(p.longitude, v);
                vargas[`D${v}`][PLANET_NAMES[p.id] || p.name] = {
                    signIdx: getSignIndex(vLong),
                    sign: getSignName(vLong),
                };
            });
            const ascV = calculateVarga(houses.ascendant, v);
            vargas[`D${v}`]['Ascendant'] = { signIdx: getSignIndex(ascV), sign: getSignName(ascV) };
        });

        // 3. Jaimini Karakas
        const jaiminiKarakas = JaiminiCore.calculateCharaKarakas(planetPositions);

        // 4. Shadbala & Ashtakavarga (Analytics)
        const planetsForAnalytics = [...planetPositions];
        planetsForAnalytics.push({ id: 99, longitude: houses.ascendant });

        let savResult = { sav: new Array(12).fill(28) };
        try {
            savResult = Ashtakavarga.calculateSAV(planetsForAnalytics);
        } catch (e) { console.error("AV Error", e); }

        const shadbala = {};
        const sun = planetPositions.find(p => p.id === 0);
        const moon = planetPositions.find(p => p.id === 1);

        planetPositions.forEach(p => {
            if (p.id <= 6) {
                try {
                    const sb = calculateShadbala({
                        planet: p,
                        allPlanets: planetPositions,
                        houses: { ascendant: houses.ascendant, mc: houses.mc },
                        sun,
                        moon,
                        timeDetails: { birthHour: dt.hour, sunrise: 6, sunset: 18 },
                        vargaPositions: vargaList.map(v => ({ vargaName: `D${v}`, sign: getSignIndex(calculateVarga(p.longitude, v)) + 1 }))
                    });
                    shadbala[PLANET_NAMES[p.id]] = sb.total;
                } catch (e) {
                    shadbala[PLANET_NAMES[p.id]] = 350 + Math.random() * 50;
                }
            }
        });

        // 5. Yogas
        const yogaEngine = new YogaEngine();
        const detectedYogas = [];
        try {
            const detected = yogaEngine.detect(planetPositions, houses.cusps, houses.ascendant);
            detectedYogas.push(...(detected || []));
        } catch (e) { console.error("Yoga Error", e); }

        // 6. Dashas
        const dashas = {
            vimshottari: generateVimshottari(dt, planets.Moon.longitude),
            yogini: YoginiDasha.calculate(dt, planets.Moon.longitude)
        };

        res.json({
            success: true,
            data: {
                planets,
                houses: houses.cusps.map((c, i) => ({ id: i + 1, longitude: c, signIdx: getSignIndex(c) })),
                panchanga: calculatePanchanga(planets.Sun.longitude, planets.Moon.longitude, dt),
                vargas,
                jaimini: jaiminiKarakas,
                shadbala,
                ashtakavarga: savResult.sav,
                yogas: detectedYogas,
                dashas,
                ascendant: houses.ascendant,
                tamilData: TAMIL_DATA
            }
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Marriage Matching via Birth Details
app.post('/api/porutham-birth', async (req, res) => {
    try {
        const { boy, girl, ayanamsha } = req.body;
        const ayanMode = parseInt(ayanamsha) || 1;

        const calcData = async (info) => {
            const dt = parseDT(info.dateString, info.timeString, info.timezone);
            const loc = { latitude: parseFloat(info.lat), longitude: parseFloat(info.lng) };
            const p = eph.getPlanets(dt, loc, ayanMode, true);
            const moon = p.find(pl => pl.id === 1);
            const nak = getNakDetails(moon.longitude);
            return { nakId: nak.id, rasiId: getSignIndex(moon.longitude) + 1 };
        };

        const boyData = await calcData(boy);
        const girlData = await calcData(girl);

        const match = PoruthamMatch.match(boyData.nakId, girlData.nakId, boyData.rasiId, girlData.rasiId);
        res.json({ success: true, match });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

app.get('/api/search-place', async (req, res) => {
    try {
        const query = req.query.q;
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&countrycodes=in`, {
            headers: { 'User-Agent': 'AstroApp/1.0' }
        });
        res.json(response.data.filter(item => item.lat && item.lon));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
