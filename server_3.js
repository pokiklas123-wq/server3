const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

// ==================== إعدادات الحماية ====================
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

async function fetchPageWithRetry(url, maxRetries = 3) {
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
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('فشل جلب صفحة الفصل');
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
        const imgRes = await axios.get(imageUrl, { 
            responseType: 'arraybuffer', 
            headers: getAdvancedHeaders(), 
            timeout: 20000 
        });
        const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', base64);
        const res = await axios.post('https://api.imgbb.com/1/upload', formData);
        return res.data.success ? { success: true, url: res.data.data.url } : { success: false };
    } catch (e) { 
        return { success: false, error: e.message }; 
    }
}

async function processChapter(mangaId, chapterId, chapterData) {
    console.log(`🖼️ معالجة صور: ${chapterData.title}`);
    try {
        // تحديث الحالة إلى جاري المعالجة
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}/status`, 'processing');
        
        const html = await fetchPageWithRetry(chapterData.url);
        const $ = cheerio.load(html);
        const images = [];
        
        // تحسين محددات الصور
        $('.wp-manga-chapter-img, .reading-content img, .page-break img').each((i, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-full-url');
            if (src && !src.includes('logo') && !src.includes('banner')) {
                images.push(src.trim());
            }
        });

        if (images.length === 0) {
            console.log(`❌ لم يتم العثور على صور في الفصل: ${chapterData.title}`);
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}/status`, 'failed_no_images');
            return;
        }

        console.log(`📸 جاري رفع ${images.length} صورة لـ: ${chapterData.title}`);
        const uploaded = [];
        for (let i = 0; i < images.length; i++) {
            const res = await uploadToImgBB(images[i]);
            if (res.success) {
                uploaded.push({ order: i, url: res.url });
            }
            // تأخير بسيط لتجنب حظر API
            await new Promise(r => setTimeout(r, 500));
        }

        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, { 
            ...chapterData, 
            images: uploaded, 
            status: uploaded.length > 0 ? 'completed' : 'failed_upload',
            completedAt: Date.now() 
        });
        console.log(`✅ اكتملت معالجة الفصل: ${chapterData.title} (${uploaded.length} صورة)`);
    } catch (e) { 
        console.error(`❌ خطأ في معالجة صور الفصل: ${e.message}`);
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}/status`, 'error');
    }
}

const app = express();

app.get('/process-chapter/:mangaId/:chapterId', async (req, res) => {
    const { mangaId, chapterId } = req.params;
    const data = await readFromFirebase(`ImgChapter/${mangaId}/${chapterId}`);
    if (data && data.status !== 'completed' && data.status !== 'processing') {
        // تشغيل في الخلفية
        processChapter(mangaId, chapterId, data).catch(err => console.error(err));
        res.json({ success: true, message: 'Image processing started' });
    } else {
        res.json({ success: true, message: 'Already processed or not found' });
    }
});

app.get('/start-continuous-check', async (req, res) => {
    res.json({ success: true, message: 'Continuous check started' });
    const all = await readFromFirebase('ImgChapter');
    if (all) {
        for (const [mId, chapters] of Object.entries(all)) {
            for (const [cId, data] of Object.entries(chapters)) {
                if (data.status === 'pending_images' || data.status === 'error') {
                    await processChapter(mId, cId, data);
                    // معالجة فصل واحد في كل دورة فحص لتجنب الضغط
                    return;
                }
            }
        }
    }
});

app.get('/', (req, res) => { res.send('<h1>🖼️ السيرفر الثالث - معالج الصور V3 Fixed</h1>'); });

app.listen(PORT, () => {
    console.log(`Server 3 running on port ${PORT}`);
    setInterval(async () => { 
        try { 
            await axios.get(`http://localhost:${PORT}/start-continuous-check`); 
        } catch(e){} 
    }, 1000 * 60 * 5);
});
