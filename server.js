const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer'); 
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs'); // مكتبة النظام للتعامل مع المجلدات

const app = express();
app.use(express.json());
app.use(cors());

// إنشاء مجلد الرفع برمجياً إذا لم يكن موجوداً
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// --- الاتصال بـ Aiven ---
const db = mysql.createPool({
    host: 'mysql-37412ec6-gaueng.l.aivencloud.com',
    port: 12740,
    user: 'avnadmin',
    password: 'AVNS_GatFmA-TfMR5SbWNdM-',
    database: 'defaultdb',
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10
});

// إعداد Multer مع المسار الصحيح
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, uploadDir); },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

/* ================= المسارات ================= */

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'guaeng.html')));

app.post('/register', async (req, res) => {
    const { full_name, email, password, role, academic_level } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (full_name, email, password, role, academic_level) VALUES (?, ?, ?, ?, ?)";
    db.query(sql, [full_name, email, hashedPassword, role, role === 'student' ? academic_level : null], (err) => {
        if (err) return res.status(500).send({ message: "خطأ بالتسجيل" });
        res.send({ message: "تم إنشاء الحساب بنجاح!" });
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err || results.length === 0) return res.status(401).send({ message: "المستخدم غير موجود" });
        const isMatch = await bcrypt.compare(password, results[0].password);
        if (isMatch) res.send({ user: { id: results[0].id, name: results[0].full_name, role: results[0].role, level: results[0].academic_level } });
        else res.status(401).send({ message: "كلمة المرور خاطئة" });
    });
});

app.post('/upload', upload.single('lectureFile'), (req, res) => {
    console.log("📥 محاولة رفع ملف...");
    if (!req.file) return res.status(400).send({ message: "يرجى اختيار ملف" });
    const { title, target_level, doctor_id } = req.body;
    const filePath = req.file.path.replace(/\\/g, "/");
    db.query("INSERT INTO lectures (title, file_path, target_level, doctor_id) VALUES (?, ?, ?, ?)", [title, filePath, target_level, doctor_id], (err) => {
        if (err) return res.status(500).send({ message: "فشل الرفع" });
        res.send({ message: "تم نشر المحاضرة بنجاح!" });
    });
});

app.get('/get-lectures/:level', (req, res) => {
    db.query("SELECT * FROM lectures WHERE target_level = ? OR target_level = 'all' ORDER BY id DESC", [req.params.level], (err, results) => {
        if (err) return res.status(500).send(err);
        res.send(results);
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على المنفذ: ${PORT}`));
