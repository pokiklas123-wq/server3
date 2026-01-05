const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || 'YOUR_IMGBB_KEY_HERE'; // ⚠️ غير هذا

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

// 📱 نفس User-Agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

// 🔄 بروكسيات
const PROXIES = [
    '',
    'https://cors-anywhere.herokuapp.com/',
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://proxy.cors.sh/'
];

// دالة عشوائية
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// دالة محاولة جميع الطرق
async function fetchChapterPage(chapterUrl) {
    console.log(`\n🎯 محاولة جلب الفصل: ${chapterUrl}`);
    
    const errors = [];
    
    // المحاولة 1: مباشرة
    try {
        console.log('1️⃣ المحاولة المباشرة');
        const response = await axios.get(chapterUrl, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Referer': 'https://azoramoon.com/'
            },
            timeout: 20000
        });
        
        if (response.status === 200) {
            console.log('✅ نجحت المحاولة المباشرة');
            return response.data;
        }
    } catch (error) {
        errors.push(`مباشر: ${error.message}`);
        console.log('❌ فشلت المحاولة المباشرة:', error.message);
    }
    
    // المحاولة 2: مع بروكسيات
    for (const proxy of PROXIES) {
        try {
            let targetUrl = chapterUrl;
            
            if (proxy) {
                if (proxy.includes('?')) {
                    targetUrl = proxy + encodeURIComponent(chapterUrl);
                } else {
                    targetUrl = proxy + chapterUrl;
                }
            }
            
            console.log(`🔄 المحاولة مع: ${proxy || 'بدون بروكسي'}`);
            
            const response = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 25000
            });
            
            if (response.status === 200) {
                console.log(`✅ نجح مع ${proxy || 'بدون بروكسي'}`);
                return response.data;
            }
        } catch (error) {
            errors.push(`${proxy || 'بدون بروكسي'}: ${error.message}`);
            console.log(`❌ فشل مع ${proxy || 'بدون بروكسي'}: ${error.message}`);
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error(`فشل جميع المحاولات: ${errors.join(', ')}`);
}

// دالة استخراج الصور (بجميع الطرق)
function extractImagesFromHTML(html) {
    const $ = cheerio.load(html);
    const images = [];
    
    console.log('🔍 البحث عن الصور...');
    
    // طريقة 1: البحث بالكلاسات المعروفة
    const selectors = [
        '.wp-manga-chapter-img',
        '.reading-content img',
        '.page-break img',
        '.text-center img',
        'img[src*="data"]',
        'img[src*="chapter"]',
        'img[class*="img"]',
        'img[class*="image"]'
    ];
    
    for (const selector of selectors) {
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
                        selector: selector,
                        foundWith: selector
                    });
                }
            });
        }
    }
    
    // طريقة 2: البحث في div معين
    if (images.length === 0) {
        console.log('🔍 البحث في .reading-content');
        $('.reading-content').find('img').each((i, element) => {
            const imgUrl = $(element).attr('src');
            if (imgUrl) {
                images.push({
                    order: images.length,
                    originalUrl: imgUrl,
                    selector: '.reading-content img',
                    foundWith: 'fallback'
                });
            }
        });
    }
    
    // طريقة 3: جميع الصور
    if (images.length === 0) {
        console.log('🔍 البحث في جميع الصور');
        $('img').each((i, element) => {
            const imgUrl = $(element).attr('src');
            if (imgUrl && imgUrl.includes('.jpg') || imgUrl.includes('.png') || imgUrl.includes('.jpeg')) {
                images.push({
                    order: images.length,
                    originalUrl: imgUrl,
                    selector: 'img',
                    foundWith: 'all images'
                });
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
}

// دالة رفع إلى ImgBB
async function uploadToImgBB(imageUrl) {
    if (!IMGBB_API_KEY || IMGBB_API_KEY === 'YOUR_IMGBB_KEY_HERE') {
        console.log('⚠️ IMGBB_API_KEY غير صالح، استخدام الرابط الأصلي');
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

// دالة معالجة فصل واحد
async function processSingleChapter(mangaId, chapterId, chapterData) {
    try {
        console.log(`\n🎯 معالجة الفصل: ${chapterId}`);
        console.log(`📖 المانجا: ${mangaId}`);
        console.log(`🔗 الرابط: ${chapterData.url || chapterData.test}`);
        
        const chapterUrl = chapterData.url || chapterData.test;
        
        if (!chapterUrl) {
            console.log('❌ لا يوجد رابط للفصل');
            return { success: false, error: 'لا يوجد رابط للفصل' };
        }
        
        // جلب صفحة الفصل
        const html = await fetchChapterPage(chapterUrl);
        
        // استخراج الصور
        const images = extractImagesFromHTML(html);
        
        if (images.length === 0) {
            console.log('❌ لم أعثر على أي صور');
            console.log('🔍 محتوى HTML (أول 500 حرف):');
            console.log(html.substring(0, 500) + '...');
            
            return { 
                success: false, 
                error: 'لم يتم العثور على صور',
                htmlSample: html.substring(0, 500)
            };
        }
        
        console.log(`🖼️ بدء رفع ${images.length} صورة...`);
        
        // رفع الصور
        const uploadedImages = [];
        let successCount = 0;
        
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
                    console.log(`✅ تم رفع الصورة ${i + 1}`);
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
                    console.log(`❌ فشل رفع الصورة ${i + 1}: ${uploadResult.error}`);
                }
                
                // تأخير بين الصور
                if (i < images.length - 1) {
                    const delay = 2000 + Math.random() * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
            } catch (error) {
                console.error(`💥 خطأ في الصورة ${i + 1}:`, error.message);
                uploadedImages.push({
                    order: image.order,
                    originalUrl: image.originalUrl,
                    uploadedUrl: image.originalUrl,
                    status: 'error',
                    error: error.message,
                    uploadedAt: Date.now(),
                    success: false
                });
            }
        }
        
        // ترتيب الصور
        uploadedImages.sort((a, b) => a.order - b.order);
        
        console.log(`📊 النتيجة: ${successCount}/${images.length} نجحت`);
        
        // تحديث في Firebase
        const chapterPath = `ImgChapter/${mangaId}/${chapterId}`;
        const dbUrl = `${FIXED_DB_URL}${chapterPath}.json?auth=${DATABASE_SECRETS}`;
        
        const updateData = {
            ...chapterData,
            images: uploadedImages,
            status: successCount > 0 ? 'completed' : 'failed',
            imagesCount: uploadedImages.length,
            successCount: successCount,
            failCount: uploadedImages.length - successCount,
            processedAt: Date.now(),
            test: null
        };
        
        await axios.put(dbUrl, updateData, { timeout: 10000 });
        
        console.log(`✅ تم تحديث Firebase`);
        
        return { 
            success: successCount > 0,
            imagesCount: uploadedImages.length,
            successCount: successCount,
            failCount: uploadedImages.length - successCount,
            mangaId: mangaId,
            chapterId: chapterId
        };
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الفصل:', error.message);
        return { 
            success: false, 
            error: error.message,
            mangaId: mangaId,
            chapterId: chapterId
        };
    }
}

// API لمعالجة فصل محدد
app.get('/process-chapter/:mangaId/:chapterId', async (req, res) => {
    try {
        const { mangaId, chapterId } = req.params;
        
        console.log(`\n🚀 معالجة فصل محدد: ${mangaId}/${chapterId}`);
        
        // قراءة بيانات الفصل
        const chapterPath = `ImgChapter/${mangaId}/${chapterId}`;
        const dbUrl = `${FIXED_DB_URL}${chapterPath}.json?auth=${DATABASE_SECRETS}`;
        
        const response = await axios.get(dbUrl, { timeout: 10000 });
        const chapterData = response.data;
        
        if (!chapterData) {
            return res.json({
                success: false,
                error: 'لم يتم العثور على الفصل'
            });
        }
        
        // معالجة الفصل
        const result = await processSingleChapter(mangaId, chapterId, chapterData);
        
        res.json(result);
        
    } catch (error) {
        console.error('❌ خطأ:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// اختبار فصل محدد
app.get('/test-chapter/:mangaId/:chapterId', async (req, res) => {
    try {
        const { mangaId, chapterId } = req.params;
        
        console.log(`\n🔍 اختبار فصل: ${mangaId}/${chapterId}`);
        
        // قراءة بيانات الفصل
        const chapterPath = `ImgChapter/${mangaId}/${chapterId}`;
        const dbUrl = `${FIXED_DB_URL}${chapterPath}.json?auth=${DATABASE_SECRETS}`;
        
        const response = await axios.get(dbUrl, { timeout: 10000 });
        const chapterData = response.data;
        
        if (!chapterData) {
            return res.json({
                success: false,
                error: 'لم يتم العثور على الفصل'
            });
        }
        
        const chapterUrl = chapterData.url || chapterData.test;
        
        if (!chapterUrl) {
            return res.json({
                success: false,
                error: 'لا يوجد رابط للفصل'
            });
        }
        
        // اختبار الجلب فقط
        console.log(`🔗 اختبار الرابط: ${chapterUrl}`);
        
        try {
            const html = await fetchChapterPage(chapterUrl);
            const images = extractImagesFromHTML(html);
            
            res.json({
                success: true,
                url: chapterUrl,
                imagesFound: images.length,
                sampleImages: images.slice(0, 3),
                htmlLength: html.length,
                sampleHTML: html.substring(0, 300)
            });
            
        } catch (error) {
            res.json({
                success: false,
                error: error.message,
                url: chapterUrl
            });
        }
        
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
        <h1>🖼️ البوت 3 - النسخة المتطورة</h1>
        
        <h2>🎯 اختبار فصل محدد:</h2>
        <ul>
            <li><a href="/test-chapter/14584dfb5297/ch_0001">/test-chapter/14584dfb5297/ch_0001</a> - اختبار الفصل 1</li>
            <li><a href="/test-chapter/14584dfb5297/ch_0002">/test-chapter/14584dfb5297/ch_0002</a> - اختبار الفصل 2</li>
            <li><a href="/process-chapter/14584dfb5297/ch_0002">/process-chapter/14584dfb5297/ch_0002</a> - معالجة الفصل 2</li>
        </ul>
        
        <h2>⚙️ المعلومات:</h2>
        <p>عدد User-Agents: ${USER_AGENTS.length}</p>
        <p>عدد البروكسيات: ${PROXIES.length}</p>
        <p>ImgBB Key: ${IMGBB_API_KEY ? '✅ موجود' : '❌ مفقود'}</p>
        
        <h2>📝 التعليمات:</h2>
        <ol>
            <li>اختبر فصل أولاً (/test-chapter)</li>
            <li>إذا وجد صور، عالجه (/process-chapter)</li>
            <li>تحقق من Firebase بعد المعالجة</li>
        </ol>
    `);
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 المعدل يعمل على المنفذ ${PORT}`);
    console.log(`🔗 افتح: https://server-3.onrender.com`);
    console.log(`🎯 جاهز لاختبار الفصول...`);
});
