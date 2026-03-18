# INDIVIDUAL_REPORT_67543210051-8.md

## ข้อมูลผู้จัดทำ
- ชื่อ-นามสกุล: นางสาวกฤตพร แหลมไทย
- รหัสนักศึกษา: 67543210051-8
- กลุ่ม: sec2 group4

## ขอบเขตงานที่รับผิดชอบ
รับผิดชอบออกแบบและพัฒนาระบบ Frontend การทำ Routing และ UI Components รวมไปถึงการ Integrate (เชื่อมต่อ) กับ REST API ของ Microservices ต่างๆ ตลอดจนการจัดการ Configuration ฝั่ง Client

## สิ่งที่ได้ดำเนินการด้วยตนเอง
- ปรับแต่ง Configuration ไฟล์ `config.js` ให้สามารถจัดการ Mapping URL ของ API Endpoint ในแต่ล่ะ Service (`AUTH_URL`, `TASK_URL`, `ACTIVITY_URL`) แบบแยกส่วนกัน ทำให้ง่ายต่อการสลับใช้งานระหว่าง Localhost และ Railway
- พัฒนาโครงสร้างหน้าเว็บใน `index.html` โดยลบบางฟังก์ชันที่ไม่จำเป็นออก และเพิ่มแบบฟอร์มการ "สมัครสมาชิก (Register)" กลับเข้าไปให้สามารถทำงานร่วมกับ Auth Service โฉมใหม่ได้
- สร้างหน้าปัดและ UI ของ **Activity Timeline** (`activity.html`) เพื่อแสดงพฤติกรรมของ Users เช่น การ Login, การสร้าง Task ใหม่ พร้อมทั้งระบบ Filter สีของ Badge ตาม `event_type` 
- ใช้ Javascript `fetch` แบบ Asynchronous เพื่อดึงข้อมูลข้าม Service ปรับแต่งการแนบ JWT Authorization Headers พร้อมแจ้งเตือน Feedback บน UI เวลาเกิด Error หรือ 401 Unauthorized

## ปัญหาที่พบและวิธีการแก้ไข
1. **ปัญหาการเรียก Request จากหน้าเว็บเดียวไปยัง 3 Service ต่างๆ**: การแยก Backend ออกเป็น 3 ตัวส่งผลให้การ Hardcode Base URL ไม่สามารถทำได้ ทำให้เวลา Deploy ไปที่ Railway ไม่สามารถเชื่อมต่อ API ได้
   - **วิธีแก้ไข**: สร้างไฟล์ `config.js` ขึ้นมาตรงกลาง และฉีด Global Object (`window.APP_CONFIG`) เข้าไป ทำให้สคริปต์ใน HTML ทุกตัวสามารถอ้างอิง Service URL ที่ถูกต้องได้เสมอ
2. **ปัญหา UI / UX ของ Activity Timeline ขาดความชัดเจน**: เมื่อข้อมูล Logs มีมาก ทำให้สับสนว่าแต่ละอันคืออะไร
   - **วิธีแก้ไข**: ทำระบบ Dictionary ใน Javascript แม็ปประเภท Event กับ Color และ Icon (`USER_REGISTERED` -> สีเขียว, `TASK_DELETED` -> สีแดง) ทำให้หน้า Timeline อ่านง่ายขึ้น และวางระบบ Auto-Fetch ข้อมูล 

## สิ่งที่ได้เรียนรู้จากงานนี้
- **Frontend as an API Consumer**: ได้เรียนรู้วิธีการสถาปัตยกรรมที่ Frontend ถูกรันเป็นก้อนอิสระ (Static Client) แยกขาดจาก Backend แล้วทำหน้าที่เพียงแค่ดึงข้อมูลผ่าน HTTP Request เท่านั้น 
- **CORS & Authentication Flow**: การทำงานข้าม Domain ของ Service 3 ตัวบน Railway ทำให้ต้องคำนึงเรื่อง Cross-Origin Resource Sharing และการเก็บ/ดึง/ตรวจสอบ JWT Session อย่างรัดกุมผ่าน `localStorage`

## แนวทางการพัฒนาต่อไป
หากจะต่อยอดต่อไป ควรปรับเปลี่ยนเทคโนโลยี Frontend จาก Vanilla HTML/JS เป็น Framework ที่ทันสมัยขึ้นเช่น React หรือ Vue.js เพื่อจัดการ State ภายในแอพพลิเคชันได้ดีขึ้น (ลดอาการหน่วงและโค้ดรก) และสามารถทำหน้า Dashboard Admin ให้ควบคุมข้อมูล Microservices รวมไว้ในที่เดียวกันได้ชัดเจนขึ้น
