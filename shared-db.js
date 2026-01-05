// 📁 shared-db.js - يجب وضعه في كل من الثلاثة مستودعات
const axios = require('axios');
require('dotenv').config();

const DATABASE_SECRETS = process.env.DATABASE_SECRETS;
const DATABASE_URL = process.env.DATABASE;

const FIXED_DB_URL = DATABASE_URL && !DATABASE_URL.endsWith('/') ? DATABASE_URL + '/' : DATABASE_URL;

class DatabaseManager {
    constructor() {
        this.baseUrl = FIXED_DB_URL;
        this.auth = DATABASE_SECRETS;
    }

    async read(path) {
        if (!this.baseUrl || !this.auth) {
            console.log('⚠️ إعدادات Firebase غير مكتملة');
            return null;
        }
        
        const url = `${this.baseUrl}${path}.json?auth=${this.auth}`;
        
        try {
            const response = await axios.get(url, { timeout: 10000 });
            return response.data;
        } catch (error) {
            console.error(`❌ خطأ في قراءة ${path}:`, error.message);
            return null;
        }
    }

    async write(path, data) {
        if (!this.baseUrl || !this.auth) {
            console.log('⚠️ إعدادات Firebase غير مكتملة');
            return false;
        }
        
        const url = `${this.baseUrl}${path}.json?auth=${this.auth}`;
        
        try {
            await axios.put(url, data, { 
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`✅ تم الكتابة إلى ${path}`);
            return true;
        } catch (error) {
            console.error(`❌ خطأ في الكتابة إلى ${path}:`, error.message);
            return false;
        }
    }

    async update(path, data) {
        if (!this.baseUrl || !this.auth) {
            console.log('⚠️ إعدادات Firebase غير مكتملة');
            return false;
        }
        
        const url = `${this.baseUrl}${path}.json?auth=${this.auth}`;
        
        try {
            await axios.patch(url, data, { 
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`✅ تم التحديث في ${path}`);
            return true;
        } catch (error) {
            console.error(`❌ خطأ في التحديث في ${path}:`, error.message);
            return false;
        }
    }

    async delete(path) {
        if (!this.baseUrl || !this.auth) {
            console.log('⚠️ إعدادات Firebase غير مكتملة');
            return false;
        }
        
        const url = `${this.baseUrl}${path}.json?auth=${this.auth}`;
        
        try {
            await axios.delete(url, { timeout: 10000 });
            console.log(`✅ تم الحذف من ${path}`);
            return true;
        } catch (error) {
            console.error(`❌ خطأ في الحذف من ${path}:`, error.message);
            return false;
        }
    }

    async updateStatus(mangaId, chapterId, newStatus, extraData = {}) {
        const path = chapterId ? `status/${mangaId}/${chapterId}` : `status/${mangaId}`;
        const current = await this.read(path) || {};
        
        const updateData = {
            ...current,
            status: newStatus,
            updatedAt: Date.now(),
            ...extraData
        };
        
        return await this.write(path, updateData);
    }

    async getPendingJobs(type, limit = 1) {
        const allStatus = await this.read('status') || {};
        const jobs = [];
        
        for (const [mangaId, mangaData] of Object.entries(allStatus)) {
            if (!mangaData) continue;
            
            if (type === 'manga') {
                if (mangaData.status === 'pending_chapters' || 
                    mangaData.status === 'needs_update') {
                    jobs.push({ 
                        mangaId, 
                        ...mangaData,
                        lastChecked: mangaData.lastChecked || 0
                    });
                }
            } 
            else if (type === 'chapters') {
                if (mangaData.chapters) {
                    for (const [chapterId, chapterData] of Object.entries(mangaData.chapters)) {
                        if (chapterData && 
                            (chapterData.status === 'pending_images' || 
                             chapterData.status === 'failed')) {
                            jobs.push({ 
                                mangaId, 
                                chapterId, 
                                ...chapterData 
                            });
                        }
                    }
                }
            }
            
            if (jobs.length >= limit) break;
        }
        
        // ترتيب حسب الأقدم
        return jobs.sort((a, b) => (a.lastChecked || 0) - (b.lastChecked || 0));
    }

    async getMangaInfo(mangaId) {
        const [homeManga, status] = await Promise.all([
            this.read(`HomeManga/${mangaId}`),
            this.read(`status/${mangaId}`)
        ]);
        
        return {
            ...homeManga,
            ...status,
            id: mangaId
        };
    }

    async getChapterInfo(mangaId, chapterId) {
        const [chapter, status] = await Promise.all([
            this.read(`ImgChapter/${mangaId}/${chapterId}`),
            this.read(`status/${mangaId}/${chapterId}`)
        ]);
        
        return {
            ...chapter,
            ...status,
            mangaId,
            chapterId
        };
    }

    async markAsChecked(mangaId) {
        return await this.update(`status/${mangaId}`, {
            lastChecked: Date.now()
        });
    }
}

// إنشاء نسخة واحدة مشتركة
const dbManager = new DatabaseManager();

// دالة مساعدة للتحقق من اتصال Firebase
async function testFirebaseConnection() {
    console.log('🔗 اختبار اتصال Firebase...');
    try {
        const test = await dbManager.read('system/health');
        console.log('✅ اتصال Firebase يعمل');
        return true;
    } catch (error) {
        console.log('❌ مشكلة في اتصال Firebase:', error.message);
        
        // إنشاء مجلد النظام إذا لم يكن موجوداً
        await dbManager.write('system/health', {
            status: 'ok',
            lastCheck: Date.now(),
            servers: {
                server1: { lastActive: Date.now() },
                server2: { lastActive: Date.now() },
                server3: { lastActive: Date.now() }
            }
        });
        
        return true;
    }
}

// اختبار اتصال Firebase عند التحميل
testFirebaseConnection();

module.exports = dbManager;
