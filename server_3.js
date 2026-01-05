const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// 🔧 إصلاح رابط Firebase
const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

console.log('='.repeat(50));
console.log('🚀 البوت 3 - معالج الصور (النظام المتقدم)');
console.log('='.repeat(50));
console.log(`📡 Firebase: ${FIXED_DB_URL ? '✅' : '❌'}`);
console.log(`🔑 Secrets: ${DATABASE_SECRETS ? '✅' : '❌'}`);
console.log(`🖼️ ImgBB Key: ${IMGBB_API_KEY ? '✅' : '❌'}`);

// ==================== إعدادات التجاوز المتقدمة ====================

// 📡 قائمة وكالات أكثر تنوعاً (بناءً على المستندات المرفقة)
const ADVANCED_PROXIES = [
    // 1. استخدام CorsProxy.io (حسب المستندات: https://corsproxy.io/?url=)
    { 
        url: 'https://corsproxy.io/?url=', 
        name: 'CorsProxy.io',
        type: 'query'
    },
    // 2. استخدام CORS.SH (يتطلب مفتاح API عادة، نضعه كخيار احتياطي)
    {
        url: 'https://proxy.cors.sh/',
        name: 'Cors.sh',
        type: 'prefix',
        headers: { 'x-cors-api-key': 'temp_key_placeholder' } // ملاحظة: يحتاج مفتاح حقيقي ليعمل بكفاءة قصوى
    },
    // 3. بروكسيات عامة أخرى
    { url: 'https://api.allorigins.win/raw?url=', name: 'All Origins', type: 'query' },
    { url: 'https://cors-anywhere.herokuapp.com/', name: 'Cors Anywhere', type: 'prefix' },
    { url: 'https://api.codetabs.com/v1/proxy?quest=', name: 'CodeTabs', type: 'query' },
    // 4. الاتصال المباشر (بدون بروكسي)
    { url: '', name: 'Direct', type: 'direct' }
];

// 🛡️ دالة توليد رؤوس متقدمة (Advanced Headers)
function getAdvancedHeaders(referer = 'https://www.google.com/') {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Cache-Control': 'max-age=0',
        'Referer': referer
    };
}

// 🧹 دالة تنظيف الروابط
function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/[\t\n\r\s]+/g, '').trim();
}

// 🔄 دالة الجلب المتقدمة (Advanced Fetch)
async function advancedFetch(url, maxRetries = 5) {
    const errors = [];
    
    // خلط البروكسيات عشوائياً لكل طلب
    const shuffledProxies = [...ADVANCED_PROXIES].sort(() => 0.5 - Math.random());
    
    for (let i = 0; i < Math.min(maxRetries, shuffledProxies.length); i++) {
        const proxy = shuffledProxies[i];
        let targetUrl = url;
        let requestHeaders = getAdvancedHeaders(url);

        // إعداد الرابط حسب نوع البروكسي
        if (proxy.type === 'query') {
            targetUrl = proxy.url + encodeURIComponent(url);
        } else if (proxy.type === 'prefix') {
            targetUrl = proxy.url + url;
        }

        // إضافة رؤوس خاصة للبروكسي إذا وجدت (مثل cors.sh)
        if (proxy.headers) {
            requestHeaders = { ...requestHeaders, ...proxy.headers };
        }

        try {
            console.log(`🔄 المحاولة ${i + 1}/${maxRetries} [${proxy.name}]: ${targetUrl.substring(0, 60)}...`);
            
            const response = await axios.get(targetUrl, {
                headers: requestHeaders,
                timeout: 25000, // زيادة المهلة
                maxRedirects: 5,
                validateStatus: status => status < 500 // قبول 404 و 403 للتعامل معها يدوياً
            });
            
            if (response.status === 200) {
                console.log(`✅ نجح الاتصال عبر [${proxy.name}]`);
                return response.data;
            } else {
                console.log(`⚠️ استجابة غير ناجحة [${proxy.name}]: ${response.status}`);
                errors.push(`${proxy.name}: ${response.status}`);
            }
            
        } catch (error) {
            console.log(`❌ فشل [${proxy.name}]: ${error.message}`);
            errors.push(`${proxy.name}: ${error.message}`);
        }
        
        // انتظار بسيط بين المحاولات
        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    
    throw new Error(`فشل جميع محاولات الجلب:\n${errors.join('\n')}`);
}

// 🔮 دالة تخمين الصور مباشرة (Fallback Strategy)
async function fetchImagesDirectly(chapterUrl) {
    console.log('🔮 محاولة استنتاج روابط الصور مباشرة (Fallback)...');
    // هذه الدالة تحاول تخمين نمط الروابط بناءً على هيكلية الموقع المعروفة
    // مثال: wp-content/uploads/WP-manga/data/manga_id/chapter_id/01.jpg
    
    // ملاحظة: هذه الدالة تعتمد على الحظ قليلاً وتتطلب معرفة مسبقة بنمط الروابط
    // سأقوم بإرجاع مصفوفة فارغة هنا، ويمكنك تخصيصها إذا عرفت نمط الروابط الثابت
    return []; 
}

// 🔍 دالة استخراج الصور (محدثة)
function extractImages(html) {
    try {
        const $ = cheerio.load(html);
        const images = [];
        
        console.log('🔍 تحليل HTML لاستخراج الصور...');
        
        // البحث بـ .wp-manga-chapter-img
        $('.wp-manga-chapter-img').each((i, element) => {
            const rawUrl = $(element).attr('src') || $(element).attr('data-src') || $(element).attr('data-lazy-src');
            if (rawUrl) {
                const cleanUrl = cleanImageUrl(rawUrl);
                if (cleanUrl) {
                    images.push({
                        order: i,
                        originalUrl: cleanUrl,
                        selector: '.wp-manga-chapter-img'
                    });
                }
            }
        });
        
        // البحث في .reading-content img
        if (images.length === 0) {
            $('.reading-content img').each((i, element) => {
                const imgUrl = $(element).attr('src');
                if (imgUrl) images.push({ order: i, originalUrl: cleanImageUrl(imgUrl), selector: '.reading-content' });
            });
        }
        
        // البحث العام في img
        if (images.length === 0) {
            $('img').each((i, element) => {
                const imgUrl = $(element).attr('src');
                if (imgUrl && imgUrl.includes('/data/') && imgUrl.includes('/manga_')) {
                    images.push({ order: i, originalUrl: cleanImageUrl(imgUrl), selector: 'generic-img' });
                }
            });
        }
        
        console.log(`📊 تم العثور على ${images.length} صورة`);
        return images;
        
    } catch (error) {
        console.error('❌ خطأ في استخراج الصور:', error.message);
        return [];
    }
}

// ☁️ دالة رفع الصورة إلى ImgBB
async function uploadToImgBB(imageUrl) {
    if (!IMGBB_API_KEY) {
        return { success: false, url: imageUrl, error: 'مفتاح ImgBB مفقود' };
    }
    
    try {
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', imageUrl);
        formData.append('name', `manga_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        
        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 60000 // دقيقة كاملة للرفع
        });
        
        if (response.data && response.data.success) {
            return {
                success: true,
                url: response.data.data.url,
                display_url: response.data.data.display_url,
                width: response.data.data.width,
                height: response.data.data.height
            };
        } else {
            throw new Error('استجابة غير صحيحة من ImgBB');
        }
        
    } catch (error) {
        return {
            success: false,
            url: imageUrl,
            error: error.message
        };
    }
}

// 🔥 دوال Firebase
async function readFromFirebase(path) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) return null;
    try {
        const response = await axios.get(`${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`, { timeout: 15000 });
        return response.data;
    } catch (error) {
        console.error(`❌ خطأ قراءة Firebase: ${error.message}`);
        return null;
    }
}

async function writeToFirebase(path, data) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) return false;
    try {
        await axios.put(`${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`, data, { 
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });
        return true;
    } catch (error) {
        console.error(`❌ خطأ كتابة Firebase: ${error.message}`);
        return false;
    }
}

// 🔍 البحث عن فصل
async function findPendingChapter() {
    try {
        const allChapters = await readFromFirebase('ImgChapter');
        if (!allChapters) return null;
        
        for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
            if (!mangaChapters) continue;
            for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                if (chapterData && chapterData.status === 'pending_images') {
                    return { mangaId, chapterId, chapterData };
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// ⚙️ دالة معالجة الفصل (محدثة بالكامل)
async function processChapter(mangaId, chapterId, chapterData) {
    try {
        console.log('\n' + '='.repeat(50));
        console.log(`🎯 معالجة الفصل: ${chapterId} (${mangaId})`);
        
        const chapterUrl = chapterData.url || chapterData.test;
        if (!chapterUrl) return { success: false, error: 'لا يوجد رابط' };
        
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData, status: 'processing', startedAt: Date.now()
        });
        
        // 1. محاولة جلب الصور
        let images = [];
        try {
            const html = await advancedFetch(chapterUrl);
            images = extractImages(html);
        } catch (fetchError) {
            console.log('⚠️ فشل الجلب التقليدي، محاولة الاستنتاج المباشر...');
            images = await fetchImagesDirectly(chapterUrl);
        }
        
        if (images.length === 0) {
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
                ...chapterData, status: 'failed', error: 'لم يتم العثور على صور', completedAt: Date.now()
            });
            return { success: false, error: 'لم يتم العثور على صور' };
        }
        
        console.log(`🖼️ بدء رفع ${images.length} صورة...`);
        
        // 2. رفع الصور
        const uploadedImages = [];
        let successCount = 0;
        
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            console.log(`📤 رفع ${i + 1}/${images.length}: ${image.originalUrl.substring(0, 50)}...`);
            
            const uploadResult = await uploadToImgBB(image.originalUrl);
            
            uploadedImages.push({
                order: image.order,
                originalUrl: image.originalUrl,
                uploadedUrl: uploadResult.success ? uploadResult.url : image.originalUrl,
                success: uploadResult.success,
                error: uploadResult.error
            });
            
            if (uploadResult.success) successCount++;
            
            // تأخير ذكي لتجنب الحظر
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // 3. الحفظ النهائي
        const finalStatus = successCount > 0 ? 'completed' : 'failed';
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData,
            images: uploadedImages.sort((a, b) => a.order - b.order),
            status: finalStatus,
            imagesCount: uploadedImages.length,
            successCount: successCount,
            completedAt: Date.now()
        });
        
        console.log(`✅ انتهى المعالجة: ${successCount} ناجح`);
        return { success: successCount > 0, count: successCount };
        
    } catch (error) {
        console.error('❌ خطأ قاتل في المعالجة:', error.message);
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData, status: 'error', error: error.message
        });
        return { success: false, error: error.message };
    }
}

// ==================== APIs ====================

app.get('/process-next', async (req, res) => {
    const chapter = await findPendingChapter();
    if (!chapter) return res.json({ success: false, message: 'لا يوجد فصول' });
    const result = await processChapter(chapter.mangaId, chapter.chapterId, chapter.chapterData);
    res.json(result);
});

app.get('/process/:mangaId/:chapterId', async (req, res) => {
    const { mangaId, chapterId } = req.params;
    const data = await readFromFirebase(`ImgChapter/${mangaId}/${chapterId}`);
    if (!data) return res.json({ success: false, error: 'غير موجود' });
    const result = await processChapter(mangaId, chapterId, data);
    res.json(result);
});

app.get('/chapters', async (req, res) => {
    const data = await readFromFirebase('ImgChapter');
    res.json(data || {});
});

app.get('/test-imgbb', async (req, res) => {
    if (!IMGBB_API_KEY) return res.json({ error: 'No API Key' });
    const result = await uploadToImgBB('https://i.ibb.co/w04Pn91/test.png');
    res.json(result);
});

app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; padding: 20px; direction: rtl;">
            <h1>🤖 البوت 3 (المطور)</h1>
            <p>الحالة: <strong>نشط</strong></p>
            <p>البروكسيات المفعلة: ${ADVANCED_PROXIES.length}</p>
            <hr>
            <a href="/process-next">معالجة التالي</a> | 
            <a href="/chapters">عرض الفصول</a> | 
            <a href="/test-imgbb">فحص ImgBB</a>
        </div>
    `);
});

// تشغيل تلقائي كل دقيقتين
setInterval(async () => {
    const chapter = await findPendingChapter();
    if (chapter) {
        console.log(`⏰ تشغيل تلقائي للفصل: ${chapter.chapterId}`);
        await processChapter(chapter.mangaId, chapter.chapterId, chapter.chapterData);
    }
}, 120000);

app.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على المنفذ ${PORT}`);
});
