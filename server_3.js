const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// ==================== متغيرات البيئة ====================
const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = process.env.DATABASE_SECRETS || "KXPNxnGZDA1BGnzs4kZIA45o6Vr9P5nJ3Z01X4bt";
const DATABASE_URL = process.env.DATABASE_URL || "https://hackerdz-b1bdf.firebaseio.com";

// ==================== إعدادات النظام ====================
const SYSTEM_CONFIG = {
    USE_IMGBB: false,                    // إلغاء ImgBB نهائياً
    USE_DIRECT_LINKS: true,              // استخدام الروابط المباشرة فقط
    MAX_IMAGES_PER_CHAPTER: 100,         // 100 صورة كحد أقصى لكل فصل
    DELAY_BETWEEN_IMAGES: 1000,          // 1 ثانية بين الصور
    MAX_FETCH_RETRIES: 3,                // 3 محاولات للجلب
    IMAGE_QUALITY: 'original',           // الجودة الأصلية
    CACHE_IMAGES: false                  // لا تخزين مؤقت
};

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
            return null;
        }
        console.error(`❌ فشل القراءة من Firebase في ${path}:`, error.message);
        throw error;
    }
}

// ==================== دوال استخراج الصور ====================
function getRandomHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        'Referer': 'https://azoramoon.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
    };
}

async function fetchWithRetry(url, maxRetries = SYSTEM_CONFIG.MAX_FETCH_RETRIES) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get(url, {
                headers: getRandomHeaders(),
                timeout: 20000,
                responseType: 'text',
                validateStatus: (status) => status >= 200 && status < 500
            });
            
            if (response.status === 200) {
                return response.data;
            }
            
            console.log(`⚠️ محاولة ${i + 1}: استجابة ${response.status}`);
            
        } catch (error) {
            console.log(`⚠️ محاولة ${i + 1} فشلت: ${error.message}`);
            
            if (i === maxRetries - 1) {
                throw new Error(`فشلت جميع محاولات الجلب: ${error.message}`);
            }
        }
        
        // انتظار متزايد بين المحاولات
        await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
    }
    
    throw new Error(`فشلت ${maxRetries} محاولات لجلب الصفحة`);
}

function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    
    // تنظيف الرابط
    let cleanUrl = url
        .replace(/[\t\n\r\s]+/g, '')
        .trim()
        .replace(/^\/\//, 'https://');
    
    // إصلاح الروابط النسبية
    if (cleanUrl.startsWith('/')) {
        cleanUrl = `https://azoramoon.com${cleanUrl}`;
    }
    
    return cleanUrl;
}

function extractImages(html) {
    const $ = cheerio.load(html);
    const images = [];
    
    // محاولة الاستخراج من العناصر الشائعة
    const imageSelectors = [
        '.wp-manga-chapter-img',
        '.reading-content img',
        '.chapter-content img',
        '.text-center img',
        'img[src*="manga"]',
        'img[data-src]',
        'img[src]'
    ];
    
    for (const selector of imageSelectors) {
        $(selector).each((i, element) => {
            const $el = $(element);
            
            // محاولة الحصول على الرابط من عدة سمات
            const rawUrl = $el.attr('src') || 
                          $el.attr('data-src') || 
                          $el.attr('data-lazy-src') || 
                          $el.attr('data-url');
            
            if (rawUrl) {
                const cleanUrl = cleanImageUrl(rawUrl);
                
                // التحقق من أن الرابط هو صورة
                if (cleanUrl && 
                   (cleanUrl.includes('.jpg') || 
                    cleanUrl.includes('.jpeg') || 
                    cleanUrl.includes('.png') || 
                    cleanUrl.includes('.webp') || 
                    cleanUrl.includes('.gif'))) {
                    
                    // تجنب الصور المكررة
                    const isDuplicate = images.some(img => img.originalUrl === cleanUrl);
                    
                    if (!isDuplicate && images.length < SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER) {
                        images.push({
                            order: images.length + 1,
                            originalUrl: cleanUrl,
                            selector: selector,
                            index: i
                        });
                    }
                }
            }
        });
        
        // إذا وجدنا صوراً، نتوقف
        if (images.length > 0) {
            break;
        }
    }
    
    return images;
}

// ==================== معالجة الفصل ====================
async function processChapter(mangaId, chapterId, chapterGroup) {
    console.log(`\n🎯 بدء معالجة الفصل: ${mangaId}/${chapterId} (${chapterGroup})`);
    
    try {
        // جلب بيانات الفصل
        const chapterPath = `${chapterGroup}/${mangaId}/chapters/${chapterId}`;
        const chapterData = await readFromFirebase(chapterPath);
        
        if (!chapterData) {
            throw new Error(`الفصل غير موجود في ${chapterPath}`);
        }
        
        console.log(`📖 الفصل: ${chapterData.title || chapterId}`);
        console.log(`🔗 الرابط: ${chapterData.url}`);
        console.log(`📁 المجموعة: ${chapterGroup}`);
        
        // تحديث الحالة إلى معالجة
        await writeToFirebase(chapterPath, {
            ...chapterData,
            status: 'processing',
            processingStarted: Date.now(),
            lastUpdated: Date.now()
        });
        
        // جلب صفحة الفصل
        const html = await fetchWithRetry(chapterData.url);
        
        // استخراج الصور
        const extractedImages = extractImages(html);
        
        if (extractedImages.length === 0) {
            throw new Error('لم يتم العثور على أي صور في الفصل');
        }
        
        console.log(`📊 تم العثور على ${extractedImages.length} صورة`);
        
        // حفظ الروابط المباشرة فقط (بدون ImgBB)
        const imageData = extractedImages.map(img => ({
            order: img.order,
            url: img.originalUrl,
            status: 'direct_link',
            fetchedAt: Date.now()
        }));
        
        // تحديث بيانات الفصل بالصور
        const updatedChapterData = {
            ...chapterData,
            images: imageData,
            totalImages: imageData.length,
            status: 'completed',
            completedAt: Date.now(),
            lastUpdated: Date.now(),
            chapterGroup: chapterGroup,
            processingTime: Date.now() - (chapterData.processingStarted || Date.now())
        };
        
        await writeToFirebase(chapterPath, updatedChapterData);
        
        // تحديث الإحصائيات
        await updateImageStats(mangaId, chapterId, imageData.length);
        
        console.log(`✅ تم معالجة الفصل بنجاح`);
        console.log(`📊 الصور: ${imageData.length} صورة مباشرة`);
        
        return {
            success: true,
            chapterId: chapterId,
            mangaId: mangaId,
            group: chapterGroup,
            totalImages: imageData.length,
            images: imageData,
            status: 'completed'
        };
        
    } catch (error) {
        console.error(`❌ خطأ في معالجة الفصل ${chapterId}:`, error.message);
        
        // تحديث حالة الخطأ
        try {
            const chapterPath = `${chapterGroup}/${mangaId}/chapters/${chapterId}`;
            const chapterData = await readFromFirebase(chapterPath);
            
            if (chapterData) {
                await writeToFirebase(chapterPath, {
                    ...chapterData,
                    status: 'error',
                    error: error.message,
                    errorAt: Date.now(),
                    lastUpdated: Date.now()
                });
            }
        } catch (e) {
            console.error('❌ فشل تحديث حالة الخطأ:', e.message);
        }
        
        return {
            success: false,
            error: error.message,
            chapterId: chapterId,
            mangaId: mangaId,
            group: chapterGroup,
            status: 'error'
        };
    }
}

async function updateImageStats(mangaId, chapterId, imageCount) {
    try {
        const statsPath = `System/image_stats`;
        const currentStats = await readFromFirebase(statsPath) || {
            totalImages: 0,
            totalChapters: 0,
            lastUpdate: Date.now()
        };
        
        await writeToFirebase(statsPath, {
            totalImages: (currentStats.totalImages || 0) + imageCount,
            totalChapters: (currentStats.totalChapters || 0) + 1,
            lastUpdate: Date.now()
        });
    } catch (error) {
        console.error('❌ فشل تحديث الإحصائيات:', error.message);
    }
}

// ==================== محرك الفحص المستمر ====================
async function continuousChapterCheck() {
    console.log('\n🔍 بدء الفحص المستمر للفصول...');
    
    while (true) {
        try {
            let processedCount = 0;
            
            // فحص جميع مجموعات الفصول
            const stats = await readFromFirebase('System/chapter_stats') || {};
            const maxGroup = stats.currentGroup || 1;
            
            for (let groupNum = 1; groupNum <= maxGroup; groupNum++) {
                const groupName = `ImgChapter_${groupNum}`;
                console.log(`\n📁 فحص مجموعة الفصول: ${groupName}`);
                
                // جلب جميع المانجا في هذه المجموعة
                const groupData = await readFromFirebase(groupName);
                
                if (groupData && typeof groupData === 'object') {
                    for (const mangaId in groupData) {
                        const mangaData = groupData[mangaId];
                        
                        if (mangaData && mangaData.chapters) {
                            const chapters = mangaData.chapters;
                            
                            for (const chapterId in chapters) {
                                const chapter = chapters[chapterId];
                                
                                // معالجة الفصول التي تحتاج معالجة
                                if (chapter && 
                                    (chapter.status === 'pending_images' || 
                                     chapter.status === 'error')) {
                                    
                                    console.log(`\n🎯 معالجة الفصل: ${mangaId}/${chapterId}`);
                                    console.log(`📊 الحالة: ${chapter.status}`);
                                    
                                    await processChapter(mangaId, chapterId, groupName);
                                    processedCount++;
                                    
                                    // تأخير بين الفصول
                                    await new Promise(resolve => setTimeout(resolve, 2000));
                                }
                            }
                        }
                    }
                }
                
                // تأخير بين المجموعات
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            console.log(`\n📊 الفحص اكتمل. تم معالجة ${processedCount} فصل`);
            
            // وقت الانتظار حسب عدد الفصول المعالجة
            const waitTime = processedCount > 0 ? 120000 : 300000; // 2 دقيقة أو 5 دقائق
            console.log(`⏳ الانتظار ${waitTime / 1000} ثانية للفحص التالي...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
        } catch (error) {
            console.error('❌ خطأ في محرك الفحص المستمر:', error.message);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }
}

// ==================== واجهات API ====================
const app = express();

app.get('/process-chapter/:mangaId/:chapterId', async (req, res) => {
    const { mangaId, chapterId } = req.params;
    const { group } = req.query;
    
    try {
        if (!group) {
            return res.status(400).json({ 
                success: false, 
                message: 'يرجى تحديد مجموعة الفصول (?group=ImgChapter_X)' 
            });
        }
        
        // بدء المعالجة في الخلفية
        processChapter(mangaId, chapterId, group);
        
        res.json({ 
            success: true, 
            message: 'بدأت معالجة الصور',
            mangaId: mangaId,
            chapterId: chapterId,
            group: group,
            config: SYSTEM_CONFIG
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/stats', async (req, res) => {
    try {
        const imageStats = await readFromFirebase('System/image_stats') || {};
        
        res.json({
            success: true,
            system: SYSTEM_CONFIG,
            imageStats: imageStats,
            features: {
                imgbb: SYSTEM_CONFIG.USE_IMGBB ? 'مفعل' : 'معطل',
                directLinks: SYSTEM_CONFIG.USE_DIRECT_LINKS ? 'مفعل' : 'معطل',
                maxImagesPerChapter: SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/test/:url', async (req, res) => {
    const { url } = req.params;
    
    try {
        const decodedUrl = decodeURIComponent(url);
        console.log(`🔗 اختبار جلب: ${decodedUrl}`);
        
        const html = await fetchWithRetry(decodedUrl);
        const images = extractImages(html);
        
        res.json({
            success: true,
            url: decodedUrl,
            totalImages: images.length,
            images: images.slice(0, 5), // أول 5 صور فقط
            sample: images[0]
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.get('/', (req, res) => {
    res.send(`
        <h1>🖼️ البوت 3 - معالج الصور</h1>
        <p><strong>ImgBB:</strong> ${SYSTEM_CONFIG.USE_IMGBB ? 'مفعل' : 'معطل'}</p>
        <p><strong>الروابط المباشرة:</strong> ${SYSTEM_CONFIG.USE_DIRECT_LINKS ? 'مفعل' : 'معطل'}</p>
        <p><strong>الصور/الفصل:</strong> ${SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER}</p>
        <p><strong>التأخير بين الصور:</strong> ${SYSTEM_CONFIG.DELAY_BETWEEN_IMAGES}ms</p>
        
        <h3>الروابط:</h3>
        <p><a href="/stats">/stats</a> - إحصائيات الصور</p>
        
        <h3>ملاحظات:</h3>
        <p>• البوت يستخدم الروابط المباشرة فقط</p>
        <p>• لا يوجد رفع إلى ImgBB</p>
        <p>• الصور تحفظ كما هي من الموقع</p>
        <p>• السرعة أسرع بكثير</p>
    `);
});

app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 يعمل على المنفذ ${PORT}`);
    console.log(`📊 نظام الصور:`);
    console.log(`   • ImgBB: ${SYSTEM_CONFIG.USE_IMGBB ? 'مفعل' : 'معطل'}`);
    console.log(`   • الروابط المباشرة: ${SYSTEM_CONFIG.USE_DIRECT_LINKS ? 'مفعل' : 'معطل'}`);
    console.log(`   • صور/فصل: ${SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER}`);
    
    // بدء الفحص المستمر
    setTimeout(() => {
        continuousChapterCheck();
    }, 5000);
});
