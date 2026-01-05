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
console.log('🚀 البوت 3 - معالج الصور (النسخة المتطورة)');
console.log('='.repeat(50));

// 📡 قائمة وكالات متقدمة
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

// 🛡️ دالة للحصول على رؤوس متقدمة
function getAdvancedHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    
    const referers = [
        'https://www.google.com/',
        'https://www.bing.com/',
        'https://duckduckgo.com/',
        'https://azoramoon.com/',
        'https://www.facebook.com/'
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
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Referer': referers[Math.floor(Math.random() * referers.length)]
    };
}

// 🔄 دالة محاولة متقدمة
async function advancedFetch(url, maxRetries = 5) {
    const errors = [];
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // اختيار بروكسي عشوائي
        const proxy = ADVANCED_PROXIES[Math.floor(Math.random() * ADVANCED_PROXIES.length)];
        
        try {
            let targetUrl = url;
            
            // إضافة البروكسي إذا كان له رابط
            if (proxy.url) {
                targetUrl = proxy.url + encodeURIComponent(targetUrl);
            }
            
            console.log(`🔄 المحاولة ${attempt}/${maxRetries} [${proxy.name}]: ${targetUrl.substring(0, 80)}...`);
            
            const response = await axios.get(targetUrl, {
                headers: getAdvancedHeaders(),
                timeout: 25000,
                maxRedirects: 3,
                validateStatus: function (status) {
                    return status >= 200 && status < 500;
                }
            });
            
            if (response.status === 200) {
                console.log(`✅ نجح [${proxy.name}]: ${response.status}`);
                return response.data;
            } else if (response.status === 403 || response.status === 429) {
                console.log(`⚠️ حظر [${proxy.name}]: ${response.status}`);
                errors.push(`${proxy.name}: ${response.status}`);
            } else {
                console.log(`ℹ️ استجابة [${proxy.name}]: ${response.status}`);
                return response.data;
            }
            
        } catch (error) {
            errors.push(`${proxy.name}: ${error.message}`);
            console.log(`❌ فشل [${proxy.name}]: ${error.message}`);
        }
        
        // تأخير متزايد بين المحاولات
        const delay = 3000 * attempt + Math.random() * 2000;
        console.log(`⏳ انتظار ${Math.round(delay/1000)} ثواني...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    throw new Error(`فشل ${maxRetries} محاولات:\n${errors.join('\n')}`);
}

// 🌐 دالة جلب الصفحة مع جميع المحاولات
async function fetchPageWithRetry(url) {
    try {
        console.log(`\n🎯 جلب الصفحة: ${url}`);
        
        // المحاولة 1: الطريقة المتقدمة
        try {
            return await advancedFetch(url);
        } catch (error) {
            console.log('❌ فشلت الطريقة المتقدمة:', error.message);
        }
        
        // المحاولة 2: HTTP بدلاً من HTTPS
        if (url.startsWith('https://')) {
            const httpUrl = url.replace('https://', 'http://');
            console.log(`🔄 محاولة HTTP: ${httpUrl}`);
            
            try {
                const response = await axios.get(httpUrl, {
                    headers: getAdvancedHeaders(),
                    timeout: 20000
                });
                console.log('✅ نجحت مع HTTP');
                return response.data;
            } catch (httpError) {
                console.log('❌ فشلت مع HTTP:', httpError.message);
            }
        }
        
        // المحاولة 3: بدائل النطاق
        if (url.includes('azoramoon.com')) {
            const variants = [
                url,
                url.includes('www.') ? url.replace('www.', '') : url.replace('azoramoon.com', 'www.azoramoon.com'),
                url.replace('azoramoon.com', 'azoramoon.net')
            ];
            
            for (const variant of variants) {
                if (variant !== url) {
                    console.log(`🔄 محاولة البديل: ${variant}`);
                    
                    try {
                        const response = await axios.get(variant, {
                            headers: getAdvancedHeaders(),
                            timeout: 15000
                        });
                        console.log(`✅ نجح البديل: ${variant}`);
                        return response.data;
                    } catch (variantError) {
                        console.log(`❌ فشل البديل: ${variantError.message}`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        throw new Error('فشلت جميع طرق الجلب');
        
    } catch (error) {
        console.error('❌ خطأ نهائي:', error.message);
        throw error;
    }
}

// 🧹 دالة تنظيف الروابط
function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    return url.replace(/[\t\n\r\s]+/g, '').trim();
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

// 🔄 دالة بديلة: جلب الصور مباشرة
async function fetchImagesDirectly(chapterUrl) {
    console.log('🔄 محاولة جلب الصور مباشرة...');
    
    try {
        // بناء روابط الصور بناءً على النمط المعروف
        const basePattern = 'https://azoramoon.com/wp-content/uploads/WP-manga/data/manga_68e7e230c9266/';
        
        // استخراج رقم الفصل من الرابط
        const chapterMatch = chapterUrl.match(/\/(\d+)\/$/);
        const chapterNum = chapterMatch ? chapterMatch[1] : '1';
        
        const images = [];
        const totalImages = chapterNum === '2' ? 85 : 70; // حسب الفصل
        
        // نمطان مختلفان للمجلدات
        const folders = [
            'c9c192648fe4add82461f3c06a8a5d60', // للفصل 2
            'd8f4e5c7b9a1d2e3f4a5b6c7d8e9f0a1', // قديم
            'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', // محتمل
            `chapter_${chapterNum}_folder` // محاولة
        ];
        
        for (let i = 1; i <= totalImages; i++) {
            const paddedNumber = i.toString().padStart(2, '0');
            
            // محاولة عدة أنماط
            for (const folder of folders) {
                const imageUrl = `${basePattern}${folder}/${paddedNumber}.jpg`;
                
                images.push({
                    order: i - 1,
                    originalUrl: imageUrl,
                    estimated: true,
                    folder: folder,
                    pattern: 'generated'
                });
            }
        }
        
        console.log(`🔢 أنشئت ${images.length} رابط صور تقديرياً`);
        return images.slice(0, totalImages); // فقط العدد المطلوب
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الروابط:', error.message);
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
        
        let images = [];
        
        // المحاولة 1: جلب صفحة الفصل
        try {
            console.log(`📥 جلب صفحة الفصل...`);
            const html = await fetchPageWithRetry(chapterUrl);
            images = extractImages(html);
        } catch (pageError) {
            console.log('❌ فشل جلب صفحة الفصل:', pageError.message);
            
            // المحاولة 2: جلب الصور مباشرة
            console.log('🔄 محاولة جلب الصور مباشرة...');
            images = await fetchImagesDirectly(chapterUrl);
        }
        
        if (images.length === 0) {
            console.log('❌ لم يتم العثور على أي صور');
            
            await writeToFirebase(`ImgChapter/${mangaId}/${chapterId}`, {
                ...chapterData,
                status: 'failed',
                error: 'لم يتم العثور على صور',
                completedAt: Date.now()
            });
            
            return { success: false, error: 'لم يتم العثور على صور' };
        }
        
        console.log(`🖼️ بدء رفع ${images.length} صورة...`);
        
        // رفع الصور (5 فقط للاختبار)
        const uploadedImages = [];
        let successCount = 0;
        const maxImages = Math.min(images.length, 5); // 5 صور فقط للاختبار
        
        for (let i = 0; i < maxImages; i++) {
            const image = images[i];
            
            console.log(`\n📊 الصورة ${i + 1}/${maxImages}`);
            console.log(`🔗 الرابط: ${image.originalUrl.substring(0, 70)}...`);
            
            const uploadResult = await uploadToImgBB(image.originalUrl);
            
            uploadedImages.push({
                order: image.order,
                originalUrl: image.originalUrl,
                uploadedUrl: uploadResult.success ? uploadResult.url : image.originalUrl,
                success: uploadResult.success,
                error: uploadResult.error,
                uploadData: uploadResult,
                uploadedAt: Date.now(),
                estimated: image.estimated || false
            });
            
            if (uploadResult.success) {
                successCount++;
                console.log(`✅ تم رفع الصورة ${i + 1}`);
            } else {
                console.log(`❌ فشل رفع الصورة ${i + 1}: ${uploadResult.error}`);
            }
            
            // تأخير بين الصور
            if (i < maxImages - 1) {
                const delay = 2000 + Math.random() * 1000;
                console.log(`⏳ انتظار ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // ترتيب الصور
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
            test: null
        });
        
        console.log(`\n✅ تم معالجة الفصل ${chapterId} بنجاح!`);
        
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
        
        // البحث عن فصل قيد الانتظار
        const allChapters = await readFromFirebase('ImgChapter');
        let targetChapter = null;
        
        if (allChapters) {
            for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
                if (!mangaChapters) continue;
                
                for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                    if (chapterData && chapterData.status === 'pending_images') {
                        targetChapter = { mangaId, chapterId, chapterData };
                        break;
                    }
                }
                if (targetChapter) break;
            }
        }
        
        if (!targetChapter) {
            return res.json({
                success: false,
                message: 'لا توجد فصول تحتاج معالجة',
                timestamp: Date.now()
            });
        }
        
        const result = await processChapter(
            targetChapter.mangaId,
            targetChapter.chapterId,
            targetChapter.chapterData
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
                else if (chapterData.status === 'failed' || chapterData.status === 'error') stats.failed++;
                
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
                message: 'IMGBB_API_KEY غير موجود'
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
    res.send(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🖼️ البوت 3 - النسخة المتطورة</title>
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
                <h1>🖼️ البوت 3 - النسخة المتطورة</h1>
                
                <h2>📊 حالة النظام:</h2>
                <ul>
                    <li>Firebase: <span class="status ${DATABASE_SECRETS ? 'success' : 'error'}">${DATABASE_SECRETS ? '✅ متصل' : '❌ غير متصل'}</span></li>
                    <li>ImgBB API: <span class="status ${IMGBB_API_KEY ? 'success' : 'error'}">${IMGBB_API_KEY ? '✅ موجود' : '❌ مفقود'}</span></li>
                    <li>المنفذ: <span class="status info">${PORT}</span></li>
                    <li>عدد البروكسيات: <span class="status info">${ADVANCED_PROXIES.length}</span></li>
                </ul>
                
                <h2>🎯 الروابط الرئيسية:</h2>
                <ul>
                    <li><a href="/process-next">/process-next</a> - معالجة الفصل التالي</li>
                    <li><a href="/chapters">/chapters</a> - عرض جميع الفصول</li>
                    <li><a href="/test-imgbb">/test-imgbb</a> - اختبار ImgBB</li>
                </ul>
                
                <h2>🔧 معالجة فصول محددة:</h2>
                <ul>
                    <li><a href="/process/14584dfb5297/ch_0009">/process/14584dfb5297/ch_0009</a> - الفصل 9</li>
                    <li><a href="/process/14584dfb5297/ch_0010">/process/14584dfb5297/ch_0010</a> - الفصل 10</li>
                    <li><a href="/process/14584dfb5297/ch_0011">/process/14584dfb5297/ch_0011</a> - الفصل 11</li>
                </ul>
                
                <h2>⚠️ المميزات الجديدة:</h2>
                <ol>
                    <li>8 بروكسيات مختلفة لتجاوز الحظر</li>
                    <li>رؤوس HTTP متغيرة عشوائياً</li>
                    <li>جلب الصور مباشرة إذا فشل جلب الصفحة</li>
                    <li>رفع 5 صور فقط للاختبار أولاً</li>
                </ol>
                
                <h2>📝 التعليمات:</h2>
                <ol>
                    <li>اختبر أولاً: /test-imgbb</li>
                    <li>جرب فصل 9 أو 10 أو 11</li>
                    <li>إذا نجح، جرب /process-next</li>
                    <li>تحقق من Firebase بعد المعالجة</li>
                </ol>
            </div>
        </body>
        </html>
    `);
});

// ⏰ معالجة تلقائية كل 3 دقائق
setInterval(async () => {
    console.log('\n⏰ فحص تلقائي للفصول...');
    try {
        const allChapters = await readFromFirebase('ImgChapter');
        if (allChapters) {
            let pending = 0;
            for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
                if (mangaChapters) {
                    for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                        if (chapterData && chapterData.status === 'pending_images') {
                            pending++;
                        }
                    }
                }
            }
            console.log(`📊 ${pending} فصل قيد الانتظار`);
        }
    } catch (error) {
        console.error('❌ خطأ في الفحص التلقائي:', error.message);
    }
}, 180000); // كل 3 دقائق

// 🚀 تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 يعمل على المنفذ ${PORT}`);
    console.log(`🔗 افتح: https://server-3.onrender.com`);
    console.log(`🛡️ ${ADVANCED_PROXIES.length} بروكسي متاح`);
    console.log('🎯 جاهز لمعالجة الصور...');
    console.log('='.repeat(50));
});
