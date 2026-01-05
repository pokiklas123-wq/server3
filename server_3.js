const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// 🔧 إصلاح: التأكد من صيغة الرابط
const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

console.log('⚙️ إعدادات البوت 3:');
console.log(`📡 Firebase: ${FIXED_DB_URL ? '✅' : '❌'}`);
console.log(`🔑 Secrets: ${DATABASE_SECRETS ? '✅' : '❌'}`);
console.log(`🖼️ ImgBB: ${IMGBB_API_KEY ? '✅' : '❌'}`);

// دالة للقراءة من Firebase
async function readFromFirebase(path) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.log('⚠️ Firebase غير مهيء');
        return null;
    }
    
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        console.log(`📖 قراءة: ${path}`);
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
    } catch (error) {
        console.error(`❌ خطأ في قراءة ${path}:`, error.message);
        return null;
    }
}

// دالة للكتابة إلى Firebase
async function writeToFirebase(path, data) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.log('⚠️ Firebase غير مهيء');
        return null;
    }
    
    const url = `${FIXED_DB_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        const response = await axios.put(url, data, { timeout: 10000 });
        console.log(`✅ تم الكتابة إلى ${path}`);
        return response.data;
    } catch (error) {
        console.error(`❌ خطأ في الكتابة إلى ${path}:`, error.message);
        throw error;
    }
}

// دالة لرفع صورة إلى imgbb
async function uploadToImgBB(imageUrl) {
    if (!IMGBB_API_KEY) {
        console.log('⚠️ IMGBB_API_KEY غير موجود، استخدام الرابط الأصلي');
        return { 
            success: true, 
            url: imageUrl,
            warning: 'لم يتم الرفع (مفتاح مفقود)' 
        };
    }
    
    try {
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', imageUrl);
        
        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            timeout: 30000
        });
        
        if (response.data.success) {
            return {
                success: true,
                url: response.data.data.url,
                deleteUrl: response.data.data.delete_url
            };
        } else {
            throw new Error(response.data.error?.message || 'فشل رفع الصورة');
        }
        
    } catch (error) {
        console.error('❌ خطأ في رفع الصورة:', error.message);
        return {
            success: false,
            url: imageUrl,
            error: error.message
        };
    }
}

// دالة لجلب صور الفصل
async function scrapeChapterImages(chapterUrl) {
    try {
        console.log(`📥 جلب الصور من: ${chapterUrl}`);
        
        const response = await axios.get(chapterUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://azoramoon.com/'
            },
            timeout: 60000
        });
        
        const $ = cheerio.load(response.data);
        
        const images = [];
        
        // 🔍 البحث بجميع الطرق الممكنة
        const imageSelectors = [
            '.wp-manga-chapter-img',
            '.reading-content img',
            '.chapter-content img',
            '.page-break img',
            '.text-center img',
            'img[src*="data"]',
            'img[src*="chapter"]'
        ];
        
        for (const selector of imageSelectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                console.log(`✅ وجد ${elements.length} صورة بـ "${selector}"`);
                
                elements.each((i, element) => {
                    const imgUrl = $(element).attr('src');
                    const dataSrc = $(element).attr('data-src');
                    const dataLazy = $(element).attr('data-lazy-src');
                    
                    const finalUrl = imgUrl || dataSrc || dataLazy;
                    
                    if (finalUrl) {
                        images.push({
                            order: images.length,
                            originalUrl: finalUrl,
                            status: 'pending',
                            selector: selector
                        });
                    }
                });
                
                break;
            }
        }
        
        if (images.length === 0) {
            console.log('⚠️ لم أعثر على صور، جرب جميع العناصر img');
            $('img').each((i, element) => {
                const imgUrl = $(element).attr('src');
                if (imgUrl && imgUrl.includes('data') && imgUrl.includes('.jpg')) {
                    images.push({
                        order: images.length,
                        originalUrl: imgUrl,
                        status: 'pending',
                        selector: 'img (عام)'
                    });
                }
            });
        }
        
        console.log(`📊 تم العثور على ${images.length} صورة`);
        
        // حفظ عينة من الروابط للتحقق
        if (images.length > 0) {
            console.log('🔗 عينة من روابط الصور:');
            images.slice(0, 3).forEach((img, i) => {
                console.log(`  ${i+1}. ${img.originalUrl.substring(0, 80)}...`);
            });
        }
        
        return images;
        
    } catch (error) {
        console.error('❌ خطأ في جلب الصور:', error.message);
        console.error('📡 تفاصيل الخطأ:', error.response?.status, error.code);
        return [];
    }
}

// 🔍 دالة محسنة للبحث عن فصل
async function findPendingChapter() {
    try {
        console.log('\n🔍 البحث عن فصل يحتاج معالجة...');
        
        // قراءة جميع الفصول من Firebase
        const allChapters = await readFromFirebase('ImgChapter');
        
        if (!allChapters) {
            console.log('ℹ️ لا توجد فصول في Firebase');
            return null;
        }
        
        console.log(`📚 عدد المانجا في Firebase: ${Object.keys(allChapters).length}`);
        
        let totalChapters = 0;
        let pendingChapters = 0;
        
        // البحث في جميع المانجا
        for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
            if (!mangaChapters) continue;
            
            console.log(`📖 المانجا ${mangaId}: ${Object.keys(mangaChapters).length} فصل`);
            totalChapters += Object.keys(mangaChapters).length;
            
            // البحث في فصول هذه المانجا
            for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                if (chapterData && chapterData.status === 'pending_images') {
                    pendingChapters++;
                    console.log(`🎯 وجد فصل قيد الانتظار: ${mangaId}/${chapterId}`);
                    
                    return {
                        mangaId,
                        chapterId,
                        chapterData,
                        fullPath: `ImgChapter/${mangaId}/${chapterId}`
                    };
                }
            }
        }
        
        console.log(`📊 الإحصاء: ${totalChapters} فصل إجمالي، ${pendingChapters} فصل قيد الانتظار`);
        
        if (pendingChapters === 0) {
            console.log('ℹ️ جميع الفصول تمت معالجتها أو لا توجد فصول قيد الانتظار');
            
            // التحقق من أول فصل لأي حالة
            for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
                if (mangaChapters && Object.keys(mangaChapters).length > 0) {
                    const firstChapterId = Object.keys(mangaChapters)[0];
                    const firstChapter = mangaChapters[firstChapterId];
                    
                    console.log(`🔍 فحص أول فصل: ${mangaId}/${firstChapterId}`);
                    console.log(`📝 حالة الفصل: ${firstChapter.status || 'غير معروف'}`);
                    console.log(`🔗 رابط الفصل: ${firstChapter.url || firstChapter.test || 'لا يوجد رابط'}`);
                    
                    if (firstChapter.status === 'pending_images') {
                        return {
                            mangaId,
                            chapterId: firstChapterId,
                            chapterData: firstChapter,
                            fullPath: `ImgChapter/${mangaId}/${firstChapterId}`
                        };
                    }
                    break;
                }
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ خطأ في البحث عن فصل:', error.message);
        return null;
    }
}

// دالة لمعالجة فصل واحد
async function processChapter(mangaId, chapterId, chapterData) {
    try {
        const chapterPath = `ImgChapter/${mangaId}/${chapterId}`;
        
        console.log(`\n🎯 معالجة الفصل: ${chapterId}`);
        console.log(`📖 المانجا: ${mangaId}`);
        console.log(`🔗 الرابط: ${chapterData.url || chapterData.test || 'لا يوجد رابط'}`);
        console.log(`📝 الحالة الحالية: ${chapterData.status || 'غير معروف'}`);
        
        // التحقق من وجود رابط
        const chapterUrl = chapterData.url || chapterData.test;
        if (!chapterUrl) {
            console.log('❌ لا يوجد رابط للفصل');
            
            await writeToFirebase(chapterPath, {
                ...chapterData,
                status: 'failed',
                error: 'لا يوجد رابط للفصل',
                completedAt: Date.now()
            });
            
            return { success: false, error: 'لا يوجد رابط للفصل' };
        }
        
        // تحديث الحالة
        await writeToFirebase(chapterPath, {
            ...chapterData,
            status: 'processing_images',
            startedAt: Date.now(),
            processedAt: Date.now()
        });
        
        console.log(`📥 بدء تنزيل الصور...`);
        
        // جلب الصور
        const images = await scrapeChapterImages(chapterUrl);
        
        if (images.length === 0) {
            console.log('❌ لم يتم العثور على أي صور');
            
            await writeToFirebase(chapterPath, {
                ...chapterData,
                status: 'failed',
                error: 'لم يتم العثور على صور',
                completedAt: Date.now()
            });
            
            return { success: false, error: 'لم يتم العثور على صور' };
        }
        
        console.log(`🖼️ بدء رفع ${images.length} صورة إلى ImgBB...`);
        
        // رفع كل صورة
        const uploadedImages = [];
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            
            console.log(`⏳ رفع الصورة ${i + 1}/${images.length}...`);
            
            try {
                const uploadResult = await uploadToImgBB(image.originalUrl);
                
                if (uploadResult.success) {
                    uploadedImages.push({
                        order: image.order,
                        originalUrl: image.originalUrl,
                        uploadedUrl: uploadResult.url,
                        deleteUrl: uploadResult.deleteUrl,
                        status: 'uploaded',
                        uploadedAt: Date.now(),
                        success: true
                    });
                    
                    successCount++;
                    console.log(`✅ تم رفع الصورة ${i + 1}: ${uploadResult.url.substring(0, 60)}...`);
                } else {
                    uploadedImages.push({
                        order: image.order,
                        originalUrl: image.originalUrl,
                        uploadedUrl: image.originalUrl,
                        status: 'failed',
                        error: uploadResult.error,
                        uploadedAt: Date.now(),
                        success: false
                    });
                    
                    failCount++;
                    console.log(`❌ فشل رفع الصورة ${i + 1}: ${uploadResult.error}`);
                }
                
                // تأخير بين الصور لتجنب حظر ImgBB
                if (i < images.length - 1) {
                    const delay = 1500 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
            } catch (error) {
                console.error(`💥 خطأ غير متوقع في الصورة ${i + 1}:`, error.message);
                
                uploadedImages.push({
                    order: image.order,
                    originalUrl: image.originalUrl,
                    uploadedUrl: image.originalUrl,
                    status: 'error',
                    error: error.message,
                    uploadedAt: Date.now(),
                    success: false
                });
                
                failCount++;
            }
        }
        
        // ترتيب الصور حسب الترتيب
        uploadedImages.sort((a, b) => a.order - b.order);
        
        console.log(`📊 نتيجة الرفع: ${successCount} ناجح، ${failCount} فاشل`);
        
        // تحديث الفصل بالصور
        await writeToFirebase(chapterPath, {
            ...chapterData,
            images: uploadedImages,
            status: successCount > 0 ? 'completed' : 'partially_failed',
            imagesCount: uploadedImages.length,
            successCount: successCount,
            failCount: failCount,
            completedAt: Date.now(),
            test: null // حذف الحقل المؤقت
        });
        
        console.log(`✅ تم معالجة الفصل ${chapterId} بنجاح`);
        
        return { 
            success: true, 
            imagesCount: uploadedImages.length,
            successCount: successCount,
            failCount: failCount,
            mangaId: mangaId,
            chapterId: chapterId
        };
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الفصل:', error.message);
        console.error('🔧 تفاصيل الخطأ:', error.stack);
        
        return { 
            success: false, 
            error: error.message,
            mangaId: mangaId,
            chapterId: chapterId
        };
    }
}

// API لمعالجة الفصل التالي
app.get('/process-next-chapter', async (req, res) => {
    try {
        console.log('\n🚀 طلب معالجة الفصل التالي...');
        
        // البحث عن فصل
        const chapterData = await findPendingChapter();
        
        if (!chapterData) {
            return res.json({ 
                success: false, 
                message: 'لا توجد فصول تحتاج معالجة',
                suggestion: 'تحقق من أن البوت 2 قام بإنشاء الفصول في Firebase'
            });
        }
        
        // معالجة الفصل
        const result = await processChapter(
            chapterData.mangaId,
            chapterData.chapterId,
            chapterData.chapterData
        );
        
        if (result.success) {
            res.json({
                success: true,
                message: `تم معالجة الفصل ${chapterData.chapterId}`,
                mangaId: chapterData.mangaId,
                chapterId: chapterData.chapterId,
                imagesCount: result.imagesCount,
                successCount: result.successCount,
                failCount: result.failCount
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
                mangaId: chapterData.mangaId,
                chapterId: chapterData.chapterId
            });
        }
        
    } catch (error) {
        console.error('❌ خطأ في /process-next-chapter:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API لرؤية جميع الفصول
app.get('/chapters', async (req, res) => {
    try {
        const allChapters = await readFromFirebase('ImgChapter');
        
        if (!allChapters) {
            return res.json({
                success: false,
                message: 'لا توجد فصول في Firebase'
            });
        }
        
        const chaptersList = [];
        let totalChapters = 0;
        let pendingCount = 0;
        let completedCount = 0;
        
        // تحليل جميع الفصول
        for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
            if (!mangaChapters) continue;
            
            for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                totalChapters++;
                
                if (chapterData.status === 'pending_images') pendingCount++;
                if (chapterData.status === 'completed') completedCount++;
                
                chaptersList.push({
                    mangaId,
                    chapterId,
                    status: chapterData.status || 'unknown',
                    title: chapterData.title || 'بدون عنوان',
                    url: chapterData.url || chapterData.test || 'لا يوجد',
                    imagesCount: chapterData.images?.length || 0,
                    chapterNumber: chapterData.chapterNumber || 0
                });
            }
        }
        
        res.json({
            success: true,
            stats: {
                totalManga: Object.keys(allChapters).length,
                totalChapters: totalChapters,
                pending: pendingCount,
                completed: completedCount,
                other: totalChapters - pendingCount - completedCount
            },
            chapters: chaptersList.slice(0, 20), // أول 20 فقط
            totalFound: chaptersList.length
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// اختبار ImgBB
app.get('/test-imgbb', async (req, res) => {
    if (!IMGBB_API_KEY) {
        return res.json({
            success: false,
            message: 'IMGBB_API_KEY غير موجود'
        });
    }
    
    try {
        const testImage = 'https://via.placeholder.com/150';
        const result = await uploadToImgBB(testImage);
        
        res.json({
            success: result.success,
            result: result
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// صفحة رئيسية
app.get('/', (req, res) => {
    res.send(`
        <h1>🖼️ البوت 3 - معالج الصور</h1>
        
        <h2>🔗 الروابط:</h2>
        <ul>
            <li><a href="/process-next-chapter">/process-next-chapter</a> - معالجة الفصل التالي</li>
            <li><a href="/chapters">/chapters</a> - رؤية جميع الفصول</li>
            <li><a href="/test-imgbb">/test-imgbb</a> - اختبار ImgBB</li>
        </ul>
        
        <h2>⚙️ الإعدادات:</h2>
        <ul>
            <li>Firebase: ${DATABASE_SECRETS ? '✅' : '❌'}</li>
            <li>ImgBB: ${IMGBB_API_KEY ? '✅' : '❌'}</li>
            <li>Port: ${PORT}</li>
        </ul>
        
        <h2>🎯 المهام:</h2>
        <ul>
            <li>تنزيل صور الفصول من azoramoon.com</li>
            <li>رفع الصور إلى ImgBB</li>
            <li>حفظ الروابط في Firebase</li>
        </ul>
    `);
});

// معالجة تلقائية
setInterval(async () => {
    console.log('\n⏰ فحص تلقائي...');
    const chapter = await findPendingChapter();
    if (chapter) {
        console.log(`🔍 وجد فصل: ${chapter.chapterId}`);
    }
}, 45000);

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 يعمل على المنفذ ${PORT}`);
    console.log(`🔗 افتح: https://server-3.onrender.com`);
    console.log(`📡 جاهز لمعالجة الفصول...`);
});
