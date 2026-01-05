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
console.log('🚀 البوت 3 - معالج الصور');
console.log('='.repeat(50));
console.log(`📡 Firebase: ${FIXED_DB_URL ? '✅' : '❌'}`);
console.log(`🔑 Secrets: ${DATABASE_SECRETS ? '✅' : '❌'}`);
console.log(`🖼️ ImgBB Key: ${IMGBB_API_KEY ? '✅' : '❌'}`);

// 📱 User-Agents متنوعة
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

// 🔄 قائمة بروكسيات
const PROXIES = [
    '',
    'https://cors-anywhere.herokuapp.com/',
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://proxy.cors.sh/'
];

// 🎯 دالة للحصول على User-Agent عشوائي
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// 🧹 دالة تنظيف الروابط
function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/[\t\n\r\s]+/g, '').trim();
}

// 🌐 دالة جلب الصفحة مع إعادة محاولة
async function fetchPageWithRetry(url, retries = 3) {
    const errors = [];
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`🔄 المحاولة ${attempt}/${retries}: ${url.substring(0, 60)}...`);
            
            // محاولة مباشرة أولاً
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Referer': 'https://azoramoon.com/',
                    'DNT': '1'
                },
                timeout: 30000,
                maxRedirects: 5
            });
            
            console.log(`✅ نجحت المحاولة ${attempt} - الحالة: ${response.status}`);
            return response.data;
            
        } catch (error) {
            errors.push(`المحاولة ${attempt}: ${error.message}`);
            console.log(`❌ فشلت المحاولة ${attempt}: ${error.message}`);
            
            // إذا لم تكن آخر محاولة، انتظر
            if (attempt < retries) {
                const delay = 2000 * attempt;
                console.log(`⏳ انتظار ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`فشل جميع المحاولات (${retries}):\n${errors.join('\n')}`);
}

// 🔍 دالة استخراج الصور
function extractImages(html) {
    try {
        const $ = cheerio.load(html);
        const images = [];
        
        console.log('🔍 البحث عن الصور...');
        
        // البحث بـ .wp-manga-chapter-img
        $('.wp-manga-chapter-img').each((i, element) => {
            const rawUrl = $(element).attr('src');
            const dataSrc = $(element).attr('data-src');
            const dataLazy = $(element).attr('data-lazy-src');
            
            const finalUrl = rawUrl || dataSrc || dataLazy;
            
            if (finalUrl) {
                const cleanUrl = cleanImageUrl(finalUrl);
                if (cleanUrl && (cleanUrl.includes('.jpg') || cleanUrl.includes('.png') || cleanUrl.includes('.jpeg'))) {
                    images.push({
                        order: i,
                        originalUrl: cleanUrl,
                        rawUrl: finalUrl,
                        selector: '.wp-manga-chapter-img',
                        foundAt: Date.now()
                    });
                }
            }
        });
        
        // إذا لم نجد، نبحث في .reading-content
        if (images.length === 0) {
            console.log('🔍 البحث في .reading-content...');
            $('.reading-content img').each((i, element) => {
                const imgUrl = $(element).attr('src');
                if (imgUrl) {
                    const cleanUrl = cleanImageUrl(imgUrl);
                    if (cleanUrl) {
                        images.push({
                            order: i,
                            originalUrl: cleanUrl,
                            selector: '.reading-content img',
                            foundAt: Date.now()
                        });
                    }
                }
            });
        }
        
        // إذا لا يزال لم نجد، نبحث في جميع الصور
        if (images.length === 0) {
            console.log('🔍 البحث في جميع الصور...');
            $('img').each((i, element) => {
                const imgUrl = $(element).attr('src');
                if (imgUrl && imgUrl.includes('/data/') && imgUrl.includes('/manga_')) {
                    const cleanUrl = cleanImageUrl(imgUrl);
                    if (cleanUrl) {
                        images.push({
                            order: i,
                            originalUrl: cleanUrl,
                            selector: 'img',
                            foundAt: Date.now()
                        });
                    }
                }
            });
        }
        
        console.log(`📊 تم العثور على ${images.length} صورة`);
        
        // عرض عينة
        if (images.length > 0) {
            console.log('🔗 عينة من الصور:');
            images.slice(0, 3).forEach((img, i) => {
                console.log(`  ${i+1}. ${img.originalUrl.substring(0, 70)}...`);
            });
        }
        
        return images;
        
    } catch (error) {
        console.error('❌ خطأ في استخراج الصور:', error.message);
        return [];
    }
}

// ☁️ دالة رفع الصورة إلى ImgBB
async function uploadToImgBB(imageUrl) {
    // تحقق من وجود المفتاح
    if (!IMGBB_API_KEY) {
        console.log('⚠️ IMGBB_API_KEY غير موجود');
        return {
            success: false,
            url: imageUrl,
            error: 'مفتاح ImgBB مفقود',
            timestamp: Date.now()
        };
    }
    
    try {
        console.log(`📤 رفع الصورة: ${imageUrl.substring(0, 60)}...`);
        
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', imageUrl);
        formData.append('name', `manga_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        
        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            timeout: 45000
        });
        
        if (response.data && response.data.success) {
            const result = {
                success: true,
                url: response.data.data.url,
                display_url: response.data.data.display_url,
                delete_url: response.data.data.delete_url,
                size: response.data.data.size,
                width: response.data.data.width,
                height: response.data.data.height,
                timestamp: Date.now()
            };
            
            console.log(`✅ تم الرفع: ${result.url.substring(0, 60)}...`);
            return result;
            
        } else {
            throw new Error(response.data?.error?.message || 'استجابة غير صحيحة من ImgBB');
        }
        
    } catch (error) {
        console.error('❌ خطأ في رفع الصورة:', error.message);
        
        // تفاصيل إضافية للتصحيح
        if (error.response) {
            console.error(`📡 حالة الخطأ: ${error.response.status}`);
            console.error(`📝 بيانات الخطأ:`, error.response.data);
        }
        
        return {
            success: false,
            url: imageUrl,
            error: error.message,
            status: error.response?.status,
            timestamp: Date.now()
        };
    }
}

// 🔥 دالة قراءة من Firebase
async function readFromFirebase(path) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.log('⚠️ إعدادات Firebase غير مكتملة');
        return null;
    }
    
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        console.log(`📖 قراءة من Firebase: ${path}`);
        const response = await axios.get(url, { timeout: 15000 });
        return response.data;
    } catch (error) {
        console.error(`❌ خطأ في قراءة ${path}:`, error.message);
        return null;
    }
}

// 🔥 دالة الكتابة إلى Firebase
async function writeToFirebase(path, data) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.log('⚠️ إعدادات Firebase غير مكتملة');
        return false;
    }
    
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        await axios.put(url, data, { 
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`✅ تم الكتابة إلى Firebase: ${path}`);
        return true;
    } catch (error) {
        console.error(`❌ خطأ في الكتابة إلى ${path}:`, error.message);
        return false;
    }
}

// 🔍 دالة البحث عن فصل يحتاج معالجة
async function findPendingChapter() {
    try {
        console.log('\n🔍 البحث عن فصل قيد الانتظار...');
        
        // قراءة جميع الفصول
        const allChapters = await readFromFirebase('ImgChapter');
        
        if (!allChapters) {
            console.log('ℹ️ لا توجد فصول في Firebase');
            return null;
        }
        
        let totalChapters = 0;
        let pendingChapters = 0;
        
        // البحث في جميع المانجا
        for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
            if (!mangaChapters) continue;
            
            // البحث في فصول هذه المانجا
            for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                totalChapters++;
                
                if (chapterData && chapterData.status === 'pending_images') {
                    pendingChapters++;
                    console.log(`🎯 وجد فصل: ${mangaId}/${chapterId}`);
                    
                    return {
                        mangaId,
                        chapterId,
                        chapterData,
                        fullPath: `ImgChapter/${mangaId}/${chapterId}`
                    };
                }
            }
        }
        
        console.log(`📊 الإحصاء: ${totalChapters} فصل، ${pendingChapters} قيد الانتظار`);
        
        return null;
        
    } catch (error) {
        console.error('❌ خطأ في البحث عن فصل:', error.message);
        return null;
    }
}

// ⚙️ دالة معالجة فصل واحد
async function processChapter(mangaId, chapterId, chapterData) {
    try {
        console.log('\n' + '='.repeat(50));
        console.log(`🎯 معالجة الفصل: ${chapterId}`);
        console.log(`📖 المانجا: ${mangaId}`);
        console.log(`📝 العنوان: ${chapterData.title || 'بدون عنوان'}`);
        console.log('='.repeat(50));
        
        // التحقق من وجود رابط
        const chapterUrl = chapterData.url || chapterData.test;
        if (!chapterUrl) {
            console.log('❌ لا يوجد رابط للفصل');
            return { success: false, error: 'لا يوجد رابط للفصل' };
        }
        
        // تحديث الحالة في Firebase
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData,
            status: 'processing',
            startedAt: Date.now()
        });
        
        // جلب صفحة الفصل
        console.log(`📥 جلب الصفحة: ${chapterUrl}`);
        const html = await fetchPageWithRetry(chapterUrl);
        
        // استخراج الصور
        const images = extractImages(html);
        
        if (images.length === 0) {
            console.log('❌ لم يتم العثور على صور');
            
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
                ...chapterData,
                status: 'failed',
                error: 'لم يتم العثور على صور',
                completedAt: Date.now()
            });
            
            return { success: false, error: 'لم يتم العثور على صور' };
        }
        
        console.log(`🖼️ بدء رفع ${images.length} صورة...`);
        
        // رفع الصور
        const uploadedImages = [];
        let successCount = 0;
        
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            
            console.log(`\n📊 الصورة ${i + 1}/${images.length}`);
            console.log(`🔗 الرابط: ${image.originalUrl.substring(0, 70)}...`);
            
            const uploadResult = await uploadToImgBB(image.originalUrl);
            
            uploadedImages.push({
                order: image.order,
                originalUrl: image.originalUrl,
                uploadedUrl: uploadResult.success ? uploadResult.url : image.originalUrl,
                success: uploadResult.success,
                error: uploadResult.error,
                uploadData: uploadResult,
                uploadedAt: Date.now()
            });
            
            if (uploadResult.success) {
                successCount++;
                console.log(`✅ تم رفع الصورة ${i + 1}`);
            } else {
                console.log(`❌ فشل رفع الصورة ${i + 1}: ${uploadResult.error}`);
            }
            
            // تأخير بين الصور لتجنب الحظر
            if (i < images.length - 1) {
                const delay = 2000 + Math.random() * 1000;
                console.log(`⏳ انتظار ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // ترتيب الصور حسب الترتيب
        uploadedImages.sort((a, b) => a.order - b.order);
        
        console.log(`\n📊 نتيجة الرفع:`);
        console.log(`✅ ناجح: ${successCount}`);
        console.log(`❌ فاشل: ${uploadedImages.length - successCount}`);
        
        // تحديث Firebase
        const finalStatus = successCount > 0 ? 'completed' : 'failed';
        
        await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
            ...chapterData,
            images: uploadedImages,
            status: finalStatus,
            imagesCount: uploadedImages.length,
            successCount: successCount,
            failCount: uploadedImages.length - successCount,
            completedAt: Date.now(),
            test: null // إزالة الحقل المؤقت
        });
        
        console.log(`\n✅ تم معالجة الفصل ${chapterId} بنجاح!`);
        console.log(`💾 تم حفظ ${uploadedImages.length} صورة في Firebase`);
        
        return {
            success: successCount > 0,
            message: `تم معالجة ${uploadedImages.length} صورة`,
            mangaId,
            chapterId,
            imagesCount: uploadedImages.length,
            successCount: successCount,
            failCount: uploadedImages.length - successCount,
            status: finalStatus
        };
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الفصل:', error.message);
        
        // تحديث حالة الخطأ في Firebase
        try {
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
                ...chapterData,
                status: 'error',
                error: error.message,
                failedAt: Date.now()
            });
        } catch (firebaseError) {
            console.error('❌ فشل تحديث Firebase:', firebaseError.message);
        }
        
        return {
            success: false,
            error: error.message,
            mangaId,
            chapterId
        };
    }
}

// ==================== APIs ====================

// 🎯 API لمعالجة الفصل التالي
app.get('/process-next', async (req, res) => {
    try {
        console.log('\n🚀 طلب معالجة الفصل التالي');
        
        const chapterData = await findPendingChapter();
        
        if (!chapterData) {
            return res.json({
                success: false,
                message: 'لا توجد فصول تحتاج معالجة',
                timestamp: Date.now()
            });
        }
        
        const result = await processChapter(
            chapterData.mangaId,
            chapterData.chapterId,
            chapterData.chapterData
        );
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ خطأ في /process-next:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: Date.now()
        });
    }
});

// 🎯 API لمعالجة فصل محدد
app.get('/process/:mangaId/:chapterId', async (req, res) => {
    try {
        const { mangaId, chapterId } = req.params;
        
        console.log(`\n🚀 طلب معالجة فصل محدد: ${mangaId}/${chapterId}`);
        
        const chapterData = await readFromFirebase(`ImgChapter/${mangaId}/${chapterId}`);
        
        if (!chapterData) {
            return res.json({
                success: false,
                error: 'لم يتم العثور على الفصل',
                mangaId,
                chapterId
            });
        }
        
        const result = await processChapter(mangaId, chapterId, chapterData);
        res.json(result);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 📊 API لعرض الفصول
app.get('/chapters', async (req, res) => {
    try {
        const allChapters = await readFromFirebase('ImgChapter');
        
        if (!allChapters) {
            return res.json({
                success: false,
                message: 'لا توجد فصول'
            });
        }
        
        const stats = {
            totalManga: Object.keys(allChapters).length,
            totalChapters: 0,
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0
        };
        
        const chaptersList = [];
        
        for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
            if (!mangaChapters) continue;
            
            for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                stats.totalChapters++;
                
                if (chapterData.status === 'pending_images') stats.pending++;
                else if (chapterData.status === 'processing') stats.processing++;
                else if (chapterData.status === 'completed') stats.completed++;
                else if (chapterData.status === 'failed') stats.failed++;
                
                chaptersList.push({
                    mangaId,
                    chapterId,
                    status: chapterData.status || 'unknown',
                    title: chapterData.title || 'بدون عنوان',
                    url: chapterData.url || chapterData.test || 'لا يوجد',
                    imagesCount: chapterData.images?.length || 0,
                    chapterNumber: chapterData.chapterNumber || 0,
                    updatedAt: chapterData.completedAt || chapterData.createdAt
                });
            }
        }
        
        res.json({
            success: true,
            stats,
            chapters: chaptersList.slice(0, 50),
            total: chaptersList.length,
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🧪 API لاختبار ImgBB
app.get('/test-imgbb', async (req, res) => {
    try {
        if (!IMGBB_API_KEY) {
            return res.json({
                success: false,
                message: 'IMGBB_API_KEY غير موجود',
                suggestion: 'أضفه في Render كمتغير بيئة'
            });
        }
        
        const testImage = 'https://azoramoon.com/wp-content/uploads/WP-manga/data/manga_68e7e230c9266/c9c192648fe4add82461f3c06a8a5d60/01.jpg';
        const cleanedImage = cleanImageUrl(testImage);
        
        console.log(`🧪 اختبار رفع صورة: ${cleanedImage.substring(0, 60)}...`);
        
        const result = await uploadToImgBB(cleanedImage);
        
        res.json({
            success: result.success,
            test: {
                original: testImage,
                cleaned: cleanedImage,
                length: cleanedImage.length
            },
            result: result,
            timestamp: Date.now()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 🏠 الصفحة الرئيسية
app.get('/', (req, res) => {
    const status = {
        firebase: DATABASE_SECRETS ? '✅ متصل' : '❌ غير متصل',
        imgbb: IMGBB_API_KEY ? '✅ موجود' : '❌ مفقود',
        port: PORT,
        userAgents: USER_AGENTS.length,
        proxies: PROXIES.length
    };
    
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🖼️ البوت 3 - معالج الصور</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
                h2 { color: #555; margin-top: 25px; }
                ul { list-style: none; padding: 0; }
                li { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 5px; border-left: 4px solid #4CAF50; }
                a { color: #2196F3; text-decoration: none; font-weight: bold; }
                a:hover { text-decoration: underline; }
                .status { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.9em; }
                .success { background: #d4edda; color: #155724; }
                .error { background: #f8d7da; color: #721c24; }
                .warning { background: #fff3cd; color: #856404; }
                .info { background: #d1ecf1; color: #0c5460; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🖼️ البوت 3 - معالج الصور</h1>
                
                <h2>📊 حالة النظام:</h2>
                <ul>
                    <li>Firebase: <span class="status ${DATABASE_SECRETS ? 'success' : 'error'}">${status.firebase}</span></li>
                    <li>ImgBB API: <span class="status ${IMGBB_API_KEY ? 'success' : 'error'}">${status.imgbb}</span></li>
                    <li>المنفذ: <span class="status info">${PORT}</span></li>
                    <li>عدد User-Agents: <span class="status info">${USER_AGENTS.length}</span></li>
                    <li>عدد البروكسيات: <span class="status info">${PROXIES.length}</span></li>
                </ul>
                
                <h2>🎯 الروابط الرئيسية:</h2>
                <ul>
                    <li><a href="/process-next">/process-next</a> - معالجة الفصل التالي</li>
                    <li><a href="/chapters">/chapters</a> - عرض جميع الفصول</li>
                    <li><a href="/test-imgbb">/test-imgbb</a> - اختبار ImgBB</li>
                </ul>
                
                <h2>🔧 معالجة فصول محددة:</h2>
                <ul>
                    <li><a href="/process/14584dfb5297/ch_0001">/process/14584dfb5297/ch_0001</a> - الفصل 1</li>
                    <li><a href="/process/14584dfb5297/ch_0002">/process/14584dfb5297/ch_0002</a> - الفصل 2</li>
                    <li><a href="/process/14584dfb5297/ch_0003">/process/14584dfb5297/ch_0003</a> - الفصل 3</li>
                </ul>
                
                <h2>📝 المهام:</h2>
                <ol>
                    <li>اختبر ImgBB أولاً (/test-imgbb)</li>
                    <li>إذا نجح، عالج فصل (/process-next)</li>
                    <li>تحقق من Firebase بعد المعالجة</li>
                    <li>اختر فصولاً أخرى للعمل عليها</li>
                </ol>
                
                <h2>⚠️ ملاحظات:</h2>
                <ul>
                    <li>البوت سيرفع جميع الصور في الفصل الواحد</li>
                    <li>يوجد تأخير 2-3 ثواني بين كل صورة</li>
                    <li>النتائج تحفظ في Firebase تلقائياً</li>
                </ul>
            </div>
        </body>
        </html>
    `);
});

// ⏰ معالجة تلقائية كل 2 دقيقة
setInterval(async () => {
    console.log('\n⏰ فحص تلقائي للفصول...');
    try {
        const chapter = await findPendingChapter();
        if (chapter) {
            console.log(`🔍 وجد فصل: ${chapter.chapterId}`);
            // يمكن تفعيل المعالجة التلقائية هنا إذا أردت
        }
    } catch (error) {
        console.error('❌ خطأ في الفحص التلقائي:', error.message);
    }
}, 120000); // كل 2 دقيقة

// 🚀 تشغيل السيرفر
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`✅ البوت 3 يعمل على المنفذ ${PORT}`);
    console.log(`🔗 افتح: https://server-3.onrender.com`);
    console.log('🎯 جاهز لمعالجة الصور...');
    console.log('='.repeat(50));
    
    // تحذير إذا كان مفتاح ImgBB مفقوداً
    if (!IMGBB_API_KEY) {
        console.log('\n⚠️ ⚠️ ⚠️ تحذير مهم ⚠️ ⚠️ ⚠️');
        console.log('IMGBB_API_KEY غير موجود في متغيرات البيئة!');
        console.log('أضف المفتاح في Render:');
        console.log('1. اذهب إلى Environment في Render');
        console.log('2. أضف متغير: IMGBB_API_KEY');
        console.log('3. أدخل مفتاحك من imgbb.com');
        console.log('4. أعِد نشر الخدمة');
        console.log('⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️');
    }
});
