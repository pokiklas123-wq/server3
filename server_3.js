const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

// 🔧 الدوال الأساسية
async function writeToFirebase(path, data) {
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    try {
        await axios.put(url, data, { timeout: 5000 });
        return true;
    } catch (error) {
        console.error(`❌ كتابة: ${error.message}`);
        return false;
    }
}

async function readFromFirebase(path) {
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    try {
        const response = await axios.get(url, { timeout: 5000 });
        return response.data;
    } catch (error) {
        return null;
    }
}

// 🖼️ رفع الصورة
async function uploadToImgBB(imageUrl) {
    if (!IMGBB_API_KEY) return { success: false, url: imageUrl, error: 'مفتاح مفقود' };
    
    try {
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', imageUrl);
        
        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000
        });
        
        if (response.data.success) {
            return {
                success: true,
                url: response.data.data.url,
                delete_url: response.data.data.delete_url
            };
        }
    } catch (error) {
        console.error(`❌ رفع: ${error.message}`);
    }
    
    return { success: false, url: imageUrl };
}

// 📸 استخراج الصور
async function extractImages(chapterUrl) {
    try {
        const response = await axios.get(chapterUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000
        });
        
        const $ = cheerio.load(response.data);
        const images = [];
        
        $('.wp-manga-chapter-img').each((i, element) => {
            const imgUrl = $(element).attr('src');
            if (imgUrl) {
                images.push({
                    order: i,
                    originalUrl: imgUrl.replace(/[\t\n\r\s]+/g, '').trim()
                });
            }
        });
        
        return images;
    } catch (error) {
        console.error(`❌ صور: ${error.message}`);
        return [];
    }
}

// ⚙️ معالجة فصل
async function processChapter(mangaId, chapterId, chapterData) {
    try {
        console.log(`🎯 معالجة: ${mangaId}/${chapterId}`);
        
        // تحديث الحالة
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData,
            status: 'processing',
            startedAt: Date.now()
        });
        
        // استخراج الصور
        const images = await extractImages(chapterData.url);
        
        if (images.length === 0) {
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
                ...chapterData,
                status: 'failed',
                error: 'لم يتم العثور على صور',
                completedAt: Date.now()
            });
            return false;
        }
        
        // رفع الصور (3 فقط للاختبار)
        const uploadedImages = [];
        const maxImages = Math.min(images.length, 3);
        
        for (let i = 0; i < maxImages; i++) {
            const image = images[i];
            const uploadResult = await uploadToImgBB(image.originalUrl);
            
            uploadedImages.push({
                order: image.order,
                originalUrl: image.originalUrl,
                uploadedUrl: uploadResult.success ? uploadResult.url : image.originalUrl,
                success: uploadResult.success,
                uploadedAt: Date.now()
            });
            
            // تأخير بين الصور
            if (i < maxImages - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // تحديث النتيجة
        const successCount = uploadedImages.filter(img => img.success).length;
        const finalStatus = successCount > 0 ? 'completed' : 'failed';
        
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData,
            images: uploadedImages,
            status: finalStatus,
            imagesCount: uploadedImages.length,
            successCount: successCount,
            completedAt: Date.now()
        });
        
        console.log(`✅ تم: ${successCount}/${uploadedImages.length} صورة`);
        return successCount > 0;
        
    } catch (error) {
        console.error(`❌ خطأ: ${error.message}`);
        
        try {
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
                ...chapterData,
                status: 'error',
                error: error.message,
                failedAt: Date.now()
            });
        } catch (e) {}
        
        return false;
    }
}

// 🔄 المعالجة التلقائية
async function autoProcessChapters() {
    console.log('\n🔍 البحث عن فصول...');
    
    try {
        // البحث في جميع المانجا
        const allChapters = await readFromFirebase('ImgChapter');
        if (!allChapters) return;
        
        for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
            if (!mangaChapters) continue;
            
            for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                if (chapterData.status === 'pending_images') {
                    const result = await processChapter(mangaId, chapterId, chapterData);
                    
                    // تأخير بين الفصول
                    if (result) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                    
                    return; // فصل واحد في كل دورة
                }
            }
        }
        
        console.log('✅ لا توجد فصول قيد الانتظار');
        
    } catch (error) {
        console.error('❌ خطأ في المعالجة:', error.message);
    }
}

// ⏰ تشغيل تلقائي
let autoProcessInterval = null;

function startAutoProcess(intervalSeconds = 90) {
    if (autoProcessInterval) clearInterval(autoProcessInterval);
    
    autoProcessInterval = setInterval(autoProcessChapters, intervalSeconds * 1000);
    console.log(`⏰ بدأت المعالجة كل ${intervalSeconds} ثانية`);
    
    // تشغيل أول مرة
    setTimeout(autoProcessChapters, 5000);
}

function stopAutoProcess() {
    if (autoProcessInterval) {
        clearInterval(autoProcessInterval);
        autoProcessInterval = null;
        console.log('⏹️ توقفت المعالجة');
    }
}

// 📊 APIs
app.get('/start', (req, res) => {
    const interval = parseInt(req.query.seconds) || 90;
    startAutoProcess(interval);
    res.json({ success: true, message: `بدأت المعالجة كل ${interval} ثانية` });
});

app.get('/stop', (req, res) => {
    stopAutoProcess();
    res.json({ success: true, message: 'توقفت المعالجة' });
});

app.get('/run-now', async (req, res) => {
    await autoProcessChapters();
    res.json({ success: true, message: 'تمت المعالجة الآن' });
});

app.get('/status', async (req, res) => {
    const allChapters = await readFromFirebase('ImgChapter') || {};
    
    let pending = 0, processing = 0, completed = 0, failed = 0;
    
    for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
        if (mangaChapters) {
            for (const [chapterId, chapter] of Object.entries(mangaChapters)) {
                if (chapter.status === 'pending_images') pending++;
                else if (chapter.status === 'processing') processing++;
                else if (chapter.status === 'completed') completed++;
                else if (chapter.status === 'failed' || chapter.status === 'error') failed++;
            }
        }
    }
    
    res.json({
        success: true,
        autoRunning: !!autoProcessInterval,
        chapters: { pending, processing, completed, failed, total: pending + processing + completed + failed }
    });
});

// 🏠 صفحة بسيطة
app.get('/', (req, res) => {
    res.send(`
        <h1>🖼️ البوت 3 - معالج الصور</h1>
        <p><a href="/start">/start</a> - بدء التلقائي (90 ثانية)</p>
        <p><a href="/stop">/stop</a> - إيقاف التلقائي</p>
        <p><a href="/run-now">/run-now</a> - تشغيل الآن</p>
        <p><a href="/status">/status</a> - حالة النظام</p>
        <p>🔑 ImgBB: ${IMGBB_API_KEY ? '✅' : '❌'}</p>
    `);
});

// 🚀 التشغيل
app.listen(PORT, () => {
    console.log(`✅ البوت 3 يعمل على ${PORT}`);
    console.log(`🔑 ImgBB: ${IMGBB_API_KEY ? '✅ موجود' : '❌ مفقود'}`);
    
    if (IMGBB_API_KEY) {
        startAutoProcess(90);
    } else {
        console.log('⚠️ IMGBB_API_KEY مفقود - لن يعمل رفع الصور');
    }
});
