const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// ==================== متغيرات البيئة ====================
const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = "KXPNxnGZDA1BGnzs4kZIA45o6Vr9P5nJ3Z01X4bt";
const DATABASE_URL = "https://hackerdz-b1bdf.firebaseio.com";
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

// ==================== دوال Firebase ====================
async function writeToFirebase(path, data) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.error('❌ خطأ: متغيرات Firebase غير موجودة.');
        return;
    }
    
    // تنظيف المسار من الأحرف غير المسموح بها
    const cleanPath = path.replace(/[.#$\[\]]/g, '_');
    const url = `${FIXED_DB_URL}${cleanPath}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        await axios.put(url, data);
    } catch (error) {
        console.error(`❌ فشل الكتابة إلى Firebase في ${cleanPath}:`, error.message);
        throw error;
    }
}

async function readFromFirebase(path) {
    if (!FIXED_DB_URL || !DATABASE_SECRETS) {
        console.error('❌ خطأ: متغيرات Firebase غير موجودة.');
        return null;
    }
    
    const cleanPath = path.replace(/[.#$\[\]]/g, '_');
    const url = `${FIXED_DB_URL}${cleanPath}.json?auth=${DATABASE_SECRETS}`;
    
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        console.error(`❌ فشل القراءة من Firebase في ${cleanPath}:`, error.message);
        throw error;
    }
}

// ==================== إعدادات الجلب ====================
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

async function advancedFetch(url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const proxy = ADVANCED_PROXIES[Math.floor(Math.random() * ADVANCED_PROXIES.length)];
        try {
            let targetUrl = url;
            if (proxy.url) {
                targetUrl = proxy.url + encodeURIComponent(targetUrl);
            }
            const response = await axios.get(targetUrl, {
                headers: getAdvancedHeaders(),
                timeout: 20000,
                validateStatus: (status) => status >= 200 && status < 500
            });
            if (response.status === 200) return response.data;
        } catch (error) {
            console.log(`❌ فشل [${proxy.name}]: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
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
    
    $('.wp-manga-chapter-img').each((i, element) => {
        const rawUrl = $(element).attr('src') || $(element).attr('data-src') || $(element).attr('data-lazy-src');
        if (rawUrl) {
            const cleanUrl = cleanImageUrl(rawUrl);
            if (cleanUrl && (cleanUrl.includes('.jpg') || cleanUrl.includes('.png') || cleanUrl.includes('.jpeg') || cleanUrl.includes('.webp'))) {
                images.push({ order: i + 1, originalUrl: cleanUrl });
            }
        }
    });
    
    if (images.length === 0) {
        $('.reading-content img').each((i, element) => {
            const imgUrl = $(element).attr('src');
            if (imgUrl) {
                const cleanUrl = cleanImageUrl(imgUrl);
                if (cleanUrl) {
                    images.push({ order: i + 1, originalUrl: cleanUrl });
                }
            }
        });
    }
    
    return images;
}

async function uploadToImgBB(imageUrl) {
    if (!IMGBB_API_KEY) {
        return { 
            success: false, 
            message: 'IMGBB_API_KEY مفقود',
            url: imageUrl 
        };
    }
    
    try {
        const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: getAdvancedHeaders(),
            timeout: 15000
        });
        
        const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64');
        
        const formData = new URLSearchParams();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', base64Image);
        
        const uploadResponse = await axios.post('https://api.imgbb.com/1/upload', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 25000
        });
        
        if (uploadResponse.data.success) {
            return { 
                success: true, 
                url: uploadResponse.data.data.url 
            };
        } else {
            return { 
                success: false, 
                message: uploadResponse.data.error?.message || 'Upload failed',
                url: imageUrl 
            };
        }
        
    } catch (error) {
        return { 
            success: false, 
            message: error.message,
            url: imageUrl 
        };
    }
}

// ==================== منطق المعالجة الرئيسي ====================
async function processChapter(mangaId, chapterId, chapterData) {
    console.log(`\n🎯 بدء معالجة الفصل: ${chapterData?.title || chapterId} (${mangaId})`);
    
    try {
        // تحديث الحالة إلى "processing" مع هيكل صحيح
        const updateData = {
            ...chapterData,
            status: 'processing',
            lastUpdated: Date.now(),
            processingStarted: Date.now()
        };
        
        await writeToFirebase(`ImgChapter/${mangaId}/chapters/${chapterId}`, updateData);
        
        if (!chapterData?.url) {
            throw new Error('رابط الفصل غير موجود');
        }
        
        const html = await fetchPageWithRetry(chapterData.url);
        const images = extractImages(html);
        
        if (images.length === 0) {
            throw new Error('لم يتم العثور على أي صور.');
        }
        
        console.log(`📊 تم العثور على ${images.length} صورة. بدء الرفع...`);
        
        const uploadedImages = [];
        let successCount = 0;
        let failedCount = 0;
        
        for (const image of images) {
            const uploadResult = await uploadToImgBB(image.originalUrl);
            
            const imageData = {
                order: image.order,
                originalUrl: image.originalUrl,
                uploadedUrl: uploadResult.success ? uploadResult.url : image.originalUrl,
                uploadSuccess: uploadResult.success,
                error: uploadResult.success ? null : uploadResult.message,
                uploadedAt: Date.now()
            };
            
            uploadedImages.push(imageData);
            
            if (uploadResult.success) {
                successCount++;
                console.log(`✅ تم رفع الصورة ${image.order}`);
            } else {
                failedCount++;
                console.log(`⚠️ فشل رفع الصورة ${image.order}: ${uploadResult.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // تحديث البيانات مع النتائج
        const finalData = {
            ...chapterData,
            images: uploadedImages,
            totalImages: images.length,
            uploadedImages: successCount,
            failedImages: failedCount,
            status: successCount > 0 ? 'completed' : 'failed',
            completedAt: Date.now(),
            lastUpdated: Date.now()
        };
        
        await writeToFirebase(`ImgChapter/${mangaId}/chapters/${chapterId}`, finalData);
        
        console.log(`\n✅ تم معالجة الفصل ${chapterId} بنجاح!`);
        console.log(`📊 النتائج: ${successCount} ناجحة، ${failedCount} فاشلة`);
        
        return { 
            success: true, 
            status: 'completed',
            stats: { successCount, failedCount, total: images.length }
        };
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الفصل:', error.message);
        
        const errorData = {
            ...chapterData,
            status: 'error',
            error: error.message,
            lastUpdated: Date.now(),
            errorAt: Date.now()
        };
        
        await writeToFirebase(`ImgChapter/${mangaId}/chapters/${chapterId}`, errorData);
        
        return { 
            success: false, 
            status: 'error',
            error: error.message 
        };
    }
}

// ==================== واجهات API ====================
const app = express();
app.use(express.json());

app.get('/process-chapter/:mangaId/:chapterId', async (req, res) => {
    const { mangaId, chapterId } = req.params;
    
    try {
        console.log(`📥 طلب معالجة: ${mangaId}/${chapterId}`);
        
        const chapterData = await readFromFirebase(`ImgChapter/${mangaId}/chapters/${chapterId}`);
        
        if (!chapterData) {
            return res.status(404).json({ 
                success: false, 
                message: 'لم يتم العثور على الفصل' 
            });
        }
        
        if (chapterData.status === 'completed' || chapterData.status === 'processing') {
            return res.json({ 
                success: true, 
                message: 'الفصل قيد المعالجة أو مكتمل بالفعل',
                status: chapterData.status 
            });
        }
        
        // المعالجة في الخلفية
        processChapter(mangaId, chapterId, chapterData);
        
        res.json({ 
            success: true, 
            message: 'بدأت معالجة الصور.',
            chapterId: chapterId,
            mangaId: mangaId
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// محرك الفحص المستمر للفصول المعلقة
async function continuousChapterCheck() {
    while (true) {
        try {
            const allManga = await readFromFirebase('ImgChapter');
            
            if (allManga) {
                for (const [mangaId, mangaData] of Object.entries(allManga)) {
                    if (mangaData && mangaData.chapters) {
                        for (const [chapterId, chapterData] of Object.entries(mangaData.chapters)) {
                            if (chapterData && 
                                (chapterData.status === 'pending_images' || 
                                 chapterData.status === 'error')) {
                                
                                console.log(`🔍 معالجة الفصل: ${mangaId}/${chapterId}`);
                                await processChapter(mangaId, chapterId, chapterData);
                                await new Promise(resolve => setTimeout(resolve, 10000));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ خطأ في محرك فحص الفصول:', error.message);
        }
        
        await new Promise(resolve => setTimeout(resolve, 120000));
    }
}

app.get('/', (req, res) => {
    res.send(`<h1>🖼️ البوت 3 - معالج الصور</h1>`);
});

app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 يعمل على المنفذ ${PORT}`);
    continuousChapterCheck();
});