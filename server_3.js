const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// ==================== متغيرات البيئة ====================
const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = "KXPNxnGZDA1BGnzs4kZIA45o6Vr9P5nJ3Z01X4bt"; // يجب أن يكون هذا سراً
const DATABASE_URL = "https://hackerdz-b1bdf.firebaseio.com";

// ==================== إعدادات النظام ====================
const SYSTEM_CONFIG = {
    USE_DIRECT_LINKS: true,
    MAX_IMAGES_PER_CHAPTER: 100,
    DELAY_BETWEEN_IMAGES: 1000,
    DELAY_BETWEEN_CHAPTERS: 2000,
    DELAY_BETWEEN_GROUPS: 3000,
    MAX_FETCH_RETRIES: 3,
    MAX_CHAPTERS_PER_CYCLE: 10
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

// ==================== دوال المساعدة ====================
function getRandomHeaders() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    
    return {
        'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
        // **التعديل 1: إضافة Referer لتقليل الحظر**
        'Referer': 'https://azoramoon.com/', 
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    };
}

async function fetchWithRetry(url, maxRetries = SYSTEM_CONFIG.MAX_FETCH_RETRIES) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get(url, {
                headers: getRandomHeaders(),
                timeout: 20000,
                responseType: 'text'
            });
            
            if (response.status === 200) {
                return response.data;
            }
            
        } catch (error) {
            if (i === maxRetries - 1) {
                throw new Error(`فشلت جميع محاولات الجلب: ${error.message}`);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
    }
    
    throw new Error(`فشلت ${maxRetries} محاولات لجلب الصفحة`);
}

function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    
    let cleanUrl = url
        .replace(/[\t\n\r\s]+/g, '')
        .trim()
        .replace(/^\/\//, 'https://');
    
    // **التعديل 2: التأكد من إضافة النطاق الأساسي إذا كان الرابط نسبياً**
    if (cleanUrl.startsWith('/') && !cleanUrl.startsWith('//')) {
        cleanUrl = `https://azoramoon.com${cleanUrl}`;
    }
    
    return cleanUrl;
}

function extractImages(html) {
    const $ = cheerio.load(html);
    const images = [];
    
    const imageSelectors = [
        '.wp-manga-chapter-img',
        '.reading-content img',
        '.chapter-content img',
        '.text-center img',
        'img[src*="manga"]',
        'img[data-src]'
    ];
    
    for (const selector of imageSelectors) {
        $(selector).each((i, element) => {
            const $el = $(element);
            
            const rawUrl = $el.attr('src') || 
                          $el.attr('data-src') || 
                          $el.attr('data-lazy-src');
            
            if (rawUrl) {
                const cleanUrl = cleanImageUrl(rawUrl);
                
                if (cleanUrl && 
                   (cleanUrl.includes('.jpg') || 
                    cleanUrl.includes('.jpeg') || 
                    cleanUrl.includes('.png') || 
                    cleanUrl.includes('.webp'))) {
                    
                    const isDuplicate = images.some(img => img.originalUrl === cleanUrl);
                    
                    if (!isDuplicate && images.length < SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER) {
                        images.push({
                            order: images.length + 1,
                            originalUrl: cleanUrl,
                            selector: selector
                        });
                    }
                }
            }
        });
        
        if (images.length > 0) {
            console.log(`✅ وجد ${images.length} صورة باستخدام: ${selector}`);
            // **التعديل 3: التوقف بعد العثور على الصور لتجنب التكرار**
            break; 
        }
    }
    
    return images;
}

// ==================== معالجة الفصل ====================
async function processChapter(mangaId, chapterId, chapterGroup) {
    console.log(`\n🎯 بدء معالجة الفصل: ${mangaId}/${chapterId} (${chapterGroup})`);
    
    try {
        const chapterPath = `${chapterGroup}/${mangaId}/chapters/${chapterId}`;
        let chapterData = await readFromFirebase(chapterPath);
        
        if (!chapterData) {
            throw new Error(`الفصل غير موجود في ${chapterPath}`);
        }
        
        console.log(`📖 الفصل: ${chapterData.title || chapterId}`);
        console.log(`🔗 الرابط: ${chapterData.url}`);
        
        if (chapterData.status === 'completed' || chapterData.status === 'processing') {
            console.log(`⏭️  الفصل مكتمل أو قيد المعالجة بالفعل`);
            return {
                success: true,
                skipped: true,
                status: chapterData.status
            };
        }
        
        // **التعديل 4: تحديث الحالة إلى قيد المعالجة**
        await writeToFirebase(chapterPath, {
            ...chapterData,
            status: 'processing',
            processingStarted: Date.now(),
            lastUpdated: Date.now()
        });
        
        const html = await fetchWithRetry(chapterData.url);
        const extractedImages = extractImages(html);
        
        if (extractedImages.length === 0) {
            throw new Error('لم يتم العثور على أي صور في الفصل');
        }
        
        console.log(`📊 تم العثور على ${extractedImages.length} صورة`);
        
        const imageData = extractedImages.map(img => ({
            order: img.order,
            url: img.originalUrl,
            status: 'direct_link',
            fetchedAt: Date.now()
        }));
        
        const updatedChapterData = {
            ...chapterData,
            images: imageData,
            totalImages: imageData.length,
            status: 'completed',
            completedAt: Date.now(),
            lastUpdated: Date.now(),
            processingTime: Date.now() - (chapterData.processingStarted || Date.now())
        };
        
        await writeToFirebase(chapterPath, updatedChapterData);
        
        await updateImageStats(mangaId, chapterId, imageData.length);
        
        console.log(`✅ تم معالجة الفصل بنجاح`);
        console.log(`📊 الصور: ${imageData.length} صورة مباشرة`);
        
        return {
            success: true,
            chapterId: chapterId,
            mangaId: mangaId,
            group: chapterGroup,
            totalImages: imageData.length,
            status: 'completed'
        };
        
    } catch (error) {
        console.error(`❌ خطأ في معالجة الفصل ${chapterId}:`, error.message);
        
        try {
            const chapterPath = `${chapterGroup}/${mangaId}/chapters/${chapterId}`;
            const chapterData = await readFromFirebase(chapterPath);
            
            if (chapterData) {
                await writeToFirebase(chapterPath, {
                    ...chapterData,
                    status: 'error',
                    error: error.message,
                    lastUpdated: Date.now()
                });
            }
        } catch (e) {
            console.error('❌ فشل تحديث حالة الخطأ:', e.message);
        }
        
        return {
            success: false,
            error: error.message,
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
        console.error('❌ فشل تحديث إحصائيات الصور:', error.message);
    }
}

// ==================== محرك الفحص المستمر ====================
async function continuousChapterCheck() {
    console.log('\n🔍 بدء الفحص المستمر للفصول...');
    
    while (true) {
        try {
            let processedCount = 0;
            let totalImages = 0;
            
            console.log('\n📊 بدء دورة فحص جديدة للفصول...');
            
            const chapterStats = await readFromFirebase('System/chapter_stats') || {};
            const maxGroup = chapterStats.currentGroup || 1;
            
            console.log(`📁 عدد مجموعات الفصول: ${maxGroup}`);
            
            for (let groupNum = 1; groupNum <= maxGroup; groupNum++) {
                const groupName = `ImgChapter_${groupNum}`;
                
                try {
                    console.log(`\n📁 فحص مجموعة الفصول: ${groupName}`);
                    
                    const groupData = await readFromFirebase(groupName);
                    
                    if (!groupData || typeof groupData !== 'object') {
                        console.log(`   ⏭️  المجموعة فارغة أو غير موجودة`);
                        continue;
                    }
                    
                    let groupChapters = 0;
                    let groupProcessed = 0;
                    
                    for (const mangaId in groupData) {
                        const mangaData = groupData[mangaId];
                        
                        if (mangaData && mangaData.chapters) {
                            const chapters = mangaData.chapters;
                            groupChapters += Object.keys(chapters).length;
                            
                            for (const chapterId in chapters) {
                                const chapter = chapters[chapterId];
                                
                                if (chapter && chapter.status === 'pending_images') {
                                    console.log(`\n🎯 معالجة الفصل: ${mangaId}/${chapterId}`);
                                    console.log(`   📊 الحالة: ${chapter.status}`);
                                    
                                    try {
                                        const result = await processChapter(mangaId, chapterId, groupName);
                                        
                                        if (result.success && !result.skipped) {
                                            processedCount++;
                                            groupProcessed++;
                                            totalImages += result.totalImages || 0;
                                            
                                            console.log(`   ✅ تمت المعالجة: ${result.totalImages || 0} صورة`);
                                        } else if (result.skipped) {
                                            console.log(`   ⏭️  تم تخطي الفصل (${result.status})`);
                                        }
                                        
                                    } catch (error) {
                                        console.error(`   ❌ خطأ في المعالجة: ${error.message}`);
                                    }
                                    
                                    await new Promise(resolve => setTimeout(resolve, SYSTEM_CONFIG.DELAY_BETWEEN_CHAPTERS));
                                    
                                    if (processedCount >= SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE) {
                                        console.log(`\n⏸️  وصلت للحد الأقصى (${SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE}) في هذه الدورة`);
                                        break;
                                    }
                                }
                            }
                            
                            if (processedCount >= SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE) {
                                break;
                            }
                        }
                    }
                    
                    console.log(`   📊 المجموعة ${groupName}: ${groupProcessed}/${groupChapters} فصل معالج`);
                    
                    await new Promise(resolve => setTimeout(resolve, SYSTEM_CONFIG.DELAY_BETWEEN_GROUPS));
                    
                    if (processedCount >= SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE) {
                        break;
                    }
                    
                } catch (groupError) {
                    console.error(`   ❌ خطأ في المجموعة ${groupName}:`, groupError.message);
                }
            }
            
            console.log(`\n📊 دورة الفحص اكتملت:`);
            console.log(`   • فصول معالجة: ${processedCount}`);
            console.log(`   • صور محفوظة: ${totalImages}`);
            
            const waitTime = processedCount > 0 ? 180000 : 300000;
            console.log(`⏳ الانتظار ${waitTime / 1000} ثانية للدورة التالية...\n`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
        } catch (error) {
            console.error('❌ خطأ في محرك فحص الفصول:', error.message);
            await new Promise(resolve => setTimeout(resolve, 60000));
        }
    }
}
/*
async function continuousChapterCheck() {
    // ... (تمت إزالة الكود)
}
*/
/*
async function continuousChapterCheck() {
    // ... (تمت إزالة الكود)
}
*/

// ==================== واجهات API ====================
const app = express();

// **التعديل 6: تعديل واجهة API لاستقبال الطلب من البوت 2**
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
        
        // **التعديل 7: تشغيل العملية في الخلفية لتجنب انتهاء مهلة الطلب**
        processChapter(mangaId, chapterId, group)
            .then(result => console.log(`[خلفية] معالجة الفصل ${chapterId} اكتملت:`, result))
            .catch(error => console.error(`[خلفية] خطأ في معالجة الفصل ${chapterId}:`, error.message));
        
        res.json({ 
            success: true, 
            message: 'بدأت معالجة الصور في الخلفية',
            mangaId: mangaId,
            chapterId: chapterId,
            group: group
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// **التعديل 8: إزالة واجهة API /force-process/:groupNum غير الضرورية**
// app.get('/force-process/:groupNum', async (req, res) => { ... });

app.get('/stats', async (req, res) => {
    try {
        const imageStats = await readFromFirebase('System/image_stats') || {};
        
        res.json({
            success: true,
            system: SYSTEM_CONFIG,
            imageStats: imageStats,
            features: {
                directLinks: SYSTEM_CONFIG.USE_DIRECT_LINKS ? 'مفعل' : 'معطل',
                maxImagesPerChapter: SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER,
                delayBetweenImages: `${SYSTEM_CONFIG.DELAY_BETWEEN_IMAGES}ms`
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// **التعديل 9: إزالة واجهة API /test-image/:url(*) غير الضرورية**
// app.get('/test-image/:url(*)', async (req, res) => { ... });

app.get('/', (req, res) => {
    res.send(`
        <h1>🖼️ البوت 3 - معالج الصور</h1>
        <p><strong>الحالة:</strong> 🟢 يعمل (مستمع للبوت 2 + فحص مستمر)</p>
        <p><strong>ImgBB:</strong> ❌ معطل</p>
        <p><strong>الروابط المباشرة:</strong> ✅ مفعل</p>
        <p><strong>الصور/الفصل:</strong> ${SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER}</p>
        <p><strong>الحد/دورة:</strong> ${SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE} فصل</p>
        
        <h3>الروابط:</h3>
        <p><a href="/stats">/stats</a> - إحصائيات الصور</p>
        
        <h3>ملاحظات:</h3>
        <p>• يستخدم الروابط المباشرة فقط (بدون ImgBB)</p>
        <p>• يعالج الفصول ذات الحالة 'pending_images'</p>
        <p>• يحفظ الروابط الأصلية كما هي</p>
    `);
});

app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 يعمل على المنفذ ${PORT}`);
    console.log(`📊 نظام الصور:`);
    console.log(`   • ImgBB: ❌ معطل`);
    console.log(`   • الروابط المباشرة: ✅ مفعل`);
    console.log(`   • صور/فصل: ${SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER}`);
    console.log(`   • الحد/دورة: ${SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE} فصل`);
    
    setTimeout(() => {
        // **التعديل 10: إعادة تفعيل بدء الفحص المستمر كخيار احتياطي**
        continuousChapterCheck();
        console.log('✅ تم تفعيل الفحص المستمر كخيار احتياطي.');
    }, 5000);
});
