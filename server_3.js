const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT_3 || 3003;

const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE_URL;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// رؤوس HTTP ثابتة
const FIXED_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Referer': 'https://azoramoon.com/',
    'Upgrade-Insecure-Requests': '1'
};

// Firebase Helper
class FirebaseHelper {
    constructor() {
        this.baseUrl = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;
        this.secret = DATABASE_SECRETS;
    }

    async read(path) {
        try {
            const url = `${this.baseUrl}${path}.json?auth=${this.secret}`;
            const response = await axios.get(url, { timeout: 10000 });
            return response.data;
        } catch (error) {
            console.log(`❌ خطأ في قراءة ${path}:`, error.message);
            return null;
        }
    }

    async write(path, data) {
        try {
            const url = `${this.baseUrl}${path}.json?auth=${this.secret}`;
            await axios.put(url, data, { 
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });
            return true;
        } catch (error) {
            console.log(`❌ خطأ في كتابة ${path}:`, error.message);
            return false;
        }
    }

    async update(path, updates) {
        try {
            const current = await this.read(path) || {};
            const updated = { ...current, ...updates };
            return await this.write(path, updated);
        } catch (error) {
            return false;
        }
    }
}

const db = new FirebaseHelper();

// نظام معالجة الصور
class ImageProcessor {
    constructor() {
        this.isProcessing = false;
        this.currentChapter = null;
        this.uploadedCount = 0;
    }

    async start() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        console.log('🚀 بدء معالجة الصور...');
        
        // بدء المعالجة التلقائية
        this.processImagesQueue();
    }

    async processImagesQueue() {
        while (this.isProcessing) {
            try {
                // البحث عن فصل يحتاج معالجة
                const chapter = await this.getNextChapter();
                
                if (chapter) {
                    console.log(`\n🎯 معالجة الفصل: ${chapter.title}`);
                    await this.processChapter(chapter);
                } else {
                    console.log('⏳ لا توجد فصول تحتاج معالجة، انتظار 30 ثانية...');
                    await this.delay(30000);
                }
                
            } catch (error) {
                console.error('❌ خطأ في المعالجة:', error.message);
                await this.delay(10000);
            }
        }
    }

    async getNextChapter() {
        const allChapters = await db.read('ImgChapter') || {};
        
        // البحث عن فصل بـ pending_images
        for (const [mangaId, mangaChapters] of Object.entries(allChapters)) {
            if (!mangaChapters) continue;
            
            for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
                if (chapterData && chapterData.status === 'pending_images') {
                    return {
                        mangaId,
                        chapterId,
                        ...chapterData
                    };
                }
            }
        }
        
        return null;
    }

    async processChapter(chapter) {
        this.currentChapter = chapter;
        
        // تحديث حالة الفصل
        await db.update(`ImgChapter/${chapter.mangaId}/${chapter.chapterId}`, {
            status: 'processing',
            processingStartedAt: Date.now()
        });
        
        try {
            // جلب الصور
            const images = await this.fetchChapterImages(chapter.url);
            
            if (images.length === 0) {
                throw new Error('لم يتم العثور على صور');
            }
            
            console.log(`🖼️ تم العثور على ${images.length} صورة`);
            
            // رفع الصور
            const uploadedImages = await this.uploadImages(images);
            
            // حفظ النتيجة
            await this.saveProcessedChapter(chapter, uploadedImages);
            
            console.log(`✅ تم معالجة الفصل ${chapter.title} بنجاح`);
            
        } catch (error) {
            console.error(`❌ فشل معالجة الفصل ${chapter.title}:`, error.message);
            
            await db.update(`ImgChapter/${chapter.mangaId}/${chapter.chapterId}`, {
                status: 'failed',
                error: error.message,
                failedAt: Date.now()
            });
        }
        
        this.currentChapter = null;
    }

    async fetchChapterImages(chapterUrl) {
        console.log(`📥 جلب الصور من: ${chapterUrl}`);
        
        const response = await axios.get(chapterUrl, {
            headers: FIXED_HEADERS,
            timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        const images = [];
        
        // استخراج الصور
        $('.wp-manga-chapter-img').each((i, element) => {
            const imgUrl = $(element).attr('src') || $(element).attr('data-src');
            
            if (imgUrl) {
                const cleanUrl = imgUrl.trim().replace(/[\t\n\r\s]+/g, '');
                
                images.push({
                    order: i,
                    originalUrl: cleanUrl,
                    chapterUrl: chapterUrl,
                    foundAt: Date.now()
                });
            }
        });
        
        // إذا لم نجد، نبحث في مناطق أخرى
        if (images.length === 0) {
            $('.reading-content img').each((i, element) => {
                const imgUrl = $(element).attr('src');
                if (imgUrl) {
                    const cleanUrl = imgUrl.trim().replace(/[\t\n\r\s]+/g, '');
                    
                    images.push({
                        order: i,
                        originalUrl: cleanUrl,
                        chapterUrl: chapterUrl,
                        foundAt: Date.now()
                    });
                }
            });
        }
        
        return images;
    }

    async uploadImages(images) {
        if (!IMGBB_API_KEY) {
            console.log('⚠️ IMGBB_API_KEY غير موجود، باستخدام الروابط الأصلية');
            return images.map(img => ({
                ...img,
                uploadedUrl: img.originalUrl,
                success: false,
                error: 'مفتاح ImgBB مفقود'
            }));
        }
        
        console.log(`📤 رفع ${images.length} صورة إلى ImgBB...`);
        
        const uploadedImages = [];
        
        for (const image of images.slice(0, 10)) { // 10 صور كحد أقصى للاختبار
            try {
                console.log(`   📤 رفع الصورة ${image.order + 1}/${images.length}`);
                
                const formData = new URLSearchParams();
                formData.append('key', IMGBB_API_KEY);
                formData.append('image', image.originalUrl);
                
                const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 30000
                });
                
                if (response.data.success) {
                    uploadedImages.push({
                        ...image,
                        uploadedUrl: response.data.data.url,
                        success: true,
                        uploadData: response.data.data,
                        uploadedAt: Date.now()
                    });
                    
                    this.uploadedCount++;
                    console.log(`   ✅ تم الرفع`);
                    
                } else {
                    uploadedImages.push({
                        ...image,
                        uploadedUrl: image.originalUrl,
                        success: false,
                        error: 'فشل رفع ImgBB'
                    });
                }
                
                // تأخير بين الصور
                await this.delay(2000);
                
            } catch (error) {
                console.log(`   ❌ فشل رفع الصورة:`, error.message);
                
                uploadedImages.push({
                    ...image,
                    uploadedUrl: image.originalUrl,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return uploadedImages;
    }

    async saveProcessedChapter(chapter, images) {
        const successCount = images.filter(img => img.success).length;
        const status = successCount > 0 ? 'completed' : 'failed';
        
        await db.update(`ImgChapter/${chapter.mangaId}/${chapter.chapterId}`, {
            ...chapter,
            images: images,
            status: status,
            imagesCount: images.length,
            successCount: successCount,
            completedAt: Date.now(),
            processingTime: Date.now() - (chapter.processingStartedAt || Date.now())
        });
        
        console.log(`💾 تم حفظ الفصل: ${successCount}/${images.length} صورة ناجحة`);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// تشغيل المعالج
const processor = new ImageProcessor();

// APIs
app.get('/', async (req, res) => {
    const chapters = await db.read('ImgChapter') || {};
    
    let totalChapters = 0;
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    
    for (const mangaChapters of Object.values(chapters)) {
        if (!mangaChapters) continue;
        
        for (const chapter of Object.values(mangaChapters)) {
            if (chapter) {
                totalChapters++;
                if (chapter.status === 'pending_images') pending++;
                else if (chapter.status === 'processing') processing++;
                else if (chapter.status === 'completed') completed++;
                else if (chapter.status === 'failed') failed++;
            }
        }
    }
    
    res.json({
        server: '3 - معالج الصور',
        status: processor.isProcessing ? 'processing' : 'idle',
        stats: {
            totalChapters: totalChapters,
            pending: pending,
            processing: processing,
            completed: completed,
            failed: failed,
            uploadedCount: processor.uploadedCount
        },
        currentChapter: processor.currentChapter,
        imgbb: IMGBB_API_KEY ? 'configured' : 'not_configured',
        endpoints: {
            '/start': 'بدء المعالجة',
            '/stop': 'إيقاف المعالجة',
            '/chapters': 'عرض الفصول',
            '/process-now': 'معالجة فورية'
        }
    });
});

app.get('/start', async (req, res) => {
    await processor.start();
    res.json({ success: true, message: 'بدأت معالجة الصور' });
});

app.get('/process-now', async (req, res) => {
    const chapter = await processor.getNextChapter();
    
    if (!chapter) {
        return res.json({ success: false, message: 'لا توجد فصول تحتاج معالجة' });
    }
    
    await processor.processChapter(chapter);
    res.json({ success: true, message: `تمت معالجة الفصل ${chapter.title}` });
});

app.get('/chapters', async (req, res) => {
    const chapters = await db.read('ImgChapter') || {};
    const result = [];
    
    for (const [mangaId, mangaChapters] of Object.entries(chapters)) {
        if (!mangaChapters) continue;
        
        for (const [chapterId, chapterData] of Object.entries(mangaChapters)) {
            if (chapterData) {
                result.push({
                    mangaId,
                    chapterId,
                    title: chapterData.title,
                    status: chapterData.status || 'unknown',
                    url: chapterData.url,
                    imagesCount: chapterData.images?.length || 0,
                    successCount: chapterData.successCount || 0,
                    createdAt: chapterData.createdAt
                });
            }
        }
    }
    
    res.json({
        total: result.length,
        chapters: result
    });
});

// بدء المعالجة تلقائياً
app.listen(PORT, async () => {
    console.log(`✅ السيرفر 3 يعمل على المنفذ ${PORT}`);
    console.log(`🔗 الرابط: https://server-3-frfj.onrender.com`);
    
    // بدء المعالجة بعد 10 ثواني
    setTimeout(async () => {
        await processor.start();
    }, 10000);
});
