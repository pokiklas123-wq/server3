const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// ==================== متغيرات البيئة ====================
const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

// ==================== دوال Firebase ====================
async function writeToFirebase(path, data) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.error('❌ خطأ: متغيرات Firebase غير موجودة.');
        return;
    }
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    try {
        await axios.put(url, data);
    } catch (error) {
        console.error(`❌ فشل الكتابة إلى Firebase في ${path}:`, error.message);
        throw error;
    }
}

async function readFromFirebase(path) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.error('❌ خطأ: متغيرات Firebase غير موجودة.');
        return null;
    }
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null; // لا يوجد بيانات
        }
        console.error(`❌ فشل القراءة من Firebase في ${path}:`, error.message);
        throw error;
    }
}

// ==================== إعدادات الجلب (من الكود الأصلي) ====================
const ADVANCED_PROXIES = [
    { url: '', name: 'Direct' },
    { url: 'https://cors-anywhere.herokuapp.com/', name: 'Cors Anywhere' },
    { url: 'https://api.allorigins.win/raw?url=', name: 'All Origins' },
    { url: 'https://corsproxy.io/?', name: 'Cors Proxy' },
    { url: 'https://proxy.cors.sh/', name: 'Cors.sh' },
    { url: 'https://api.codetabs.com/v1/proxy?quest=', name: 'CodeTabs' },
    { url: 'https://thingproxy.freeboard.io/fetch/', name: 'ThingProxy' },
    { url: 'https://yacdn.org/proxy/', name: 'Yacdn' }
];

function getAdvancedHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    
    const referers = [
        'https://www.google.com/',
        'https://azoramoon.com/',
        ''
    ];
    
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Referer': referers[Math.floor(Math.random() * referers.length)]
    };
}

async function advancedFetch(url, maxRetries = 5) {
    // ... (منطق advancedFetch من الكود الأصلي)
    // لتبسيط الكود، سنستخدم دالة جلب مبسطة
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const proxy = ADVANCED_PROXIES[Math.floor(Math.random() * ADVANCED_PROXIES.length)];
        try {
            let targetUrl = url;
            if (proxy.url) {
                targetUrl = proxy.url + encodeURIComponent(targetUrl);
            }
            const response = await axios.get(targetUrl, {
                headers: getAdvancedHeaders(),
                timeout: 25000,
                validateStatus: (status) => status >= 200 && status < 500
            });
            if (response.status === 200) return response.data;
        } catch (error) {
            console.log(`❌ فشل [${proxy.name}]: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
    }
    throw new Error(`فشل ${maxRetries} محاولات لجلب الصفحة`);
}

async function fetchPageWithRetry(url) {
    try {
        return await advancedFetch(url);
    } catch (error) {
        console.error('❌ فشلت الطريقة المتقدمة:', error.message);
        throw error;
    }
}

function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/[\t\n\r\s]+/g, '').trim();
}

function extractImages(html) {
    const $ = cheerio.load(html);
    const images = [];
    
    // البحث بـ .wp-manga-chapter-img
    $('.wp-manga-chapter-img').each((i, element) => {
        const rawUrl = $(element).attr('src') || $(element).attr('data-src') || $(element).attr('data-lazy-src');
        if (rawUrl) {
            const cleanUrl = cleanImageUrl(rawUrl);
            if (cleanUrl && (cleanUrl.includes('.jpg') || cleanUrl.includes('.png') || cleanUrl.includes('.jpeg'))) {
                images.push({ order: i, originalUrl: cleanUrl });
            }
        }
    });
    
    // إذا لم نجد، نبحث في .reading-content
    if (images.length === 0) {
        $('.reading-content img').each((i, element) => {
            const imgUrl = $(element).attr('src');
            if (imgUrl) {
                const cleanUrl = cleanImageUrl(imgUrl);
                if (cleanUrl) {
                    images.push({ order: i, originalUrl: cleanUrl });
                }
            }
        });
    }
    
    return images;
}

async function uploadToImgBB(imageUrl) {
    if (!IMGBB_API_KEY) {
        return { success: false, message: 'IMGBB_API_KEY مفقود' };
    }
    
    try {
        // 1. جلب الصورة كـ Buffer
        const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: getAdvancedHeaders(),
            timeout: 20000
        });
        
        // 2. تحويلها إلى Base64
        const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64');
        
        // 3. الرفع إلى ImgBB
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', base64Image);
        
        const uploadResponse = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
        });
        
        if (uploadResponse.data.success) {
            return {
                success: true,
                url: uploadResponse.data.data.url,
                deleteUrl: uploadResponse.data.data.delete_url
            };
        } else {
            return { success: false, message: uploadResponse.data.error.message };
        }
        
    } catch (error) {
        console.error(`❌ فشل رفع الصورة ${imageUrl}:`, error.message);
        return { success: false, message: error.message };
    }
}

// ==================== منطق المعالجة الرئيسي ====================

async function processChapter(mangaId, chapterId, chapterData) {
    console.log(`\n🎯 بدء معالجة الفصل: ${chapterData.title} (${mangaId}/${chapterId})`);
    
    // تحديث الحالة إلى "قيد المعالجة"
    await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, { ...chapterData, status: 'processing', startedAt: Date.now() });
    
    try {
        // 1. جلب الصفحة واستخراج الصور
        const html = await fetchPageWithRetry(chapterData.url);
        const images = extractImages(html);
        
        if (images.length === 0) {
            throw new Error('لم يتم العثور على أي صور في الصفحة.');
        }
        
        console.log(`📊 تم العثور على ${images.length} صورة. بدء الرفع...`);
        
        // 2. رفع الصور إلى ImgBB
        const uploadedImages = [];
        let successCount = 0;
        
        for (const image of images) {
            const uploadResult = await uploadToImgBB(image.originalUrl);
            
            if (uploadResult.success) {
                uploadedImages.push({
                    order: image.order,
                    originalUrl: image.originalUrl,
                    imgbbUrl: uploadResult.url,
                    deleteUrl: uploadResult.deleteUrl
                });
                successCount++;
                console.log(`✅ تم رفع الصورة ${image.order + 1}`);
            } else {
                uploadedImages.push({
                    order: image.order,
                    originalUrl: image.originalUrl,
                    error: uploadResult.message
                });
                console.log(`❌ فشل رفع الصورة ${image.order + 1}: ${uploadResult.message}`);
            }
            // تأخير بسيط بين عمليات الرفع
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 3. تحديث Firebase
        const finalStatus = successCount > 0 ? 'completed' : 'failed';
        
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData,
            images: uploadedImages,
            status: finalStatus,
            imagesCount: uploadedImages.length,
            successCount: successCount,
            failCount: uploadedImages.length - successCount,
            completedAt: Date.now()
        });
        
        console.log(`\n✅ تم معالجة الفصل ${chapterId} بنجاح! الحالة: ${finalStatus}`);
        
        return {
            success: successCount > 0,
            message: `تم معالجة ${uploadedImages.length} صورة. ناجح: ${successCount}. فاشل: ${uploadedImages.length - successCount}.`,
            mangaId,
            chapterId,
            status: finalStatus
        };
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الفصل:', error.message);
        
        // تحديث حالة الخطأ في Firebase
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData,
            status: 'error',
            error: error.message,
            failedAt: Date.now()
        });
        
        return {
            success: false,
            error: error.message,
            mangaId,
            chapterId
        };
    }
}

// ==================== واجهات API ====================
const app = express();

// 🎯 API يستدعيه البوت 2 لمعالجة فصل محدد
app.get('/process-chapter/:mangaId/:chapterId', async (req, res) => {
    const { mangaId, chapterId } = req.params;
    console.log(`\n🚀 طلب معالجة فصل محدد من البوت 2: ${mangaId}/${chapterId}`);
    
    try {
        const chapterData = await readFromFirebase(`ImgChapter/${mangaId}/${chapterId}`);
        
        if (!chapterData) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الفصل' });
        }
        
        const result = await processChapter(mangaId, chapterId, chapterData);
        res.json(result);
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔄 API للتحقق المستمر (يتم استدعاؤه بواسطة Render Cron Job)
app.get('/start-continuous-check', async (req, res) => {
    console.log('\n🔄 بدء التحقق المستمر من الفصول المعلقة...');
    
    try {
        const allMangaChapters = await readFromFirebase('ImgChapter');
        let processedCount = 0;
        let targetChapter = null;
        
        if (allMangaChapters) {
            // البحث عن فصل واحد فقط في حالة "pending_images" أو "error"
            for (const [mangaId, mangaChapters] of Object.entries(allMangaChapters)) {
                if (!mangaChapters) continue;
                
                for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                    if (chapterData && (chapterData.status === 'pending_images' || chapterData.status === 'error')) {
                        targetChapter = { mangaId, chapterId, chapterData };
                        break;
                    }
                }
                if (targetChapter) break;
            }
        }
        
        if (!targetChapter) {
            return res.json({
                success: true,
                message: 'لا توجد فصول تحتاج معالجة حالياً.'
            });
        }
        
        // معالجة الفصل المستهدف
        const result = await processChapter(
            targetChapter.mangaId,
            targetChapter.chapterId,
            targetChapter.chapterData
        );
        
        res.json({
            success: true,
            message: `تم معالجة فصل واحد: ${targetChapter.mangaId}/${targetChapter.chapterId}. الحالة: ${result.status}`,
            details: result
        });
        
    } catch (error) {
        console.error('❌ خطأ في التحقق المستمر:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🏠 الصفحة الرئيسية المبسطة
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🖼️ البوت 3 - معالج الصور</title>
            <style>
                body { font-family: 'Arial', sans-serif; margin: 20px; background: #f5f5f5; text-align: right; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0 0 0 / 10%); }
                h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
                ul { list-style: none; padding: 0; }
                li { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 5px; border-right: 4px solid #4CAF50; }
                a { color: #2196F3; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
                .status { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.9em; }
                .success { background: #d4edda; color: #155724; }
                .error { background: #f8d7da; color: #721c24; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🖼️ البوت 3 - معالج الصور</h1>
                
                <h2>⚙️ حالة النظام:</h2>
                <ul>
                    <li>Firebase: <span class="status ${DATABASE_SECRETS ? 'success' : 'error'}">${DATABASE_SECRETS ? '✅ متصل' : '❌ غير متصل'}</span></li>
                    <li>ImgBB API: <span class="status ${IMGBB_API_KEY ? 'success' : 'error'}">${IMGBB_API_KEY ? '✅ موجود' : '❌ مفقود'}</span></li>
                    <li>المنفذ: <span class="status success">${PORT}</span></li>
                </ul>
                
                <h2>🎯 الروابط الرئيسية:</h2>
                <ul>
                    <li><a href="/start-continuous-check">/start-continuous-check</a> - بدء التحقق المستمر (يجب أن يتم استدعاؤه بواسطة Render Cron Job)</li>
                    <li>/process-chapter/:mangaId/:chapterId - يستدعيه البوت 2</li>
                </ul>
                
                <h2>📝 ملاحظة:</h2>
                <p>هذا البوت يعمل بشكل آلي. يجب إعداد Render Cron Job لاستدعاء <code>/start-continuous-check</code> بشكل دوري (مثلاً كل 5 دقائق) لضمان معالجة الفصول المعلقة.</p>
            </div>
        </body>
        </html>
    `);
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 (معالج الصور) يعمل على المنفذ ${PORT}`);
    console.log(`🎯 جاهز لمعالجة الصور...`);
});
