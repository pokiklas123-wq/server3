const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

// ==================== إعدادات الحماية الأصلية ====================
const ADVANCED_PROXIES = [
    { url: '', name: 'Direct' },
    { url: 'https://cors-anywhere.herokuapp.com/', name: 'Cors Anywhere' },
    { url: 'https://api.allorigins.win/raw?url=', name: 'All Origins' },
    { url: 'https://corsproxy.io/?', name: 'Cors Proxy' }
];

function getAdvancedHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://azoramoon.com/'
    };
}

async function fetchPageWithRetry(url, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const proxy = ADVANCED_PROXIES[Math.floor(Math.random() * ADVANCED_PROXIES.length)];
        try {
            let targetUrl = proxy.url ? proxy.url + encodeURIComponent(url) : url;
            const response = await axios.get(targetUrl, {
                headers: getAdvancedHeaders(),
                timeout: 25000
            });
            if (response.status === 200) return response.data;
        } catch (error) {}
        await new Promise(r => setTimeout(r, 2000 * attempt));
    }
    throw new Error('فشل الجلب');
}

// ==================== دوال Firebase ====================
async function writeToFirebase(path, data) {
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    await axios.put(url, data);
}

async function readFromFirebase(path) {
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (e) { return null; }
}

// ==================== منطق الصور ====================
async function uploadToImgBB(imageUrl) {
    try {
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: getAdvancedHeaders(), timeout: 20000 });
        const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', base64);
        const res = await axios.post('https://api.imgbb.com/1/upload', formData);
        return res.data.success ? { success: true, url: res.data.data.url } : { success: false };
    } catch (e) { return { success: false }; }
}

async function processChapter(mangaId, chapterId, chapterData) {
    console.log(`🖼️ معالجة صور: ${chapterData.title}`);
    try {
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, { ...chapterData, status: 'processing' });
        const html = await fetchPageWithRetry(chapterData.url);
        const $ = cheerio.load(html);
        const images = [];
        $('.wp-manga-chapter-img, .reading-content img').each((i, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
            if (src) images.push(src.trim());
        });

        const uploaded = [];
        for (let i = 0; i < images.length; i++) {
            const res = await uploadToImgBB(images[i]);
            if (res.success) uploaded.push({ order: i, url: res.url });
            await new Promise(r => setTimeout(r, 1000));
        }

        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, { 
            ...chapterData, 
            images: uploaded, 
            status: uploaded.length > 0 ? 'completed' : 'failed',
            completedAt: Date.now() 
        });
    } catch (e) { console.error(e.message); }
}

const app = express();
app.get('/process-chapter/:mangaId/:chapterId', async (req, res) => {
    const { mangaId, chapterId } = req.params;
    const data = await readFromFirebase(`ImgChapter/${mangaId}/${chapterId}`);
    if (data) processChapter(mangaId, chapterId, data);
    res.json({ success: true });
});
app.get('/start-continuous-check', async (req, res) => {
    const all = await readFromFirebase('ImgChapter');
    if (all) {
        for (const [mId, chapters] of Object.entries(all)) {
            for (const [cId, data] of Object.entries(chapters)) {
                if (data.status === 'pending_images' || data.status === 'error') {
                    await processChapter(mId, cId, data);
                    return res.json({ success: true, message: 'بدء معالجة فصل' });
                }
            }
        }
    }
    res.json({ success: true });
});
app.listen(PORT, () => {
    setInterval(async () => { try { await axios.get(`http://localhost:${PORT}/start-continuous-check`); } catch(e){} }, 1000 * 60 * 5);
});
