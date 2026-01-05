const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

const ADVANCED_PROXIES = [
    { url: '', name: 'Direct' },
    { url: 'https://corsproxy.io/?', name: 'Cors Proxy' },
    { url: 'https://api.allorigins.win/raw?url=', name: 'All Origins' }
];

function getAdvancedHeaders() {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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
                timeout: 30000
            });
            if (response.status === 200) return response.data;
        } catch (error) {}
        await new Promise(r => setTimeout(r, 3000 * attempt));
    }
    throw new Error('فشل الجلب');
}

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
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}/status`, 'processing');
        
        const html = await fetchPageWithRetry(chapterData.url);
        const $ = cheerio.load(html);
        const images = [];
        
        $('.wp-manga-chapter-img, .reading-content img, .page-break img').each((i, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
            if (src && !src.includes('logo') && !src.includes('banner')) {
                images.push(src.trim());
            }
        });

        if (images.length === 0) {
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}/status`, 'failed_no_images');
            return;
        }

        const uploaded = [];
        for (let i = 0; i < images.length; i++) {
            const res = await uploadToImgBB(images[i]);
            if (res.success) uploaded.push({ order: i, url: res.url });
            await new Promise(r => setTimeout(r, 500));
        }

        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, { 
            ...chapterData, 
            images: uploaded, 
            status: uploaded.length > 0 ? 'completed' : 'failed',
            completedAt: Date.now() 
        });
        console.log(`✅ اكتمل ${chapterData.title}`);
    } catch (e) {
        console.error(`❌ خطأ: ${e.message}`);
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}/status`, 'error');
    }
}

const app = express();
app.get('/process-chapter/:mangaId/:chapterId', async (req, res) => {
    const { mangaId, chapterId } = req.params;
    const data = await readFromFirebase(`ImgChapter/${mangaId}/${chapterId}`);
    if (data && data.status !== 'completed') {
        processChapter(mangaId, chapterId, data);
        res.json({ success: true });
    } else {
        res.json({ success: true, message: 'Skipped' });
    }
});

app.get('/start-continuous-check', async (req, res) => {
    const all = await readFromFirebase('ImgChapter');
    if (all) {
        for (const [mId, chapters] of Object.entries(all)) {
            for (const [cId, data] of Object.entries(chapters)) {
                if (data.status === 'pending_images' || data.status === 'error') {
                    await processChapter(mId, cId, data);
                    return res.json({ success: true });
                }
            }
        }
    }
    res.json({ success: true });
});

app.get('/', (req, res) => { res.send('<h1>🖼️ السيرفر الثالث - V3 Fixed V2</h1>'); });

app.listen(PORT, () => {
    console.log(`Server 3 running on ${PORT}`);
    setInterval(async () => { try { await axios.get(`http://localhost:${PORT}/start-continuous-check`); } catch(e){} }, 1000 * 60 * 5);
});
