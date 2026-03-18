# INDIVIDUAL_REPORT_67543210014-6.md

## ข้อมูลผู้จัดทำ
- ชื่อ-นามสกุล: นายจิรกิตติ์ คำป่าตัน
- รหัสนักศึกษา: 67543210014-6
- กลุ่ม: sec2 group4

## ขอบเขตงานที่รับผิดชอบ
รับผิดชอบการออกแบบและพัฒนาระบบ Backend แบบ Microservices ทั้งหมด (Auth Service, Task Service, Activity Service), การวางโครงสร้างและตั้งค่า Database ประจำแต่ละ Service, รวมถึงการทำ Deployment จัดการ Configuration ผ่าน Docker Compose (Local) และ Railway Cloud (Production)

## สิ่งที่ได้ดำเนินการด้วยตนเอง
- พัฒนาและเพิ่ม **Activity Service** เพื่อเป็นศูนย์กลางการเก็บ Log เหตุการณ์ต่างๆ ของระบบผ่าน REST API แบบ Fire-and-Forget
- ปรับแก้ระบบฐานข้อมูลจาก Shared Database เป็น **Database-per-Service** โดยแยก `init.sql` ออกเป็น 3 ส่วน (authdb, taskdb, activitydb)
- ปรับแต่งการเชื่อมต่อฐานข้อมูลใน `db.js` และ `index.js` ของทุก Service ให้สามารถอ่านค่า `DATABASE_URL` ที่สร้างจาก Railway ได้อัตโนมัติ 
- สร้าง Query สำหรับ Auto-Initialize ข้อมูล (`CREATE TABLE IF NOT EXISTS`) ในฝั่ง Backend เพื่อแก้ปัญหา Database ว่างเปล่าขณะ Deploy ขึ้น Railway
- แก้ไขปัญหา Cross-Database Join ใน `task-service` โดยดึงข้อมูล Username ผ่าน JWT Payload แทนการข้ามไป JOIN กับตาราง Users ตรงๆ เพื่อให้ถูกต้องตามหลักสถาปัตยกรรม Microservices
- อัปเดต `docker-compose.yml` ให้สะท้อนโครงสร้างฐานข้อมูลใหม่สำหรับการทดสอบในเครื่อง

## ปัญหาที่พบและวิธีการแก้ไข
1. **ปัญหา Database Connection บน Railway (500 Error ใน Login)**: เมื่อ Deploy ขึ้นระบบ Railway พบว่า Backend ไม่สามารถเชื่อมต่อกับ Database ได้เนื่องจากตัวแปรแวดล้อมต่างกับการรัน Local 
   - **วิธีแก้ไข**: ปรับปรุงโค้ด `pool` ใน `pg` ให้เช็ค `process.env.DATABASE_URL` และเซ็ตค่า `ssl: { rejectUnauthorized: false }` หาก URL มาจาก `railway.app`
2. **ปัญหาตารางหาย และ Cross-Database Join**: Service `task-service` พังเมื่อดึงงานทั้งหมดเนื่องจากเผลอไป `JOIN` กับตาราง `users` ซึ่งไม่อยู่ใน `taskdb`
   - **วิธีแก้ไข**: นำ `JOIN` ออก และใช้ `username` ใน Token ที่ถูก Sign มาจาก Auth Service แทน นอกจากนี้ได้เพิ่ม Auto Initialization Script แทรกไว้ใน `index.js` ให้สร้างตารางทันทีที่ Boot ระบบหากตรวจพบว่าฐานข้อมูลยังว่างเปล่า

## สิ่งที่ได้เรียนรู้จากงานนี้
- **Database-per-Service Trade-off**: การแยกฐานข้อมูลทำให้ระบบมีความเป็นอิสระต่อกัน (Loose Coupling) แต่ตามมาด้วยข้อจำกัดในการทำ Data Aggregation (เช่นไม่สามารถ JOIN ตารางต่าง Database ได้) ต้องวางแผน Data Duplication หรือใช้ Token ในการส่งข้อมูลแทน
- **Deployment & Config Management**: การเตรียมพร้อม Environment Variables เป็นสิ่งสำคัญมาก โค้ดควรยืดหยุ่นพอที่จะทนต่อสภาพแวดล้อมที่ต่างกันระหว่าง Local (Docker) และ Cloud (Railway)

## แนวทางการพัฒนาต่อไป
ในอนาคตควรพัฒนาการสื่อสารระหว่าง Service จาก HTTP REST เป็น Message Broker เช่น RabbitMQ หรือ Kafka (Event-Driven Architecture) สำหรับการยิง Log Activity เพื่อรับประกันว่าข้อมูลจะไม่สูญหายระหว่างทางหาก Activity Service ล่ม (Resilience) และควรนำ Nginx หรือ API Gateway ตัวกลางกลับมาใช้สำหรับ Route Management บน Cloud เพื่อบังคับ Security Policy ที่จุดเดียว
