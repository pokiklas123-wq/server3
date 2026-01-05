const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

// دالة للقراءة من Firebase
async function readFromFirebase(path) {
    const url = `${DATABASE_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('❌ خطأ في القراءة من Firebase:', error.message);
        return null;
    }
}

// دالة للكتابة إلى Firebase
async function writeToFirebase(path, data) {
    const url = `${DATABASE_URL}${path}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        const response = await axios.put(url, data);
        return response.data;
    } catch (error) {
        console.error('❌ خطأ في الكتابة إلى Firebase:', error.message);
        throw error;
    }
}

// دالة لرفع صورة إلى imgbb
async function uploadToImgBB(imageUrl) {
    if (!IMGBB_API_KEY) {
        console.warn('⚠️ IMGBB_API_KEY غير موجود، استخدام الرابط الأصلي');
        return imageUrl;
    }
    
    try {
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', imageUrl);
        
        const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        if (response.data.success) {
            return response.data.data.url;
        }
        
        throw new Error('فشل رفع الصورة إلى imgbb');
        
    } catch (error) {
        console.error('❌ خطأ في رفع الصورة:', error.message);
        return imageUrl; // إرجاع الرابط الأصلي في حال الخطأ
    }
}

// دالة لجلب صور الفصل
async function scrapeChapterImages(chapterUrl) {
    try {
        console.log(`📥 جلب الصور من: ${chapterUrl}`);
        
        const response = await axios.get(chapterUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 30000
        });
        
        const $ = cheerio.load(response.data);
        
        const images = [];
        
        // استخراج جميع الصور
        $('.wp-manga-chapter-img').each(async (i, element) => {
            const imgUrl = $(element).attr('src');
            if (imgUrl) {
                images.push({
                    order: i,
                    originalUrl: imgUrl,
                    status: 'pending'
                });
            }
        });
        
        console.log(`✅ تم العثور على ${images.length} صورة`);
        return images;
        
    } catch (error) {
        console.error('❌ خطأ في جلب الصور:', error.message);
        return [];
    }
}

// دالة للبحث عن فصل يحتاج معالجة
async function findPendingChapter() {
    try {
        console.log('🔍 البحث عن فصل يحتاج معالجة...');
        
        // قراءة جميع الفصول
        const allChapters = await readFromFirebase('ImgChapter');
        
        if (!allChapters) return null;
        
        // البحث في جميع المانجا والفصول
        for (const [mangaId, chapters] of Object.entries(allChapters)) {
            if (!chapters) continue;
            
            for (const [chapterId, chapterData] of Object.entries(chapters)) {
                if (chapterData && chapterData.status === 'pending_images') {
                    return {
                        mangaId,
                        chapterId,
                        chapterData,
                        fullPath: `ImgChapter/${mangaId}/${chapterId}`
                    };
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
        
        console.log(`🎯 معالجة الفصل: ${chapterId}`);
        
        // تغيير الحالة
        await writeToFirebase(chapterPath, {
            ...chapterData,
            status: 'processing_images',
            startedAt: Date.now()
        });
        
        // جلب الصور
        const images = await scrapeChapterImages(chapterData.url || chapterData.test);
        
        if (images.length === 0) {
            await writeToFirebase(chapterPath, {
                ...chapterData,
                status: 'failed',
                error: 'لم يتم العثور على صور',
                completedAt: Date.now()
            });
            
            return { success: false, error: 'لم يتم العثور على صور' };
        }
        
        console.log(`🖼️ بدء رفع ${images.length} صورة...`);
        
        // رفع كل صورة
        const uploadedImages = [];
        
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            
            try {
                const uploadedUrl = await uploadToImgBB(image.originalUrl);
                
                uploadedImages.push({
                    order: image.order,
                    originalUrl: image.originalUrl,
                    uploadedUrl: uploadedUrl,
                    uploadedAt: Date.now()
                });
                
                console.log(`✅ تم رفع الصورة ${i + 1}/${images.length}`);
                
                // تأخير بين الصور
                if (i < images.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (error) {
                console.error(`❌ خطأ في الصورة ${i + 1}:`, error.message);
                uploadedImages.push({
                    order: image.order,
                    originalUrl: image.originalUrl,
                    uploadedUrl: image.originalUrl, // استخدام الرابط الأصلي
                    error: error.message,
                    uploadedAt: Date.now()
                });
            }
        }
        
        // ترتيب الصور حسب الترتيب
        uploadedImages.sort((a, b) => a.order - b.order);
        
        // تحديث الفصل بالصور
        await writeToFirebase(chapterPath, {
            ...chapterData,
            images: uploadedImages,
            status: 'completed',
            imagesCount: uploadedImages.length,
            completedAt: Date.now(),
            test: null // حذف الحقل المؤقت
        });
        
        console.log(`✅ تم معالجة الفصل ${chapterId} بنجاح`);
        
        return { 
            success: true, 
            imagesCount: uploadedImages.length 
        };
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الفصل:', error.message);
        return { success: false, error: error.message };
    }
}

// API لمعالجة الفصل التالي
app.get('/process-next-chapter', async (req, res) => {
    try {
        console.log('🚀 بدء معالجة الفصل التالي...');
        
        // البحث عن فصل
        const chapterData = await findPendingChapter();
        
        if (!chapterData) {
            return res.json({ 
                success: false, 
                message: 'لا توجد فصول تحتاج معالجة' 
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
                imagesCount: result.imagesCount
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
        
    } catch (error) {
        console.error('❌ خطأ:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// معالجة تلقائية كل 30 ثانية
setInterval(async () => {
    console.log('⏰ فحص تلقائي للفصول...');
    const chapter = await findPendingChapter();
    if (chapter) {
        console.log(`🔍 وجد فصل للعمل: ${chapter.chapterId}`);
    }
}, 30000);

// صفحة الاختبار
app.get('/', (req, res) => {
    res.send(`
        <h1>✅ البوت 3 يعمل</h1>
        <p>استخدم <a href="/process-next-chapter">/process-next-chapter</a> لمعالجة الفصل التالي</p>
        <p>Firebase: ${DATABASE_SECRETS ? '✅ متصل' : '❌ غير متصل'}</p>
        <p>ImgBB API: ${IMGBB_API_KEY ? '✅ موجود' : '❌ مفقود'}</p>
    `);
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`✅ البوت 3 يعمل على المنفذ ${PORT}`);
    console.log(`🔗 استخدم /process-next-chapter لبدء المعالجة`);
    if (!IMGBB_API_KEY) {
        console.warn('⚠️ تحذير: IMGBB_API_KEY غير موجود، سيتم استخدام الروابط الأصلية');
    }
});
