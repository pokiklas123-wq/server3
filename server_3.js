const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// ==================== متغيرات البيئة ====================
const PORT = process.env.PORT || 3002;
const DATABASE_SECRETS = "KXPNxnGZDA1BGnzs4kZIA45o6Vr9P5nJ3Z01X4bt";
const DATABASE_URL = "https://hackerdz-b1bdf.firebaseio.com";

// ==================== إعدادات النظام ====================
const SYSTEM_CONFIG = {
    USE_DIRECT_LINKS: true,
    MAX_IMAGES_PER_CHAPTER: 100,
    DELAY_BETWEEN_IMAGES: 1500, // زيادة التأخير
    DELAY_BETWEEN_CHAPTERS: 3000, // زيادة التأخير
    DELAY_BETWEEN_GROUPS: 4000,
    MAX_FETCH_RETRIES: 5, // زيادة عدد المحاولات
    MAX_CHAPTERS_PER_CYCLE: 8, // تقليل عدد الفصول في كل دورة
    RETRY_DELAY_BASE: 2000 // تأخير أساسي لإعادة المحاولة
};

// ==================== رؤوس HTTP وبروكسيات محسنة ====================
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
];

const REFERERS = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://azoramoon.com/',
    'https://mangakakalot.com/',
    'https://manganato.com/',
    'https://mangareader.to/',
    'https://mangadex.org/',
    ''
];

const PROXIES = [
    '', // مباشر أولاً
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://proxy.cors.sh/',
    'https://api.codetabs.com/v1/proxy?quest='
];

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

// ==================== دوال الرؤوس والبروكسي ====================
function getRandomHeaders() {
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const referer = REFERERS[Math.floor(Math.random() * REFERERS.length)];
    const acceptLanguage = ['en-US,en;q=0.9', 'ar,en;q=0.8', 'fr,en;q=0.7', 'es,en;q=0.6'][Math.floor(Math.random() * 4)];
    
    return {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': acceptLanguage,
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': referer,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': referer.includes('azoramoon') ? 'same-origin' : 'cross-site',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1'
    };
}

async function tryFetchWithProxies(url, retries = SYSTEM_CONFIG.MAX_FETCH_RETRIES) {
    const errors = [];
    
    // ترتيب البروكسيات عشوائيًا في كل محاولة
    const shuffledProxies = [...PROXIES].sort(() => Math.random() - 0.5);
    
    for (let attempt = 0; attempt < retries; attempt++) {
        console.log(`   🔄 محاولة ${attempt + 1}/${retries} لجلب الفصل`);
        
        for (const proxy of shuffledProxies) {
            try {
                let targetUrl = url;
                if (proxy) {
                    if (proxy.includes('corsproxy.io') || proxy.includes('cors-anywhere') || proxy.includes('proxy.cors.sh')) {
                        targetUrl = proxy + encodeURIComponent(url);
                    } else {
                        targetUrl = proxy + url;
                    }
                }
                
                const headers = getRandomHeaders();
                
                const response = await axios.get(targetUrl, {
                    headers: headers,
                    timeout: 25000, // زيادة المهلة
                    maxRedirects: 5,
                    validateStatus: function (status) {
                        return status >= 200 && status < 400; // قبول 3xx كردود توجيه
                    },
                    responseType: 'text'
                });
                
                if (response.status === 200) {
                    console.log(`   ✅ نجح ${proxy ? 'مع بروكسي' : 'مباشر'}`);
                    return response.data;
                } else if (response.status >= 300 && response.status < 400) {
                    console.log(`   ↪️  توجيه ${response.status}`);
                    continue;
                } else {
                    errors.push(`${proxy ? 'بروكسي' : 'مباشر'}: ${response.status}`);
                }
                
            } catch (error) {
                const errorMsg = error.code || error.message;
                errors.push(`${proxy ? 'بروكسي' : 'مباشر'}: ${errorMsg}`);
            }
            
            // تأخير عشوائي بين المحاولات
            const delay = 1500 + Math.floor(Math.random() * 2500);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        console.log(`   💤 انتظار 4 ثواني قبل المحاولة التالية...`);
        await new Promise(resolve => setTimeout(resolve, 4000));
    }
    
    // محاولة أخيرة باستخدام axios مباشرة مع إعدادات خاصة
    try {
        console.log(`   🔄 محاولة أخيرة مع إعدادات خاصة...`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Referer': 'https://azoramoon.com/',
                'DNT': '1',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 30000,
            maxRedirects: 10,
            responseType: 'text',
            validateStatus: null // قبول جميع الحالات
        });
        
        if (response.status === 200) {
            console.log(`   ✅ نجحت المحاولة الأخيرة!`);
            return response.data;
        }
    } catch (finalError) {
        errors.push(`المحاولة الأخيرة: ${finalError.message}`);
    }
    
    throw new Error(`فشلت جميع محاولات جلب الفصل (${url}):\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`);
}

async function fetchImageWithRetry(imageUrl) {
    const errors = [];
    
    for (let attempt = 0; attempt < 2; attempt++) { // محاولتان فقط للصور
        console.log(`   🖼️  محاولة ${attempt + 1}/2 لجلب الصورة`);
        
        const shuffledProxies = [...PROXIES].sort(() => Math.random() - 0.5);
        
        for (const proxy of shuffledProxies) {
            try {
                let targetUrl = imageUrl;
                if (proxy) {
                    if (proxy.includes('corsproxy.io') || proxy.includes('cors-anywhere')) {
                        targetUrl = proxy + encodeURIComponent(imageUrl);
                    } else {
                        targetUrl = proxy + imageUrl;
                    }
                }
                
                const response = await axios.get(targetUrl, {
                    headers: getRandomHeaders(),
                    timeout: 15000,
                    maxRedirects: 3,
                    responseType: 'arraybuffer',
                    validateStatus: function (status) {
                        return status === 200; // فقط 200 للصور
                    }
                });
                
                if (response.status === 200) {
                    return {
                        success: true,
                        url: imageUrl,
                        proxyUsed: proxy || 'direct'
                    };
                }
                
            } catch (error) {
                errors.push(`${proxy ? 'بروكسي' : 'مباشر'}: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return {
        success: false,
        url: imageUrl,
        error: `فشل جلب الصورة: ${errors.slice(0, 3).join(', ')}`
    };
}

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
function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    
    let cleanUrl = url
        .replace(/[\t\n\r\s]+/g, '')
        .trim()
        .replace(/^\/\//, 'https://');
    
    // التأكد من إضافة النطاق الأساسي إذا كان الرابط نسبياً
    if (cleanUrl.startsWith('/') && !cleanUrl.startsWith('//')) {
        cleanUrl = `https://azoramoon.com${cleanUrl}`;
    }
    
    // إصلاح الروابط الشائعة
    if (cleanUrl.includes('i0.wp.com/azoramoon.com')) {
        cleanUrl = cleanUrl.replace('i0.wp.com/', '');
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
        'img[data-src]',
        'img[data-lazy-src]',
        '.page-break img',
        '.separator img'
    ];
    
    for (const selector of imageSelectors) {
        $(selector).each((i, element) => {
            const $el = $(element);
            
            const rawUrl = $el.attr('src') || 
                          $el.attr('data-src') || 
                          $el.attr('data-lazy-src') ||
                          $el.attr('data-original');
            
            if (rawUrl) {
                const cleanUrl = cleanImageUrl(rawUrl);
                
                if (cleanUrl && 
                   (cleanUrl.includes('.jpg') || 
                    cleanUrl.includes('.jpeg') || 
                    cleanUrl.includes('.png') || 
                    cleanUrl.includes('.webp') ||
                    cleanUrl.includes('.gif') ||
                    cleanUrl.includes('.bmp'))) {
                    
                    const isDuplicate = images.some(img => img.originalUrl === cleanUrl);
                    
                    if (!isDuplicate && images.length < SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER) {
                        images.push({
                            order: images.length + 1,
                            originalUrl: cleanUrl,
                            selector: selector,
                            alt: $el.attr('alt') || ''
                        });
                    }
                }
            }
        });
        
        if (images.length > 0) {
            console.log(`   ✅ وجد ${images.length} صورة باستخدام: ${selector}`);
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
        
        await writeToFirebase(chapterPath, {
            ...chapterData,
            status: 'processing',
            processingStarted: Date.now(),
            lastUpdated: Date.now(),
            retryCount: (chapterData.retryCount || 0) + 1
        });
        
        const html = await tryFetchWithProxies(chapterData.url);
        
        if (!html || html.length < 100) {
            throw new Error('استجابة HTML قصيرة جدًا أو فارغة');
        }
        
        const extractedImages = extractImages(html);
        
        if (extractedImages.length === 0) {
            throw new Error('لم يتم العثور على أي صور في الفصل');
        }
        
        console.log(`📊 تم العثور على ${extractedImages.length} صورة`);
        
        const imageData = [];
        let successfulImages = 0;
        
        for (const img of extractedImages) {
            console.log(`   🖼️  معالجة الصورة ${img.order}/${extractedImages.length}`);
            
            // اختبار جلب الصورة للتحقق من صلاحيتها
            const testResult = await fetchImageWithRetry(img.originalUrl);
            
            if (testResult.success) {
                imageData.push({
                    order: img.order,
                    url: img.originalUrl,
                    status: 'direct_link',
                    fetchedAt: Date.now(),
                    proxyUsed: testResult.proxyUsed
                });
                successfulImages++;
                
                console.log(`   ✅ صورة ${img.order}: صالحة (${testResult.proxyUsed})`);
            } else {
                imageData.push({
                    order: img.order,
                    url: img.originalUrl,
                    status: 'failed_fetch',
                    error: testResult.error,
                    fetchedAt: Date.now()
                });
                
                console.log(`   ⚠️  صورة ${img.order}: فشل الجلب`);
            }
            
            if (img.order < extractedImages.length) {
                const delay = SYSTEM_CONFIG.DELAY_BETWEEN_IMAGES + Math.floor(Math.random() * 1000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        const successRate = (successfulImages / extractedImages.length) * 100;
        console.log(`📊 معدل نجاح الصور: ${successRate.toFixed(1)}% (${successfulImages}/${extractedImages.length})`);
        
        const updatedChapterData = {
            ...chapterData,
            images: imageData,
            totalImages: imageData.length,
            successfulImages: successfulImages,
            successRate: successRate,
            status: successRate >= 70 ? 'completed' : 'partial',
            completedAt: Date.now(),
            lastUpdated: Date.now(),
            processingTime: Date.now() - (chapterData.processingStarted || Date.now()),
            retryCount: 0 // إعادة تعيين عند النجاح
        };
        
        await writeToFirebase(chapterPath, updatedChapterData);
        
        await updateImageStats(mangaId, chapterId, successfulImages, imageData.length);
        
        console.log(`✅ تم معالجة الفصل بنجاح`);
        console.log(`📊 الصور: ${successfulImages}/${imageData.length} صورة صالحة`);
        
        return {
            success: true,
            chapterId: chapterId,
            mangaId: mangaId,
            group: chapterGroup,
            totalImages: imageData.length,
            successfulImages: successfulImages,
            successRate: successRate,
            status: updatedChapterData.status
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
                    lastUpdated: Date.now(),
                    lastError: Date.now()
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

async function updateImageStats(mangaId, chapterId, successfulImages, totalImages) {
    try {
        const statsPath = `System/image_stats`;
        const currentStats = await readFromFirebase(statsPath) || {
            totalImages: 0,
            successfulImages: 0,
            totalChapters: 0,
            successfulChapters: 0,
            lastUpdate: Date.now()
        };
        
        await writeToFirebase(statsPath, {
            totalImages: (currentStats.totalImages || 0) + totalImages,
            successfulImages: (currentStats.successfulImages || 0) + successfulImages,
            totalChapters: (currentStats.totalChapters || 0) + 1,
            successfulChapters: (currentStats.successfulChapters || 0) + (successfulImages > 0 ? 1 : 0),
            lastUpdate: Date.now(),
            successRate: currentStats.successfulImages > 0 ? 
                ((currentStats.successfulImages + successfulImages) / (currentStats.totalImages + totalImages) * 100).toFixed(2) : 0
        });
    } catch (error) {
        console.error('❌ فشل تحديث إحصائيات الصور:', error.message);
    }
}

// ==================== محرك الفحص المستمر المحسن ====================
async function continuousChapterCheck() {
    console.log('\n🔍 بدء الفحص المستمر للفصول...');
    
    while (true) {
        try {
            let processedCount = 0;
            let totalImages = 0;
            let successfulImages = 0;
            let errorCount = 0;
            
            console.log('\n📊 ======= بدء دورة فحص جديدة للفصول =======');
            
            const chapterStats = await readFromFirebase('System/chapter_stats') || {};
            const maxGroup = chapterStats.currentGroup || 1;
            
            console.log(`📁 عدد مجموعات الفصول: ${maxGroup}`);
            
            for (let groupNum = 1; groupNum <= maxGroup; groupNum++) {
                const groupName = `ImgChapter_${groupNum}`;
                
                try {
                    console.log(`\n📁 فحص مجموعة الفصول: ${groupName}`);
                    
                    const groupData = await readFromFirebase(groupName);
                    
                    if (!groupData || typeof groupData !== 'object') {
                        console.log(`   ⏭️  المجموعة فارغة`);
                        continue;
                    }
                    
                    const mangaIds = Object.keys(groupData).filter(key => key !== 'created' && key !== 'type');
                    console.log(`   📊 تم العثور على ${mangaIds.length} مانجا في المجموعة.`);
                    
                    let groupChapters = 0;
                    let groupProcessed = 0;
                    
                    // جمع جميع الفصول في قائمة مع الأولوية
                    const allChapters = [];
                    
                    for (const mangaId of mangaIds) {
                        const mangaData = groupData[mangaId];
                        
                        if (mangaData && mangaData.chapters) {
                            const chapters = mangaData.chapters;
                            
                            for (const chapterId in chapters) {
                                const chapter = chapters[chapterId];
                                
                                if (chapter) {
                                    let priority = 0;
                                    
                                    if (chapter.status === 'pending_images') priority = 100;
                                    else if (chapter.status === 'error') priority = 80;
                                    else if (chapter.status === 'partial') priority = 60;
                                    else if (!chapter.status) priority = 40;
                                    else if (chapter.status === 'completed') {
                                        // الفصول المكتملة لها أولوية منخفضة
                                        const daysSinceCompletion = chapter.completedAt ? 
                                            (Date.now() - chapter.completedAt) / (1000 * 60 * 60 * 24) : 30;
                                        priority = Math.min(20, daysSinceCompletion);
                                    }
                                    
                                    allChapters.push({
                                        mangaId,
                                        chapterId,
                                        chapter,
                                        priority,
                                        groupName
                                    });
                                    
                                    groupChapters++;
                                }
                            }
                        }
                    }
                    
                    // ترتيب الفصول حسب الأولوية (من الأعلى للأدنى)
                    allChapters.sort((a, b) => b.priority - a.priority);
                    
                    console.log(`   🎯 ${allChapters.filter(c => c.priority >= 30).length} فصل ذو أولوية عالية`);
                    
                    // معالجة الفصول ذات الأولوية العالية فقط
                    for (const { mangaId, chapterId, chapter, groupName } of allChapters) {
                        if (processedCount >= SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE) break;
                        if (chapter.priority < 30) continue; // تخطي الفصول ذات الأولوية المنخفضة
                        
                        console.log(`\n🎯 معالجة الفصل: ${mangaId}/${chapterId}`);
                        console.log(`   📊 الحالة: ${chapter.status || 'غير محدد'}`);
                        console.log(`   🎯 الأولوية: ${chapter.priority.toFixed(1)}`);
                        
                        try {
                            const result = await processChapter(mangaId, chapterId, groupName);
                            
                            if (result.success && !result.skipped) {
                                processedCount++;
                                groupProcessed++;
                                totalImages += result.totalImages || 0;
                                successfulImages += result.successfulImages || 0;
                                
                                console.log(`   ✅ تمت المعالجة: ${result.successfulImages || 0}/${result.totalImages || 0} صورة صالحة`);
                            } else if (result.skipped) {
                                console.log(`   ⏭️  تم تخطي الفصل (${result.status})`);
                            } else {
                                errorCount++;
                                console.log(`   ⚠️  فشل: ${result.error}`);
                            }
                            
                        } catch (error) {
                            errorCount++;
                            console.error(`   ❌ خطأ في المعالجة: ${error.message}`);
                        }
                        
                        if (processedCount < SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE) {
                            const delay = SYSTEM_CONFIG.DELAY_BETWEEN_CHAPTERS + Math.floor(Math.random() * 2000);
                            console.log(`   💤 انتظار ${delay / 1000} ثانية...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }
                    
                    console.log(`   📊 المجموعة ${groupName}: ${groupProcessed}/${allChapters.length} فصل معالج`);
                    
                    await new Promise(resolve => setTimeout(resolve, SYSTEM_CONFIG.DELAY_BETWEEN_GROUPS));
                    
                    if (processedCount >= SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE) {
                        console.log(`\n⏸️  وصلت للحد الأقصى (${SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE}) في هذه الدورة`);
                        break;
                    }
                    
                } catch (groupError) {
                    console.error(`   ❌ خطأ في المجموعة ${groupName}:`, groupError.message);
                }
            }
            
            const successRate = totalImages > 0 ? (successfulImages / totalImages * 100).toFixed(1) : 0;
            
            console.log(`\n📊 ======= دورة الفحص اكتملت =======`);
            console.log(`   • فصول معالجة: ${processedCount}`);
            console.log(`   • صور إجمالية: ${totalImages}`);
            console.log(`   • صور صالحة: ${successfulImages} (${successRate}%)`);
            console.log(`   • أخطاء: ${errorCount}`);
            
            // حساب وقت الانتظار التالي بناءً على النتائج
            let waitTime;
            if (errorCount > processedCount * 0.6) { // إذا كانت نسبة الأخطاء عالية
                waitTime = 480000; // 8 دقائق
                console.log(`   ⚠️  نسبة أخطاء عالية، انتظار أطول`);
            } else if (processedCount === 0) {
                waitTime = 360000; // 6 دقائق
            } else if (successRate < 50) {
                waitTime = 420000; // 7 دقائق
            } else {
                waitTime = 240000; // 4 دقائق
            }
            
            console.log(`⏳ الانتظار ${waitTime / 1000} ثانية للدورة التالية...\n`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
        } catch (error) {
            console.error('❌ خطأ في محرك فحص الفصول:', error.message);
            await new Promise(resolve => setTimeout(resolve, 120000));
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
        
        processChapter(mangaId, chapterId, group)
            .then(result => console.log(`[خلفية] معالجة الفصل ${chapterId} اكتملت:`, result.success ? 'نجاح' : 'فشل'))
            .catch(error => console.error(`[خلفية] خطأ في معالجة الفصل ${chapterId}:`, error.message));
        
        res.json({ 
            success: true, 
            message: 'بدأت معالجة الصور في الخلفية',
            mangaId: mangaId,
            chapterId: chapterId,
            group: group,
            timestamp: Date.now()
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
        const chapterStats = await readFromFirebase('System/chapter_stats') || {};
        
        res.json({
            success: true,
            system: SYSTEM_CONFIG,
            imageStats: imageStats,
            chapterStats: chapterStats,
            proxies: {
                count: PROXIES.length,
                userAgents: USER_AGENTS.length,
                referers: REFERERS.length
            },
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

app.get('/test-proxy/:url(*)', async (req, res) => {
    const { url } = req.params;
    const decodedUrl = decodeURIComponent(url);
    
    try {
        console.log(`🔧 اختبار البروكسي للرابط: ${decodedUrl}`);
        const html = await tryFetchWithProxies(decodedUrl, 2);
        res.json({
            success: true,
            length: html.length,
            preview: html.substring(0, 500) + '...'
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
        <p><strong>الحالة:</strong> 🟢 يعمل (مستمع للبوت 2 + فحص مستمر)</p>
        <p><strong>ImgBB:</strong> ❌ معطل</p>
        <p><strong>الروابط المباشرة:</strong> ✅ مفعل</p>
        <p><strong>الصور/الفصل:</strong> ${SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER}</p>
        <p><strong>الحد/دورة:</strong> ${SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE} فصل</p>
        <p><strong>البروكسيات:</strong> ${PROXIES.length} خيار</p>
        <p><strong>User Agents:</strong> ${USER_AGENTS.length} نوع</p>
        
        <h3>الروابط:</h3>
        <p><a href="/stats">/stats</a> - إحصائيات الصور</p>
        <p><a href="/test-proxy/https://azoramoon.com/chapter/black-haze-remake-chapter-1">/test-proxy/[url]</a> - اختبار البروكسي</p>
        
        <h3>ملاحظات:</h3>
        <p>• يستخدم نظام بروكسيات متعدد لتجاوز الحظر 403</p>
        <p>• يختبر كل صورة قبل حفظها</p>
        <p>• يحسب معدل نجاح الصور والفصول</p>
    `);
});

app.listen(PORT, () => {
    console.log(`\n✅ البوت 3 يعمل على المنفذ ${PORT}`);
    console.log(`📊 إعدادات النظام:`);
    console.log(`   • ImgBB: ❌ معطل`);
    console.log(`   • الروابط المباشرة: ✅ مفعل`);
    console.log(`   • صور/فصل: ${SYSTEM_CONFIG.MAX_IMAGES_PER_CHAPTER}`);
    console.log(`   • الحد/دورة: ${SYSTEM_CONFIG.MAX_CHAPTERS_PER_CYCLE} فصل`);
    console.log(`   • البروكسيات: ${PROXIES.length} خيار`);
    console.log(`   • User Agents: ${USER_AGENTS.length} نوع`);
    console.log(`   • Referers: ${REFERERS.length} مرجع`);
    
    setTimeout(() => {
        continuousChapterCheck();
        console.log('✅ تم تفعيل الفحص المستمر.');
    }, 5000);
});
